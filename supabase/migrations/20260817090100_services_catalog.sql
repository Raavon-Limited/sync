-- ============================================================================
-- services_catalog
--
-- Backs /beauty, /laundry, /workmanship and /hotspots.
--
-- WHY THESE ARE NOT `listings`
--   `listings` (from 0006) models a stocked product: it has `stock` and `sold`
--   and is bought through `orders`. A haircut, a laundry bag and a plumbing
--   callout have no stock — they are booked for a time, negotiated on price, or
--   quoted per job. Forcing all four through one table means a `stock` column
--   that is meaningless for three of them and a status machine that fits none.
--
--   So: `services` is the catalogue (what a vendor offers, at what rate) and
--   `service_requests` is the transaction (a student asking for one). Food keeps
--   `listings` + `orders`, which already work.
--
-- PRICING MODELS
--   fixed      — beauty: ₦3,500 for a haircut.
--   per_unit   — laundry: ₦300 per kg, quantity supplied at request time.
--   quote      — workmanship: price is null until the tradesman responds.
--   Enforced by a check constraint, not convention.
--
-- ROLLBACK
--   drop table if exists public.service_request_events, public.service_requests,
--                        public.services, public.service_categories,
--                        public.hotspots cascade;
-- ============================================================================

-- ── 1. Service categories ───────────────────────────────────────────────────
-- Reference data driving the filter chips on each vertical's index page.
create table if not exists public.service_categories (
  id         uuid primary key default gen_random_uuid(),
  vertical   text not null check (vertical in ('beauty', 'laundry', 'workmanship')),
  slug       text not null,
  name       text not null,
  icon       text,
  sort_order integer     not null default 0,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vertical, slug)
);
insert into public.service_categories (vertical, slug, name, sort_order) values
  ('beauty',      'braiding',    'Braiding',     1),
  ('beauty',      'barbing',     'Barbing',      2),
  ('beauty',      'nails',       'Nails',        3),
  ('beauty',      'makeup',      'Makeup',       4),
  ('laundry',     'wash-fold',   'Wash & Fold',  1),
  ('laundry',     'dry-clean',   'Dry Cleaning', 2),
  ('laundry',     'ironing',     'Ironing',      3),
  ('workmanship', 'carpenter',   'Carpenter',    1),
  ('workmanship', 'plumber',     'Plumber',      2),
  ('workmanship', 'tailor',      'Tailor',       3),
  ('workmanship', 'electrician', 'Electrician',  4),
  ('workmanship', 'mechanic',    'Mechanic',     5),
  ('workmanship', 'painter',     'Painter',      6)
on conflict (vertical, slug) do nothing;
-- ── 2. Services — what a vendor offers ──────────────────────────────────────
create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendor_profiles (id) on delete cascade,
  category_id   uuid references public.service_categories (id) on delete set null,
  vertical      text not null check (vertical in ('beauty', 'laundry', 'workmanship')),
  name          text not null,
  description   text,
  image_url     text,
  pricing_model text not null default 'fixed'
                  check (pricing_model in ('fixed', 'per_unit', 'quote')),
  price_kobo    bigint check (price_kobo >= 0),
  unit_label    text,
  duration_mins integer check (duration_mins > 0),
  is_active     boolean     not null default true,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A fixed or per-unit service must carry a price; a quote must not pretend to.
  constraint services_price_matches_model check (
    (pricing_model = 'quote'    and price_kobo is null) or
    (pricing_model = 'fixed'    and price_kobo is not null) or
    (pricing_model = 'per_unit' and price_kobo is not null and unit_label is not null)
  )
);
create index if not exists services_vendor_idx   on public.services (vendor_id, is_active);
create index if not exists services_vertical_idx on public.services (vertical) where archived_at is null;
create index if not exists services_category_idx on public.services (category_id);
-- ── 3. Service requests — the transaction ───────────────────────────────────
-- One status machine covering all three verticals. `quoted` only ever appears
-- for pricing_model='quote'; the rest skip straight from requested to accepted.
create table if not exists public.service_requests (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  student_id     uuid not null references public.profiles (id) on delete cascade,
  vendor_id      uuid not null references public.vendor_profiles (id) on delete restrict,
  service_id     uuid references public.services (id) on delete set null,
  vertical       text not null check (vertical in ('beauty', 'laundry', 'workmanship')),

  status text not null default 'requested' check (status in (
    'requested',   -- student submitted
    'quoted',      -- vendor proposed a price (quote model only)
    'accepted',    -- both sides agreed
    'scheduled',   -- a time is fixed
    'in_progress',
    'completed',
    'cancelled',
    'declined'
  )),

  -- Snapshot at request time. The service row may be edited or archived later;
  -- the request must still say what was actually agreed.
  quantity       numeric(10,2) check (quantity > 0),
  unit_label     text,
  quoted_kobo    bigint check (quoted_kobo >= 0),
  agreed_kobo    bigint check (agreed_kobo >= 0),

  scheduled_for  timestamptz,
  address        text,
  area           text,
  geo            extensions.geography(Point, 4326),
  notes          text,
  cancel_reason  text,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists service_requests_student_idx on public.service_requests (student_id, created_at desc);
create index if not exists service_requests_vendor_idx  on public.service_requests (vendor_id, status);
create index if not exists service_requests_sched_idx   on public.service_requests (scheduled_for)
  where status in ('accepted', 'scheduled');
-- Human-readable code (SRQ-000123) so support can refer to a request by name.
create sequence if not exists public.service_request_code_seq;
create or replace function public.set_service_request_code()
returns trigger language plpgsql as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'SRQ-' || lpad(nextval('public.service_request_code_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists service_requests_set_code on public.service_requests;
create trigger service_requests_set_code
  before insert on public.service_requests
  for each row execute function public.set_service_request_code();
-- ── 4. Request event log ────────────────────────────────────────────────────
-- Every status change, appended. Drives the timeline UI and answers "who
-- cancelled this and when" without guessing from updated_at.
create table if not exists public.service_request_events (
  id         bigint generated always as identity primary key,
  request_id uuid not null references public.service_requests (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  from_status text,
  to_status   text not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists service_request_events_request_idx
  on public.service_request_events (request_id, created_at);
create or replace function public.log_service_request_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.service_request_events (request_id, actor_id, to_status)
    values (new.id, auth.uid(), new.status);
  elsif new.status is distinct from old.status then
    insert into public.service_request_events (request_id, actor_id, from_status, to_status)
    values (new.id, auth.uid(), old.status, new.status);
  end if;
  return new;
end;
$$;
drop trigger if exists service_requests_log_event on public.service_requests;
create trigger service_requests_log_event
  after insert or update on public.service_requests
  for each row execute function public.log_service_request_event();
-- Money columns are not client-writable: a student must not set agreed_kobo,
-- and a vendor must not rewrite it after acceptance.
create or replace function public.guard_service_request_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.code         := old.code;
    new.student_id   := old.student_id;
    new.vendor_id    := old.vendor_id;
    -- agreed_kobo is settled server-side when the request is accepted.
    if old.status not in ('requested', 'quoted') then
      new.agreed_kobo := old.agreed_kobo;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists service_requests_guard on public.service_requests;
create trigger service_requests_guard
  before update on public.service_requests
  for each row execute function public.guard_service_request_cols();
-- ── 5. Hotspots ─────────────────────────────────────────────────────────────
-- Editorial places on the /hotspots map and the /around view. Curated by staff,
-- not user-generated, so there is no owner column and no write policy.
create table if not exists public.hotspots (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  category    text not null,
  description text,
  image_url   text,
  address     text,
  area        text,
  campus_id   uuid references public.campuses (id) on delete set null,
  geo         extensions.geography(Point, 4326),
  opens_at    time,
  closes_at   time,
  is_featured boolean     not null default false,
  is_active   boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists hotspots_geo_idx      on public.hotspots using gist (geo);
create index if not exists hotspots_category_idx on public.hotspots (category) where is_active;
-- ── 6. RLS ──────────────────────────────────────────────────────────────────
alter table public.service_categories     enable row level security;
alter table public.services               enable row level security;
alter table public.service_requests       enable row level security;
alter table public.service_request_events enable row level security;
alter table public.hotspots               enable row level security;
-- Public browse.
drop policy if exists "service_categories_select" on public.service_categories;
create policy "service_categories_select" on public.service_categories
  for select to anon, authenticated using (is_active);
drop policy if exists "services_select_active" on public.services;
create policy "services_select_active" on public.services
  for select to anon, authenticated using (archived_at is null and is_active);
drop policy if exists "hotspots_select_active" on public.hotspots;
create policy "hotspots_select_active" on public.hotspots
  for select to anon, authenticated using (is_active);
-- A vendor manages their own catalogue.
drop policy if exists "services_write_own" on public.services;
create policy "services_write_own" on public.services
  for all to authenticated
  using ((select auth.uid()) = vendor_id)
  with check ((select auth.uid()) = vendor_id);
-- Two-party: separate policies per side, because the two sides may do
-- different things. A student creates and cancels; a vendor quotes and fulfils.
drop policy if exists "service_requests_select_party" on public.service_requests;
create policy "service_requests_select_party" on public.service_requests
  for select to authenticated
  using ((select auth.uid()) in (student_id, vendor_id));
drop policy if exists "service_requests_insert_student" on public.service_requests;
create policy "service_requests_insert_student" on public.service_requests
  for insert to authenticated with check ((select auth.uid()) = student_id);
drop policy if exists "service_requests_update_party" on public.service_requests;
create policy "service_requests_update_party" on public.service_requests
  for update to authenticated
  using ((select auth.uid()) in (student_id, vendor_id))
  with check ((select auth.uid()) in (student_id, vendor_id));
drop policy if exists "service_requests_staff" on public.service_requests;
create policy "service_requests_staff" on public.service_requests
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
-- Events are readable by either party, written only by the trigger.
drop policy if exists "service_request_events_select" on public.service_request_events;
create policy "service_request_events_select" on public.service_request_events
  for select to authenticated
  using (exists (
    select 1 from public.service_requests r
     where r.id = request_id
       and (select auth.uid()) in (r.student_id, r.vendor_id)
  ));
-- ── 7. Grants ───────────────────────────────────────────────────────────────
revoke all on public.service_categories     from anon, authenticated;
revoke all on public.services               from anon, authenticated;
revoke all on public.service_requests       from anon, authenticated;
revoke all on public.service_request_events from anon, authenticated;
revoke all on public.hotspots               from anon, authenticated;
grant select                         on public.service_categories to anon, authenticated;
grant select                         on public.services           to anon, authenticated;
grant insert, update, delete         on public.services           to authenticated;
grant select, insert, update         on public.service_requests   to authenticated;
grant select                         on public.service_request_events to authenticated;
grant select                         on public.hotspots           to anon, authenticated;
-- No client INSERT on the event log: it is trigger-written only. The trigger is
-- SECURITY DEFINER, so it does not need the grant.

-- ── 8. Verify ───────────────────────────────────────────────────────────────
do $$
declare
  bad_grants int;
begin
  select count(*) into bad_grants
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name   = 'service_request_events'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

  if bad_grants > 0 then
    raise exception 'service_request_events must be trigger-written only (% grants)', bad_grants;
  end if;

  raise notice 'services catalog ready: 3 verticals, % categories, hotspots live.',
    (select count(*) from public.service_categories);
end $$;
