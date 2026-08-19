-- ============================================================================
-- commerce_delivery
--
-- Backs /food/checkout, /food/favorites, /food/orders/[orderId]/track and the
-- rider side of BLUEPRINT §24.
--
-- WHY DELIVERY IS ITS OWN TABLE
--   §24 makes the case: an order's fulfilment and its delivery are two state
--   machines, not one. A vendor can have food ready while no rider has accepted;
--   a rider can be en route while the vendor considers the order done. Folding
--   both into `orders.status` produces states like 'ready_but_unassigned' that
--   multiply every time either side gains a step. One row per delivery, with its
--   own status, keeps them independent.
--
-- THE LOCATION PRIVACY PROBLEM
--   A student must see their rider's position, but only while that rider is
--   carrying their order — not before, not after, and never for other riders.
--   A standing read grant on rider_profiles.current_geo would leak every rider's
--   live position to everyone. Solved below with `active_delivery_positions`, a
--   security_invoker view whose predicate ties visibility to an in-flight
--   delivery the caller is party to.
--
-- ROLLBACK
--   drop view if exists public.active_delivery_positions;
--   drop table if exists public.delivery_offers, public.deliveries,
--                        public.order_events, public.cart_items, public.carts,
--                        public.favorites cascade;
-- ============================================================================

-- ── 1. Carts ────────────────────────────────────────────────────────────────
-- One open cart per student per vendor: you cannot mix two kitchens into one
-- order, because fulfilment and payout are per vendor. Enforced by a partial
-- unique index rather than application discipline.
create table if not exists public.carts (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  vendor_id  uuid not null references public.vendor_profiles (id) on delete cascade,
  status     text not null default 'open' check (status in ('open', 'ordered', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists carts_one_open_per_vendor_idx
  on public.carts (student_id, vendor_id)
  where status = 'open';

create table if not exists public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  quantity   integer not null default 1 check (quantity > 0),
  -- Price is captured when the item is added. If the vendor reprices mid-session
  -- the cart must not silently change under the student; checkout re-validates
  -- against the live listing and surfaces the difference.
  unit_price_kobo bigint not null check (unit_price_kobo >= 0),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, listing_id)
);

create index if not exists cart_items_cart_idx on public.cart_items (cart_id);

-- ── 2. Favorites ────────────────────────────────────────────────────────────
-- Polymorphic by design: /food/favorites saves vendors AND dishes, and the same
-- table serves events later. `saved_hostels` (0006) stays as-is — it predates
-- this and rewriting it would be churn for no gain.
create table if not exists public.favorites (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  entity_type  text not null check (entity_type in ('vendor', 'listing', 'event', 'service', 'hotspot')),
  entity_id    uuid not null,
  created_at   timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

create index if not exists favorites_user_idx on public.favorites (user_id, entity_type);

-- ── 3. Order event log ──────────────────────────────────────────────────────
-- Same reasoning as service_request_events: the tracking screen needs an
-- ordered history, not a single mutable status.
create table if not exists public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  from_status text,
  to_status   text not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

create or replace function public.log_order_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, actor_id, to_status)
    values (new.id, auth.uid(), new.status);
  elsif new.status is distinct from old.status then
    insert into public.order_events (order_id, actor_id, from_status, to_status)
    values (new.id, auth.uid(), old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_log_event on public.orders;
create trigger orders_log_event
  after insert or update on public.orders
  for each row execute function public.log_order_event();

-- ── 4. Deliveries ───────────────────────────────────────────────────────────
create table if not exists public.deliveries (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references public.orders (id) on delete cascade,
  rider_id      uuid references public.profiles (id) on delete set null,

  status text not null default 'pending' check (status in (
    'pending',    -- order placed, no rider yet
    'offered',    -- offered to one or more riders
    'assigned',   -- a rider accepted
    'picked_up',  -- collected from the vendor
    'delivering',
    'delivered',
    'failed',
    'cancelled'
  )),

  pickup_address   text,
  pickup_geo       extensions.geography(Point, 4326),
  dropoff_address  text not null,
  dropoff_geo      extensions.geography(Point, 4326),
  distance_meters  integer check (distance_meters >= 0),
  fee_kobo         bigint  not null default 0 check (fee_kobo >= 0),

  -- §24: a delivery is confirmed by a code the student reads out, with a manual
  -- fallback. Stored hashed — a leaked table must not let anyone close out
  -- deliveries they never made.
  confirmation_code_hash text,
  confirmed_by           text check (confirmed_by in ('code', 'manual', 'auto')),

  assigned_at   timestamptz,
  picked_up_at  timestamptz,
  delivered_at  timestamptz,
  failure_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists deliveries_rider_idx on public.deliveries (rider_id, status);
create index if not exists deliveries_open_idx  on public.deliveries (created_at)
  where status in ('pending', 'offered');

-- ── 5. Delivery offers — the acceptance race ────────────────────────────────
-- §24 warns about two riders accepting the same job. The unique index on
-- (delivery_id) where accepted is the fix: the second accept violates the
-- constraint and loses, deterministically, in the database rather than in a
-- read-then-write window in application code.
create table if not exists public.delivery_offers (
  id          uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  rider_id    uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'offered'
                check (status in ('offered', 'accepted', 'declined', 'expired')),
  offered_at  timestamptz not null default now(),
  responded_at timestamptz,
  expires_at  timestamptz not null default now() + interval '60 seconds',
  unique (delivery_id, rider_id)
);

create unique index if not exists delivery_offers_one_accepted_idx
  on public.delivery_offers (delivery_id)
  where status = 'accepted';

create index if not exists delivery_offers_rider_open_idx
  on public.delivery_offers (rider_id, status) where status = 'offered';

-- ── 6. Live rider position, scoped to an active delivery ────────────────────
-- security_invoker so the caller's own RLS applies to the underlying tables,
-- and the predicate limits rows to deliveries the caller is party to and that
-- are actually in flight. A rider idling between jobs is invisible.
create or replace view public.active_delivery_positions
with (security_invoker = true) as
select
  d.id          as delivery_id,
  d.order_id,
  d.rider_id,
  d.status,
  rp.current_geo,
  rp.last_seen_at
from public.deliveries d
join public.rider_profiles rp on rp.id = d.rider_id
where d.status in ('assigned', 'picked_up', 'delivering');

comment on view public.active_delivery_positions is
  'Rider location, visible only while a delivery is in flight. Never expose rider_profiles.current_geo directly.';

-- ── 7. Guards ───────────────────────────────────────────────────────────────
-- A rider must not set their own fee, and neither party may rewrite the code
-- hash or backdate a delivery.
create or replace function public.guard_delivery_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.order_id               := old.order_id;
    new.fee_kobo               := old.fee_kobo;
    new.confirmation_code_hash := old.confirmation_code_hash;
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_guard on public.deliveries;
create trigger deliveries_guard
  before update on public.deliveries
  for each row execute function public.guard_delivery_cols();

-- Cart items must not be repriced by the client after the fact.
create or replace function public.guard_cart_item_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.unit_price_kobo := old.unit_price_kobo;
    new.listing_id      := old.listing_id;
  end if;
  return new;
end;
$$;

drop trigger if exists cart_items_guard on public.cart_items;
create trigger cart_items_guard
  before update on public.cart_items
  for each row execute function public.guard_cart_item_cols();

-- ── 8. RLS ──────────────────────────────────────────────────────────────────
alter table public.carts           enable row level security;
alter table public.cart_items      enable row level security;
alter table public.favorites       enable row level security;
alter table public.order_events    enable row level security;
alter table public.deliveries      enable row level security;
alter table public.delivery_offers enable row level security;

drop policy if exists "carts_own" on public.carts;
create policy "carts_own" on public.carts
  for all to authenticated
  using ((select auth.uid()) = student_id)
  with check ((select auth.uid()) = student_id);

drop policy if exists "cart_items_own" on public.cart_items;
create policy "cart_items_own" on public.cart_items
  for all to authenticated
  using (exists (select 1 from public.carts c
                  where c.id = cart_id and c.student_id = (select auth.uid())))
  with check (exists (select 1 from public.carts c
                       where c.id = cart_id and c.student_id = (select auth.uid())));

drop policy if exists "favorites_own" on public.favorites;
create policy "favorites_own" on public.favorites
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Order history: both parties, plus the assigned rider (who needs to see the
-- order progress to know when to collect).
drop policy if exists "order_events_select" on public.order_events;
create policy "order_events_select" on public.order_events
  for select to authenticated
  using (exists (
    select 1 from public.orders o
     left join public.deliveries d on d.order_id = o.id
     where o.id = order_id
       and (select auth.uid()) in (o.student_id, o.vendor_id, d.rider_id)
  ));

-- Deliveries: student and vendor of the order, plus the assigned rider.
drop policy if exists "deliveries_select_party" on public.deliveries;
create policy "deliveries_select_party" on public.deliveries
  for select to authenticated
  using (
    (select auth.uid()) = rider_id
    or exists (select 1 from public.orders o
                where o.id = order_id
                  and (select auth.uid()) in (o.student_id, o.vendor_id))
  );

-- Only the assigned rider advances a delivery. The vendor does not mark it
-- delivered, and the student certainly does not.
drop policy if exists "deliveries_update_rider" on public.deliveries;
create policy "deliveries_update_rider" on public.deliveries
  for update to authenticated
  using ((select auth.uid()) = rider_id)
  with check ((select auth.uid()) = rider_id);

drop policy if exists "deliveries_staff" on public.deliveries;
create policy "deliveries_staff" on public.deliveries
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- A rider sees only their own offers — never the pool, which would leak demand
-- patterns and let a rider enumerate other riders' work.
drop policy if exists "delivery_offers_own" on public.delivery_offers;
create policy "delivery_offers_own" on public.delivery_offers
  for select to authenticated using ((select auth.uid()) = rider_id);

drop policy if exists "delivery_offers_respond" on public.delivery_offers;
create policy "delivery_offers_respond" on public.delivery_offers
  for update to authenticated
  using ((select auth.uid()) = rider_id and status = 'offered')
  with check ((select auth.uid()) = rider_id);

-- ── 9. Grants ───────────────────────────────────────────────────────────────
revoke all on public.carts           from anon, authenticated;
revoke all on public.cart_items      from anon, authenticated;
revoke all on public.favorites       from anon, authenticated;
revoke all on public.order_events    from anon, authenticated;
revoke all on public.deliveries      from anon, authenticated;
revoke all on public.delivery_offers from anon, authenticated;

grant select, insert, update, delete on public.carts      to authenticated;
grant select, insert, update, delete on public.cart_items to authenticated;
grant select, insert, delete         on public.favorites  to authenticated;
grant select                         on public.order_events    to authenticated;
grant select, update                 on public.deliveries      to authenticated;
grant select, update                 on public.delivery_offers to authenticated;
grant select                         on public.active_delivery_positions to authenticated;

-- ── 10. Verify ──────────────────────────────────────────────────────────────
do $$
begin
  -- The acceptance race is closed by a constraint, not by application code.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'delivery_offers_one_accepted_idx'
  ) then
    raise exception 'the single-accepted-offer index is missing; the dispatch race is open';
  end if;

  -- Riders must not be able to create deliveries out of thin air.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'deliveries'
       and grantee = 'authenticated' and privilege_type = 'INSERT'
  ) then
    raise exception 'deliveries must be created server-side, not by clients';
  end if;

  raise notice 'commerce + delivery ready: carts, favorites, order log, dispatch.';
end $$;
