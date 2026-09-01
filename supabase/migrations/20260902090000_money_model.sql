-- ============================================================================
-- money_model
--
-- Who pays Sync, and when.
--
--   vendor, landlord   a subscription, plus a per-order service charge
--   student            5% of the goods, capped at ₦2,000, shown on the invoice
--                      BEFORE they pay
--   restaurant/vendor  5% of the goods, capped at ₦2,000, deducted when their
--                      escrow releases
--   rider              5% of the delivery fee, capped at ₦2,000, deducted when
--                      their escrow releases
--   landlord on rent   2.5% of the rent, deducted when the rent releases
--
-- ₦5,000 jollof with a ₦1,500 delivery: the student pays ₦6,750, the restaurant
-- nets ₦4,750, the rider nets ₦1,425, and Sync takes ₦575 across the three.
--
-- EVERY CHARGE IS FROZEN AT CREATION AND DEDUCTED AT RELEASE
--   `escrow_holds.commission_kobo` already worked exactly this way for the old
--   10%, and release_order_escrow already subtracts it and posts the remainder
--   to platform_revenue. So the rate changes and the column does not: a vendor
--   looking at a held order sees what they will actually receive before they
--   cook, and nothing is taken until the money is theirs to be taken from.
--
--   Holds created under the old 10% KEEP it. Those vendors were told that at
--   the time. Rewriting settled money to match a new policy is an adjustment
--   somebody has to explain, not a migration.
--
-- THE RIDER'S MONEY IS ESCROWED TOO, ON A FOURTH SUBJECT
--   A delivery hold cannot carry `order_id`: release_order_escrow, cancel_order
--   and resolve_dispute all do `select * into v_hold ... where order_id = X`,
--   and a second row on the same order would have them pick one at random and
--   move the wrong money. Adding a `kind` column would mean restating all three
--   — three rewrites of live money code, each with a silent wrong-row failure.
--
--   `delivery_id` as a fourth subject avoids every bit of that. The subject IS
--   the kind, and those functions keep working untouched because a delivery
--   hold's order_id is null, so their lookups never match it.
--
-- payee_id BECOMES NULLABLE, FOR ONE REASON
--   The delivery is escrowed at checkout and no rider has taken it yet. It is
--   filled in by claim_delivery. A hold with money and no payee is exactly what
--   an unclaimed job is.
--
-- ROLLBACK
--   drop function if exists public.release_delivery_escrow(uuid);
--   drop function if exists public.quote_delivery(uuid, double precision, double precision);
--   drop function if exists private.capped_charge(bigint, text, text, integer, bigint);
--   alter table public.escrow_holds drop column if exists delivery_id;
--   alter table public.escrow_holds alter column payee_id set not null;
--   update public.app_settings set value = '10'::jsonb where key = 'commission_pct';
--   -- and restore apply_escrow_settings / checkout_cart / claim_delivery /
--   -- advance_delivery from 20260827090000, 20260829091000, 20260901270000,
--   -- 20260901280000.
-- ============================================================================

-- ── 1. Rates ────────────────────────────────────────────────────────────────
insert into public.app_settings (key, value) values
  ('service_charge_pct',      '5'::jsonb),
  ('service_charge_cap_kobo', '200000'::jsonb),   -- ₦2,000
  ('rider_charge_pct',        '5'::jsonb),
  ('rider_charge_cap_kobo',   '200000'::jsonb),   -- ₦2,000
  -- Rent is a much larger number and a much rarer event, so it is a smaller
  -- share and is deliberately UNCAPPED — a cap here would make the charge on a
  -- ₦400,000 room the same as on a ₦80,000 one.
  ('rent_charge_pct',         '2.5'::jsonb),
  ('delivery_base_kobo',      '30000'::jsonb),    -- ₦300 flag-fall
  ('delivery_per_km_kobo',    '10000'::jsonb),    -- ₦100 / km
  ('delivery_min_kobo',       '30000'::jsonb),    -- ₦300 floor
  -- Beyond this a campus delivery is not a campus delivery. Priced at the
  -- ceiling rather than refused, so an edge-of-town address does not dead-end
  -- checkout.
  ('delivery_max_km',         '20'::jsonb)
on conflict (key) do nothing;

-- The old flat commission is gone. Written to 0 rather than deleted, because
-- `private.setting_int('commission_pct', 10)` falls back to 10 when the key is
-- MISSING — deleting the row would restore the very charge this removes.
update public.app_settings set value = '0'::jsonb where key = 'commission_pct';

-- ── 2. A percentage with a ceiling ──────────────────────────────────────────
create or replace function private.capped_charge(
  p_amount_kobo bigint,
  p_pct_key     text,
  p_cap_key     text,
  p_pct_default integer,
  -- 0 means no ceiling. Rent uses it.
  p_cap_default bigint default 0
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_pct    integer := private.setting_int(p_pct_key, p_pct_default);
  v_cap    bigint;
  v_charge bigint;
begin
  if p_amount_kobo <= 0 or v_pct <= 0 then
    return 0;
  end if;

  -- Integer division floors, which rounds in the payer's favour. On a ₦3,500
  -- order that is a few kobo, and favouring the person being charged is the
  -- right direction to be wrong in.
  v_charge := (p_amount_kobo * v_pct) / 100;

  if p_cap_key is null then
    return v_charge;
  end if;

  v_cap := private.setting_int(p_cap_key, p_cap_default::integer);
  if v_cap <= 0 then
    return v_charge;
  end if;
  return least(v_charge, v_cap);
end;
$fn$;

grant execute on function private.capped_charge(bigint, text, text, integer, bigint) to service_role;

-- Rent's 2.5% is not a whole number of percent, so it cannot go through
-- setting_int. Basis points, floored, no ceiling.
create or replace function private.rent_charge(p_amount_kobo bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_raw jsonb;
  v_bps integer := 250;   -- 2.5%
begin
  if p_amount_kobo <= 0 then
    return 0;
  end if;
  select value into v_raw from public.app_settings where key = 'rent_charge_pct';
  if v_raw is not null and jsonb_typeof(v_raw) = 'number' then
    v_bps := round((v_raw #>> '{}')::numeric * 100)::integer;
  end if;
  return (p_amount_kobo * v_bps) / 10000;
end;
$fn$;

grant execute on function private.rent_charge(bigint) to service_role;

-- ── 3. The fourth subject ───────────────────────────────────────────────────
alter table public.escrow_holds
  add column if not exists delivery_id uuid references public.deliveries (id) on delete cascade;

-- Unclaimed delivery money has no payee yet. See the header.
alter table public.escrow_holds alter column payee_id drop not null;

alter table public.escrow_holds drop constraint if exists escrow_holds_one_subject;
alter table public.escrow_holds add constraint escrow_holds_one_subject check (
  (order_id is not null)::int
  + (booking_id is not null)::int
  + (request_id is not null)::int
  + (delivery_id is not null)::int = 1
);

-- One hold per delivery. The same protection the order side relies on.
create unique index if not exists escrow_holds_one_per_delivery_idx
  on public.escrow_holds (delivery_id) where delivery_id is not null;

comment on column public.escrow_holds.delivery_id is
  'The rider''s fee, held until the order is delivered. payee_id is null until a rider claims the job.';

-- ── 4. What each hold costs its payee ───────────────────────────────────────
create or replace function public.apply_escrow_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hours integer;
begin
  -- Frozen at creation, deducted at release. An explicit value survives — a
  -- negotiated rate or a correction must not be overwritten.
  if new.commission_kobo is null or new.commission_kobo = 0 then
    new.commission_kobo := case
      when new.delivery_id is not null then
        private.capped_charge(new.amount_kobo, 'rider_charge_pct',
                              'rider_charge_cap_kobo', 5, 200000)
      when new.booking_id is not null then
        private.rent_charge(new.amount_kobo)
      else
        private.capped_charge(new.amount_kobo, 'service_charge_pct',
                              'service_charge_cap_kobo', 5, 200000)
    end;
  end if;

  if new.release_after is null then
    -- Rent settles a week after move-in, not a day after payment: the student
    -- has to actually get the room. `move_in` is a date, so this is set from
    -- the booking rather than from now().
    if new.booking_id is not null then
      select coalesce(b.move_in::timestamptz, now()) + interval '7 days'
        into new.release_after
        from public.bookings b where b.id = new.booking_id;
      new.release_after := coalesce(new.release_after, now() + interval '7 days');
    else
      v_hours := private.setting_int('escrow_hold_hours', 24);
      new.release_after := now() + make_interval(hours => v_hours);
    end if;
  end if;

  return new;
end;
$fn$;

comment on function public.apply_escrow_settings is
  'Freezes the platform charge and the maturity window onto a new hold. 5% capped on goods and delivery, 2.5% uncapped on rent (see 20260902090000).';

-- ── 5. What a delivery to this point costs ──────────────────────────────────
-- Callable before checkout, so the fee is on screen BEFORE somebody pays it. A
-- delivery fee that first appears on the receipt is a complaint.
create or replace function public.quote_delivery(
  p_storefront uuid,
  p_lat        double precision,
  p_lng        double precision
)
returns table (distance_meters integer, fee_kobo bigint)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_geo    extensions.geography;
  v_metres double precision;
  v_base   integer := private.setting_int('delivery_base_kobo', 30000);
  v_per_km integer := private.setting_int('delivery_per_km_kobo', 10000);
  v_min    integer := private.setting_int('delivery_min_kobo', 30000);
  v_max_km integer := private.setting_int('delivery_max_km', 20);
begin
  select s.geo into v_geo from public.storefronts s where s.id = p_storefront;

  -- No pin on the store, or no point from the caller: the flag-fall stands in.
  -- Refusing would block checkout over a branch whose owner never dropped a
  -- pin, which is the store's gap and not the student's problem.
  if v_geo is null or p_lat is null or p_lng is null then
    distance_meters := null;
    fee_kobo := greatest(v_base, v_min)::bigint;
    return next;
    return;
  end if;

  v_metres := extensions.ST_Distance(
    v_geo,
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography
  );
  v_metres := least(v_metres, v_max_km * 1000.0);

  distance_meters := round(v_metres)::integer;
  fee_kobo := greatest(v_base + ((v_metres / 1000.0) * v_per_km)::bigint, v_min::bigint);
  return next;
end;
$fn$;

revoke all on function public.quote_delivery(uuid, double precision, double precision) from public, anon;
grant execute on function public.quote_delivery(uuid, double precision, double precision)
  to authenticated, service_role;

comment on function public.quote_delivery is
  'What a delivery from this branch to this point costs, and how far it is. Safe to call before checkout so the fee is visible before it is charged.';

-- ── 6. Paying the rider ─────────────────────────────────────────────────────
-- Mirrors release_order_escrow: idempotent, keyed on a ledger reference, and it
-- refuses to pay a hold nobody has claimed.
create or replace function public.release_delivery_escrow(p_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hold   public.escrow_holds%rowtype;
  v_d      public.deliveries%rowtype;
  v_wallet uuid;
  v_net    bigint;
  v_ref    text;
  v_txn    uuid;
begin
  select * into v_d from public.deliveries where id = p_delivery_id;
  if not found then
    raise exception 'no such delivery' using errcode = 'P0002';
  end if;

  if v_d.status <> 'delivered' then
    raise exception 'That delivery is not complete' using errcode = 'P0001';
  end if;

  select * into v_hold from public.escrow_holds
   where delivery_id = p_delivery_id for update;
  if not found then
    -- Orders placed before this migration have no delivery hold. Not an error:
    -- there is simply nothing to release.
    return null;
  end if;

  if v_hold.payee_id is null then
    raise exception 'That delivery has no rider to pay' using errcode = 'P0001';
  end if;

  v_ref := 'DELIVERY_' || p_delivery_id::text;

  if v_hold.status <> 'held' then
    select id into v_txn from private.ledger_transactions where reference = v_ref;
    return v_txn;
  end if;

  select id into v_txn from private.ledger_transactions where reference = v_ref;
  if v_txn is not null then
    return v_txn;
  end if;

  select id into v_wallet from public.wallets where owner_id = v_hold.payee_id;
  if v_wallet is null then
    raise exception 'rider has no wallet' using errcode = 'P0002';
  end if;

  v_net := v_hold.amount_kobo - v_hold.commission_kobo;

  insert into private.ledger_transactions (reference, kind, entries)
  values (
    v_ref,
    'escrow_release',
    jsonb_build_array(
      jsonb_build_object('wallet_id', v_wallet, 'amount_kobo', v_net),
      jsonb_build_object('account', 'platform_revenue', 'amount_kobo', v_hold.commission_kobo)
    )
  )
  returning id into v_txn;

  update public.escrow_holds
     set status = 'released', released_at = now(), updated_at = now()
   where id = v_hold.id;

  return v_txn;
end;
$fn$;

revoke all on function public.release_delivery_escrow(uuid) from public, anon;
grant execute on function public.release_delivery_escrow(uuid) to authenticated, service_role;

comment on function public.release_delivery_escrow is
  'Pays a rider for a delivered job, less Sync''s frozen cut. Idempotent on the DELIVERY_<id> ledger reference; refuses an unclaimed or incomplete delivery.';
