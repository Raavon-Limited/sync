-- ============================================================================
-- 0006_student_core.sql
--
-- The student-facing core: hostels + rooms, bookings with a 24h payment hold,
-- inspections, vendor orders, saved items, activity, events + tickets.
--
-- Promoted from supabase/drafts/student-overview.draft.sql after review.
-- Idempotent - safe to re-run.
--
-- Design notes (the non-obvious calls):
--   * Room occupancy is DERIVED from bookings, never stored. A stored
--     `available` flag would need a trigger on every booking write plus a cron
--     to release expired holds, and would drift the moment either failed.
--   * A hold's deadline is anchored on the INSPECTION when one is booked,
--     otherwise on the lock: reserved_until = coalesce(inspection, locked_at)
--     + 24h. Lock on the 10th + viewing 2pm on the 15th => expires 2pm the 16th.
--   * Booking an inspection alone holds NOTHING. Only an inspection attached to
--     a locked booking moves the deadline.
--   * Money is in KOBO everywhere (`_kobo` suffix, bigint). Display via
--     formatKobo() in src/lib/utils/format.ts.
--   * Approval is automatic and payment-driven: landlords get no write access
--     to bookings at all.
-- ============================================================================

-- PostGIS goes in `extensions`, not `public`. Installing it into public adds
-- ~1000 objects to the schema and would bury our own tables.
create extension if not exists postgis with schema extensions;

set search_path = public, extensions;

-- ============================================================================
-- HOSTELS
-- ============================================================================

create table if not exists public.hostels (
  id                      uuid primary key default gen_random_uuid(),
  landlord_id             uuid not null references public.profiles (id) on delete cascade,
  name                    text not null,
  slug                    text not null unique,
  address                 text,
  landmark                text,
  -- Must match MALETE_AREAS in src/lib/constants/areas.ts exactly.
  area                    text not null
                            check (area in ('KWASU Gate','Safari','Malete Town','Amao','Nifeskwasu')),
  campus                  text not null default 'KWASU',
  geo                     extensions.geography(Point, 4326),
  room_type               text not null
                            check (room_type in ('Self-contain','Sharing','Female only','Male only')),
  price_per_session_kobo  bigint not null check (price_per_session_kobo >= 0),
  -- ₦5,000 = 500000 kobo. Mirrors LandlordHostel.inspectionFee in the admin UI.
  inspection_fee_kobo     bigint not null default 500000 check (inspection_fee_kobo >= 0),
  distance_minutes        integer,
  amenities               text[] not null default '{}',
  -- Set by the ambassador verification flow only, never by the landlord.
  verified                boolean not null default false,
  ribbon                  text,
  archived_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists hostels_landlord_idx on public.hostels (landlord_id);
create index if not exists hostels_area_idx     on public.hostels (area) where archived_at is null;
create index if not exists hostels_price_idx    on public.hostels (price_per_session_kobo) where archived_at is null;
-- Without this every "near me" is a sequential scan.
create index if not exists hostels_geo_idx      on public.hostels using gist (geo);

create table if not exists public.hostel_images (
  id         uuid primary key default gen_random_uuid(),
  hostel_id  uuid not null references public.hostels (id) on delete cascade,
  url        text not null,
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists hostel_images_hostel_idx on public.hostel_images (hostel_id, position);

-- No `available` column by design - see header. `is_listed` is the one thing
-- the landlord controls directly (maintenance, personal use).
create table if not exists public.hostel_rooms (
  id                      uuid primary key default gen_random_uuid(),
  hostel_id               uuid not null references public.hostels (id) on delete cascade,
  label                   text not null,
  price_per_session_kobo  bigint check (price_per_session_kobo >= 0),  -- null = inherit hostel
  is_listed               boolean not null default true,
  created_at              timestamptz not null default now(),
  unique (hostel_id, label)
);
create index if not exists hostel_rooms_hostel_idx on public.hostel_rooms (hostel_id);

-- ============================================================================
-- BOOKINGS
-- ============================================================================

create table if not exists public.bookings (
  id                      uuid primary key default gen_random_uuid(),
  student_id              uuid not null references public.profiles     (id) on delete cascade,
  hostel_id               uuid not null references public.hostels      (id) on delete restrict,
  room_id                 uuid references public.hostel_rooms (id) on delete set null,
  status                  text not null default 'interested'
                            check (status in ('interested','requested','awaiting_payment',
                                              'confirmed','expired','cancelled','completed')),
  locked_at               timestamptz,
  -- Trigger-maintained, never client-written.
  reserved_until          timestamptz,
  move_in                 date,
  end_date                date,
  price_per_session_kobo  bigint check (price_per_session_kobo >= 0),
  paid_at                 timestamptz,
  payment_reference       text unique,
  requested_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (end_date is null or move_in is null or end_date >= move_in),
  check (status <> 'awaiting_payment' or reserved_until is not null)
);

create index if not exists bookings_student_idx on public.bookings (student_id, status);
create index if not exists bookings_hostel_idx  on public.bookings (hostel_id, status);
create index if not exists bookings_holds_idx   on public.bookings (reserved_until)
  where status = 'awaiting_payment';

create unique index if not exists bookings_one_live_per_student_idx
  on public.bookings (student_id, hostel_id)
  where status in ('interested','requested','awaiting_payment','confirmed');

-- Two students must never hold the same room. Index predicates must be
-- immutable, so this cannot test `reserved_until > now()` - a lapsed-but-
-- unswept row still blocks re-reservation. Mitigate with expire_stale_holds()
-- on a cron AND from the reserve server action. Display correctness never
-- depends on the sweep.
create unique index if not exists bookings_one_hold_per_room_idx
  on public.bookings (room_id)
  where status in ('awaiting_payment','confirmed');

-- ============================================================================
-- INSPECTIONS (student viewing) - booking_id NULL means "no hold"
-- ============================================================================

create table if not exists public.hostel_inspections (
  id                uuid primary key default gen_random_uuid(),
  hostel_id         uuid not null references public.hostels   (id) on delete cascade,
  student_id        uuid not null references public.profiles  (id) on delete cascade,
  booking_id        uuid references public.bookings (id) on delete set null,
  scheduled_for     timestamptz not null,
  full_name         text not null,
  phone             text not null,
  availability_note text,
  fee_kobo          bigint not null check (fee_kobo >= 0),
  payment_reference text unique,
  paid_at           timestamptz,
  status            text not null default 'pending_payment'
                      check (status in ('pending_payment','scheduled','completed',
                                        'cancelled','no_show')),
  ambassador_id     uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists inspections_student_idx on public.hostel_inspections (student_id, scheduled_for desc);
create index if not exists inspections_hostel_idx  on public.hostel_inspections (hostel_id, scheduled_for);
create index if not exists inspections_booking_idx on public.hostel_inspections (booking_id)
  where booking_id is not null;

-- ============================================================================
-- VERIFICATION VISITS (ambassador confirms the listing is real)
-- Distinct from student inspections: different actor, purpose, lifecycle.
-- Drives hostels.verified. Mirrors HostelVisitStatus in landlord.types.ts.
-- ============================================================================

create table if not exists public.hostel_verification_visits (
  id            uuid primary key default gen_random_uuid(),
  hostel_id     uuid not null references public.hostels  (id) on delete cascade,
  ambassador_id uuid references public.profiles (id) on delete set null,
  status        text not null default 'Not Visited'
                  check (status in ('Not Visited','Visit Scheduled','Under Review',
                                    'Verified','Rejected')),
  scheduled_for timestamptz,
  photos        text[] not null default '{}',
  video_url     text,
  notes         text,
  submitted_at  timestamptz,
  decided_at    timestamptz,
  decided_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists verification_visits_hostel_idx
  on public.hostel_verification_visits (hostel_id, created_at desc);

-- ============================================================================
-- HOLD MECHANICS
-- ============================================================================

create or replace function public.hold_interval()
returns interval language sql immutable as $$ select interval '24 hours' $$;

create or replace function public.max_holds_per_student()
returns integer language sql immutable as $$ select 3 $$;

-- Single place the deadline is computed. Uses NEW.locked_at (a BEFORE trigger
-- can't read the updated row back from the table).
create or replace function public.sync_booking_hold()
returns trigger language plpgsql as $$
begin
  if new.status = 'awaiting_payment' then
    if new.locked_at is null then
      new.locked_at := now();
    end if;
    new.reserved_until := coalesce(
      (select max(i.scheduled_for)
         from public.hostel_inspections i
        where i.booking_id = new.id
          and i.status in ('scheduled','completed')),
      new.locked_at
    ) + public.hold_interval();
  else
    -- Not a hold: clear it so a stale deadline can't keep blocking the room.
    new.reserved_until := null;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_sync_hold on public.bookings;
create trigger bookings_sync_hold
  before insert or update on public.bookings
  for each row execute function public.sync_booking_hold();

-- Booking or moving an inspection AFTER locking must push the deadline out.
-- Only touches the row - sync_booking_hold does the arithmetic, so the rule
-- lives in exactly one place.
create or replace function public.sync_hold_from_inspection()
returns trigger language plpgsql as $$
begin
  if new.booking_id is not null then
    update public.bookings
       set updated_at = now()
     where id = new.booking_id
       and status = 'awaiting_payment';
  end if;
  return new;
end;
$$;

drop trigger if exists inspections_sync_hold on public.hostel_inspections;
create trigger inspections_sync_hold
  after insert or update of scheduled_for, status, booking_id
  on public.hostel_inspections
  for each row execute function public.sync_hold_from_inspection();

-- Cap concurrent holds. Needs a count, so it can't be an index.
create or replace function public.enforce_max_holds()
returns trigger language plpgsql as $$
declare
  live integer;
begin
  if new.status = 'awaiting_payment' then
    select count(*) into live
      from public.bookings
     where student_id = new.student_id
       and status = 'awaiting_payment'
       and reserved_until > now()
       and id <> new.id;

    if live >= public.max_holds_per_student() then
      raise exception
        'You can hold at most % rooms at once. Release one to lock another.',
        public.max_holds_per_student()
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Named _z_ so it fires after bookings_sync_hold (BEFORE triggers run in
-- alphabetical order) and therefore sees the populated reserved_until.
drop trigger if exists bookings_z_max_holds on public.bookings;
create trigger bookings_z_max_holds
  before insert or update on public.bookings
  for each row execute function public.enforce_max_holds();

-- Tidy-up only: availability is already correct without it. Call from a cron
-- route alongside /api/cron/purge-archived, every ~5 minutes.
create or replace function public.expire_stale_holds()
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.bookings
       set status = 'expired', reserved_until = null, updated_at = now()
     where status = 'awaiting_payment'
       and reserved_until <= now()
    returning 1
  )
  select count(*)::integer from expired;
$$;

-- ── Room state: free / reserved / booked ────────────────────────────────────
-- Self-healing: an expired hold reads `free` without any sweep, because the
-- comparison happens at read time.
create or replace view public.hostel_room_state as
select
  r.id        as room_id,
  r.hostel_id,
  r.label,
  coalesce(r.price_per_session_kobo, h.price_per_session_kobo) as price_kobo,
  case
    when not r.is_listed then 'unlisted'
    when exists (select 1 from public.bookings b
                  where b.room_id = r.id and b.status = 'confirmed') then 'booked'
    when exists (select 1 from public.bookings b
                  where b.room_id = r.id
                    and b.status = 'awaiting_payment'
                    and b.reserved_until > now()) then 'reserved'
    else 'free'
  end as state
from public.hostel_rooms r
join public.hostels h on h.id = r.hostel_id;

-- ── Hostel availability: active / ending_soon / closed ──────────────────────
create or replace view public.hostel_availability as
select
  h.id                                              as hostel_id,
  count(s.room_id)                                  as rooms_total,
  count(s.room_id) filter (where s.state = 'free')  as rooms_available,
  case
    when count(s.room_id) = 0                                  then 'draft'
    when count(s.room_id) filter (where s.state = 'free') = 0   then 'closed'
    when count(s.room_id) filter (where s.state = 'free') <= 3  then 'ending_soon'
    else 'active'
  end as availability
from public.hostels h
left join public.hostel_room_state s on s.hostel_id = h.id
group by h.id;

-- ── "Near me" ───────────────────────────────────────────────────────────────
-- Not SECURITY DEFINER: RLS on hostels still applies.
create or replace function public.hostels_near(
  lat double precision, lng double precision, radius_m integer default 2000
)
returns table (
  id uuid, name text, slug text, area text,
  price_per_session_kobo bigint, rooms_available bigint,
  availability text, distance_m double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select h.id, h.name, h.slug, h.area, h.price_per_session_kobo,
         a.rooms_available, a.availability,
         st_distance(h.geo, st_makepoint(lng, lat)::geography) as distance_m
    from public.hostels h
    join public.hostel_availability a on a.hostel_id = h.id
   where h.archived_at is null
     and h.geo is not null
     and st_dwithin(h.geo, st_makepoint(lng, lat)::geography, radius_m)
   order by distance_m
$$;

-- ============================================================================
-- SAVED · LISTINGS · ORDERS · ACTIVITY · EVENTS
-- ============================================================================

create table if not exists public.saved_hostels (
  student_id uuid not null references public.profiles (id) on delete cascade,
  hostel_id  uuid not null references public.hostels  (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, hostel_id)
);
create index if not exists saved_hostels_student_idx
  on public.saved_hostels (student_id, created_at desc);

create table if not exists public.listings (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  description text,
  category    text not null,
  price_kobo  bigint not null check (price_kobo >= 0),
  stock       integer not null default 0 check (stock >= 0),
  sold        integer not null default 0 check (sold  >= 0),
  -- Matches ListingStatus in src/modules/vendor/types.ts.
  status      text not null default 'Active'
                check (status in ('Active','Out of Stock','Archived')),
  image_url   text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists listings_vendor_idx   on public.listings (vendor_id, status);
create index if not exists listings_category_idx on public.listings (category) where archived_at is null;

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.profiles (id) on delete cascade,
  vendor_id          uuid not null references public.profiles (id) on delete restrict,
  -- Mirrors DemoOrder["status"] in src/lib/demo-order.ts plus the states a real
  -- order needs before and outside the happy path.
  status             text not null default 'pending'
                       check (status in ('pending','preparing','picked_up',
                                         'on_the_way','delivered','cancelled')),
  subtotal_kobo      bigint not null default 0 check (subtotal_kobo      >= 0),
  delivery_fee_kobo  bigint not null default 0 check (delivery_fee_kobo  >= 0),
  packaging_fee_kobo bigint not null default 0 check (packaging_fee_kobo >= 0),
  sync_fee_kobo      bigint not null default 0 check (sync_fee_kobo      >= 0),
  total_kobo         bigint not null default 0 check (total_kobo         >= 0),
  delivery_address   text,
  eta_minutes        integer,
  payment_reference  text unique,
  paid_at            timestamptz,
  placed_at          timestamptz not null default now(),
  delivered_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists orders_student_idx on public.orders (student_id, created_at desc);
create index if not exists orders_vendor_idx  on public.orders (vendor_id, status);
-- The overview's live-tracking card. Partial index stays small as history grows.
create index if not exists orders_active_idx  on public.orders (student_id, created_at desc)
  where status in ('pending','preparing','picked_up','on_the_way');

create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  -- Nullable + SET NULL so deleting a listing can never destroy order history.
  listing_id uuid references public.listings (id) on delete set null,
  -- Snapshots: a past order must render as it was bought, even after the vendor
  -- renames the item or changes the price.
  name       text not null,
  price_kobo bigint not null check (price_kobo >= 0),
  qty        integer not null check (qty > 0),
  image_url  text,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- Drives the icon in the UI; icon names are presentation and are not stored.
  kind         text not null
                 check (kind in ('saved','message','booking_request','room_held',
                                 'hold_expired','booking_confirmed','inspection_booked',
                                 'inspection_completed','search_match','order_placed',
                                 'order_delivered','review_posted','ticket_purchased')),
  message      text not null,
  -- Loose polymorphic ref (no FK - points at several tables).
  subject_type text,
  subject_id   uuid,
  href         text,
  created_at   timestamptz not null default now()
);
create index if not exists activity_log_user_idx on public.activity_log (user_id, created_at desc);

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid references public.profiles (id) on delete set null,
  name         text not null,
  slug         text not null unique,
  venue        text,
  geo          extensions.geography(Point, 4326),
  starts_at    timestamptz not null,
  created_at   timestamptz not null default now()
);
create index if not exists events_starts_at_idx on public.events (starts_at);
create index if not exists events_geo_idx       on public.events using gist (geo);

create table if not exists public.tickets (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events   (id) on delete cascade,
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  reference  text not null unique,
  tier       text,
  price_kobo bigint not null check (price_kobo >= 0),
  status     text not null default 'valid' check (status in ('valid','used','refunded')),
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tickets_owner_idx on public.tickets (owner_id, status);
create index if not exists tickets_event_idx on public.tickets (event_id);

-- ============================================================================
-- ROW-LEVEL SECURITY
-- Every table is unreachable until a policy grants access.
-- ============================================================================

alter table public.hostels                    enable row level security;
alter table public.hostel_images              enable row level security;
alter table public.hostel_rooms               enable row level security;
alter table public.bookings                   enable row level security;
alter table public.hostel_inspections         enable row level security;
alter table public.hostel_verification_visits enable row level security;
alter table public.saved_hostels              enable row level security;
alter table public.listings                   enable row level security;
alter table public.orders                     enable row level security;
alter table public.order_items                enable row level security;
alter table public.activity_log               enable row level security;
alter table public.events                     enable row level security;
alter table public.tickets                    enable row level security;

-- ── Public browse ───────────────────────────────────────────────────────────
drop policy if exists "hostels_select_active" on public.hostels;
create policy "hostels_select_active" on public.hostels
  for select using (archived_at is null);

drop policy if exists "hostel_images_select" on public.hostel_images;
create policy "hostel_images_select" on public.hostel_images
  for select using (exists (select 1 from public.hostels h
                             where h.id = hostel_id and h.archived_at is null));

drop policy if exists "hostel_rooms_select" on public.hostel_rooms;
create policy "hostel_rooms_select" on public.hostel_rooms
  for select using (exists (select 1 from public.hostels h
                             where h.id = hostel_id and h.archived_at is null));

drop policy if exists "listings_select_active" on public.listings;
create policy "listings_select_active" on public.listings
  for select using (archived_at is null and status <> 'Archived');

drop policy if exists "events_select_all" on public.events;
create policy "events_select_all" on public.events for select using (true);

-- ── Landlords / vendors manage their own stock ──────────────────────────────
drop policy if exists "hostels_write_own" on public.hostels;
create policy "hostels_write_own" on public.hostels
  for all using (auth.uid() = landlord_id) with check (auth.uid() = landlord_id);

drop policy if exists "hostel_images_write_own" on public.hostel_images;
create policy "hostel_images_write_own" on public.hostel_images
  for all using (exists (select 1 from public.hostels h
                          where h.id = hostel_id and h.landlord_id = auth.uid()));

drop policy if exists "hostel_rooms_write_own" on public.hostel_rooms;
create policy "hostel_rooms_write_own" on public.hostel_rooms
  for all using (exists (select 1 from public.hostels h
                          where h.id = hostel_id and h.landlord_id = auth.uid()));

drop policy if exists "listings_write_own" on public.listings;
create policy "listings_write_own" on public.listings
  for all using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id);

-- A landlord must not be able to self-verify their own property.
create or replace function public.guard_hostel_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.verified := old.verified;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists hostels_guard_privileged on public.hostels;
create trigger hostels_guard_privileged
  before update on public.hostels
  for each row execute function public.guard_hostel_privileged_cols();

-- ── Bookings ────────────────────────────────────────────────────────────────
drop policy if exists "bookings_select_own" on public.bookings;
create policy "bookings_select_own" on public.bookings
  for select using (
    auth.uid() = student_id
    or exists (select 1 from public.hostels h
                where h.id = hostel_id and h.landlord_id = auth.uid())
  );

drop policy if exists "bookings_insert_own" on public.bookings;
create policy "bookings_insert_own" on public.bookings
  for insert with check (auth.uid() = student_id);

drop policy if exists "bookings_update_own" on public.bookings;
create policy "bookings_update_own" on public.bookings
  for update using (auth.uid() = student_id) with check (auth.uid() = student_id);

-- RLS is row-level, so column rules need a trigger. Mirrors
-- guard_profile_privileged_cols() in 0001.
create or replace function public.guard_booking_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    -- A student may lock or release. confirmed/expired/completed are
    -- server-only, driven by the payment webhook.
    if new.status is distinct from old.status
       and new.status not in ('interested','requested','awaiting_payment','cancelled') then
      new.status := old.status;
    end if;
    new.paid_at           := old.paid_at;
    new.payment_reference := old.payment_reference;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Fires before bookings_sync_hold (alphabetical), so the hold is computed from
-- the post-guard status.
drop trigger if exists bookings_guard_privileged on public.bookings;
create trigger bookings_guard_privileged
  before update on public.bookings
  for each row execute function public.guard_booking_privileged_cols();

-- ── Inspections ─────────────────────────────────────────────────────────────
drop policy if exists "inspections_select_own" on public.hostel_inspections;
create policy "inspections_select_own" on public.hostel_inspections
  for select using (
    auth.uid() = student_id
    or auth.uid() = ambassador_id
    or exists (select 1 from public.hostels h
                where h.id = hostel_id and h.landlord_id = auth.uid())
  );

drop policy if exists "inspections_insert_own" on public.hostel_inspections;
create policy "inspections_insert_own" on public.hostel_inspections
  for insert with check (auth.uid() = student_id);

drop policy if exists "inspections_update_own" on public.hostel_inspections;
create policy "inspections_update_own" on public.hostel_inspections
  for update using (auth.uid() = student_id) with check (auth.uid() = student_id);

-- The fee is non-refundable, so paid_at must never be client-settable.
create or replace function public.guard_inspection_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.paid_at           := old.paid_at;
    new.payment_reference := old.payment_reference;
    new.fee_kobo          := old.fee_kobo;
    new.ambassador_id     := old.ambassador_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists inspections_guard_privileged on public.hostel_inspections;
create trigger inspections_guard_privileged
  before update on public.hostel_inspections
  for each row execute function public.guard_inspection_privileged_cols();

-- ── Verification visits: ambassador only; admins use the service role ───────
drop policy if exists "verification_visits_ambassador" on public.hostel_verification_visits;
create policy "verification_visits_ambassador" on public.hostel_verification_visits
  for select using (auth.uid() = ambassador_id);

-- ── Orders ──────────────────────────────────────────────────────────────────
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select using (auth.uid() = student_id or auth.uid() = vendor_id);

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert with check (auth.uid() = student_id);

-- Only the vendor advances fulfilment.
drop policy if exists "orders_update_vendor" on public.orders;
create policy "orders_update_vendor" on public.orders
  for update using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id);

create or replace function public.guard_order_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.paid_at           := old.paid_at;
    new.payment_reference := old.payment_reference;
    new.total_kobo        := old.total_kobo;
    new.subtotal_kobo     := old.subtotal_kobo;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_guard_privileged on public.orders;
create trigger orders_guard_privileged
  before update on public.orders
  for each row execute function public.guard_order_privileged_cols();

drop policy if exists "order_items_select" on public.order_items;
create policy "order_items_select" on public.order_items
  for select using (exists (select 1 from public.orders o
                             where o.id = order_id
                               and (o.student_id = auth.uid() or o.vendor_id = auth.uid())));

drop policy if exists "order_items_insert" on public.order_items;
create policy "order_items_insert" on public.order_items
  for insert with check (exists (select 1 from public.orders o
                                  where o.id = order_id and o.student_id = auth.uid()));

-- ── Strictly private ────────────────────────────────────────────────────────
drop policy if exists "saved_hostels_own" on public.saved_hostels;
create policy "saved_hostels_own" on public.saved_hostels
  for all using (auth.uid() = student_id) with check (auth.uid() = student_id);

-- Select only: rows are written server-side so a client can't forge activity.
drop policy if exists "activity_log_select_own" on public.activity_log;
create policy "activity_log_select_own" on public.activity_log
  for select using (auth.uid() = user_id);

drop policy if exists "tickets_select_own" on public.tickets;
create policy "tickets_select_own" on public.tickets
  for select using (
    auth.uid() = owner_id
    or exists (select 1 from public.events e
                where e.id = event_id and e.organizer_id = auth.uid())
  );
