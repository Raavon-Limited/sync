-- ============================================================================
-- identity_roles
--
-- Completes the identity layer: adds the missing `rider` role, splits public
-- storefront data out of `profiles`, and gives every business role a profile
-- table of its own.
--
-- WHY vendor_profiles EXISTS
--   `profiles` holds student PII (phone, full_name) alongside vendor storefront
--   fields (business_name, business_address). 20260814102248 closed anonymous
--   reads on that table, which also removed the ability to browse vendors while
--   signed out. This migration restores public browsing from a table that holds
--   ONLY publicly-safe columns. Student PII never lives here.
--
-- THE ROLE MODEL, END TO END
--   student     — buys. Default for every signup.
--   vendor      — sells food/beauty/laundry/workmanship. Onboards + verifies.
--   landlord    — lists hostels. Onboards + verifies. Added by 0005.
--   rider       — delivers orders. NEW HERE. Was specified in BLUEPRINT §24 but
--                 existed in neither the database nor src/proxy.ts.
--   admin       — staff. Never self-assignable.
--   super_admin — staff, plus role management.
--
--   `src/proxy.ts` must be updated to match — see the note at the end of this
--   file. The database is the authority; the proxy is UX.
--
-- ROLLBACK
--   drop table if exists public.rider_profiles, public.vendor_profiles,
--                        public.verification_documents, public.campuses cascade;
--   alter table public.profiles drop constraint profiles_role_check;
--   alter table public.profiles add constraint profiles_role_check
--     check (role in ('student','vendor','landlord','admin','super_admin'));
-- ============================================================================

-- ── 1. Allow the rider role ─────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'vendor', 'landlord', 'rider', 'admin', 'super_admin'));
-- ── 2. Signup may now resolve to rider ──────────────────────────────────────
-- Still clamped to the three self-serve roles. `admin` and `super_admin` remain
-- unreachable from the client no matter what metadata is claimed — that clamp
-- is the whole reason this trigger exists.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_role     text := new.raw_user_meta_data ->> 'role';
  claimed_category text := nullif(new.raw_user_meta_data ->> 'vendor_category', '');
  resolved_role    text;
begin
  if claimed_role in ('vendor', 'landlord') then
    resolved_role := case when claimed_category = 'landlord' then 'landlord' else 'vendor' end;
  elsif claimed_role = 'rider' then
    resolved_role := 'rider';
  else
    resolved_role := 'student';
  end if;

  insert into public.profiles (
    id, role, full_name, phone, vendor_category, trade,
    business_name, sells, business_address
  )
  values (
    new.id,
    resolved_role,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    -- A rider is not a vendor; never let a category leak onto one.
    case when resolved_role = 'rider' then null else claimed_category end,
    nullif(new.raw_user_meta_data ->> 'trade', ''),
    new.raw_user_meta_data ->> 'business_name',
    new.raw_user_meta_data ->> 'sells',
    new.raw_user_meta_data ->> 'business_address'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
-- ── 3. Role helpers that work TODAY ─────────────────────────────────────────
-- The conventions migration defined auth_role()/is_admin() against an `app_role`
-- JWT claim. That claim does not exist yet — the custom access token hook is
-- still to be built — so those helpers return 'anon' for everyone.
--
-- These read `profiles` instead. SECURITY DEFINER is REQUIRED and is not a
-- shortcut: profiles' RLS is own-row-only, so a policy on another table that
-- checked the caller's role through a normal query would read nothing. Running
-- as the definer bypasses that. `set search_path = ''` stops a caller-controlled
-- search_path from shadowing `public.profiles`.
--
-- When the token hook ships, change the body to prefer the claim and fall back
-- to this query; every policy below keeps working unchanged.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'app_role', ''),
    (select p.role from public.profiles p where p.id = auth.uid()),
    'anon'
  )
$$;
create or replace function public.has_role(variadic roles text[])
returns boolean
language sql
stable
set search_path = ''
as $$ select public.current_app_role() = any (roles) $$;
-- Redefined from the conventions migration so it consults the table too.
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$ select public.current_app_role() in ('admin', 'super_admin') $$;
create or replace function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$ select public.current_app_role() in ('admin', 'super_admin') $$;
revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.has_role(text[])  to authenticated, service_role;
grant execute on function public.is_admin()        to authenticated, service_role;
grant execute on function public.is_staff()        to authenticated, service_role;
comment on function public.current_app_role() is
  'Caller''s role from the app_role JWT claim, else public.profiles.role, else ''anon''. SECURITY DEFINER so policies on other tables can read it past profiles'' own-row RLS.';
-- ── 4. Campuses ─────────────────────────────────────────────────────────────
-- One campus at launch (KWASU), but every geo-scoped table references this
-- rather than a text literal. Retrofitting multi-campus later is expensive;
-- carrying the column now is nearly free.
create table if not exists public.campuses (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  state      text,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.campuses (code, name, state)
values ('KWASU', 'Kwara State University, Malete', 'Kwara')
on conflict (code) do nothing;
-- ── 5. vendor_profiles — the public storefront ──────────────────────────────
-- One row per vendor/landlord. Anonymous visitors read THIS, never `profiles`.
-- Deliberately excludes phone and any personal field.
create table if not exists public.vendor_profiles (
  id                  uuid primary key references public.profiles (id) on delete cascade,
  slug                text not null unique,
  business_name       text not null,
  category            text not null
                        check (category in ('landlord', 'food', 'beauty', 'laundry', 'tradesman')),
  trade               text check (trade in
                        ('carpenter', 'plumber', 'tailor', 'electrician',
                         'mechanic', 'painter', 'other')),
  tagline             text,
  bio                 text,
  logo_url            text,
  cover_url           text,
  -- Business contact, deliberately separate from profiles.phone: this one is
  -- published, the personal one is not.
  public_phone        text,
  business_address    text,
  area                text,
  campus_id           uuid references public.campuses (id) on delete set null,
  geo                 extensions.geography(Point, 4326),
  -- Server-controlled. The column guard below stops clients writing these.
  verification_status text not null default 'unverified'
                        check (verification_status in
                          ('unverified', 'pending', 'verified', 'rejected')),
  verified_at         timestamptz,
  rating_avg          numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count        integer      not null default 0 check (rating_count >= 0),
  is_accepting_orders boolean      not null default true,
  opens_at            time,
  closes_at           time,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists vendor_profiles_category_idx
  on public.vendor_profiles (category) where archived_at is null;
create index if not exists vendor_profiles_area_idx
  on public.vendor_profiles (area) where archived_at is null;
create index if not exists vendor_profiles_geo_idx
  on public.vendor_profiles using gist (geo);
create index if not exists vendor_profiles_campus_idx
  on public.vendor_profiles (campus_id);
-- ── 6. rider_profiles ───────────────────────────────────────────────────────
-- `is_online` and `last_seen_at` drive dispatch. `current_geo` is written
-- frequently by the rider app; see BLUEPRINT §24 on why live location is
-- readable only while a delivery is active, never as a standing grant.
create table if not exists public.rider_profiles (
  id                  uuid primary key references public.profiles (id) on delete cascade,
  vehicle_type        text not null default 'motorcycle'
                        check (vehicle_type in ('motorcycle', 'bicycle', 'car', 'foot')),
  plate_number        text,
  campus_id           uuid references public.campuses (id) on delete set null,
  verification_status text not null default 'unverified'
                        check (verification_status in
                          ('unverified', 'pending', 'verified', 'rejected')),
  is_online           boolean     not null default false,
  current_geo         extensions.geography(Point, 4326),
  last_seen_at        timestamptz,
  rating_avg          numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count        integer      not null default 0 check (rating_count >= 0),
  deliveries_count    integer      not null default 0 check (deliveries_count >= 0),
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- Partial index: dispatch only ever queries online, verified riders.
create index if not exists rider_profiles_dispatch_idx
  on public.rider_profiles using gist (current_geo)
  where is_online and verification_status = 'verified' and archived_at is null;
-- ── 7. verification_documents ───────────────────────────────────────────────
-- Replaces the `documents[]` array currently living in auth user_metadata,
-- which the user can PATCH themselves. Mirrors DocumentItem in
-- src/modules/vendor/types.ts.
create table if not exists public.verification_documents (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  doc_type       text not null,
  title          text not null,
  storage_path   text not null,
  status         text not null default 'under_review'
                   check (status in ('approved', 'under_review', 'needs_action', 'not_uploaded')),
  action_message text,
  reviewed_by    uuid references public.profiles (id) on delete set null,
  reviewed_at    timestamptz,
  uploaded_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists verification_documents_owner_idx
  on public.verification_documents (owner_id, status);
-- ── 8. Column guards ────────────────────────────────────────────────────────
-- RLS is row-level; keeping a client off ONE column needs a trigger. Same
-- pattern as guard_profile_privileged_cols() in 0001.
--
-- A vendor must not be able to self-verify, and must not invent their own
-- rating. Both are set by staff review and by the reviews aggregate trigger.
create or replace function public.guard_vendor_profile_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.verification_status := old.verification_status;
    new.verified_at         := old.verified_at;
    new.rating_avg          := old.rating_avg;
    new.rating_count        := old.rating_count;
  end if;
  return new;
end;
$$;
drop trigger if exists vendor_profiles_guard on public.vendor_profiles;
create trigger vendor_profiles_guard
  before update on public.vendor_profiles
  for each row execute function public.guard_vendor_profile_cols();
create or replace function public.guard_rider_profile_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.verification_status := old.verification_status;
    new.rating_avg          := old.rating_avg;
    new.rating_count        := old.rating_count;
    new.deliveries_count    := old.deliveries_count;
  end if;
  return new;
end;
$$;
drop trigger if exists rider_profiles_guard on public.rider_profiles;
create trigger rider_profiles_guard
  before update on public.rider_profiles
  for each row execute function public.guard_rider_profile_cols();
-- A document's status is a staff decision. The owner may upload and replace the
-- file, never mark it approved.
create or replace function public.guard_verification_document_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.status         := old.status;
    new.action_message := old.action_message;
    new.reviewed_by    := old.reviewed_by;
    new.reviewed_at    := old.reviewed_at;
  end if;
  return new;
end;
$$;
drop trigger if exists verification_documents_guard on public.verification_documents;
create trigger verification_documents_guard
  before update on public.verification_documents
  for each row execute function public.guard_verification_document_cols();
-- ── 9. RLS ──────────────────────────────────────────────────────────────────
alter table public.campuses               enable row level security;
alter table public.vendor_profiles        enable row level security;
alter table public.rider_profiles         enable row level security;
alter table public.verification_documents enable row level security;
-- Campuses: reference data, world-readable.
drop policy if exists "campuses_select" on public.campuses;
create policy "campuses_select" on public.campuses
  for select to anon, authenticated using (is_active);
-- Vendor storefronts: the public browse surface that replaces the old
-- `profiles` public read. Archived vendors drop out.
drop policy if exists "vendor_profiles_select_public" on public.vendor_profiles;
create policy "vendor_profiles_select_public" on public.vendor_profiles
  for select to anon, authenticated using (archived_at is null);
drop policy if exists "vendor_profiles_write_own" on public.vendor_profiles;
create policy "vendor_profiles_write_own" on public.vendor_profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
drop policy if exists "vendor_profiles_staff" on public.vendor_profiles;
create policy "vendor_profiles_staff" on public.vendor_profiles
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
-- Riders: a rider reads and writes their own row. Live location is NOT public —
-- students see a rider's position only through an active delivery, which the
-- commerce migration exposes as a narrowly-scoped view.
drop policy if exists "rider_profiles_own" on public.rider_profiles;
create policy "rider_profiles_own" on public.rider_profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
drop policy if exists "rider_profiles_staff" on public.rider_profiles;
create policy "rider_profiles_staff" on public.rider_profiles
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
-- Documents: owner reads and uploads their own; staff read everything.
drop policy if exists "verification_documents_own" on public.verification_documents;
create policy "verification_documents_own" on public.verification_documents
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "verification_documents_insert_own" on public.verification_documents;
create policy "verification_documents_insert_own" on public.verification_documents
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "verification_documents_update_own" on public.verification_documents;
create policy "verification_documents_update_own" on public.verification_documents
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
drop policy if exists "verification_documents_staff" on public.verification_documents;
create policy "verification_documents_staff" on public.verification_documents
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
-- ── 10. Grants ──────────────────────────────────────────────────────────────
revoke all on public.campuses               from anon, authenticated;
revoke all on public.vendor_profiles        from anon, authenticated;
revoke all on public.rider_profiles         from anon, authenticated;
revoke all on public.verification_documents from anon, authenticated;
grant select                         on public.campuses        to anon, authenticated;
grant select                         on public.vendor_profiles to anon, authenticated;
grant insert, update                 on public.vendor_profiles to authenticated;
grant select, insert, update         on public.rider_profiles  to authenticated;
grant select, insert, update, delete on public.verification_documents to authenticated;
-- ── 11. Backfill storefronts for existing vendors ───────────────────────────
-- Slug from business_name, de-duplicated with a counter. Runs once; the
-- `on conflict` makes re-running a no-op.
insert into public.vendor_profiles (id, slug, business_name, category, trade, business_address, verification_status)
select
  p.id,
  regexp_replace(lower(coalesce(nullif(p.business_name, ''), 'vendor-' || left(p.id::text, 8))),
                 '[^a-z0-9]+', '-', 'g')
    || case when row_number() over (partition by lower(coalesce(p.business_name, '')) order by p.created_at) > 1
            then '-' || left(p.id::text, 4) else '' end,
  coalesce(nullif(p.business_name, ''), 'Unnamed business'),
  coalesce(p.vendor_category, 'food'),
  p.trade,
  p.business_address,
  p.verification_status
from public.profiles p
where p.role in ('vendor', 'landlord')
  and p.archived_at is null
on conflict (id) do nothing;
-- ── 12. Verify ──────────────────────────────────────────────────────────────
do $$
declare
  rider_allowed  boolean;
  orphan_vendors int;
begin
  -- The role constraint actually admits 'rider'.
  begin
    perform 1 from public.profiles where role = 'rider';
    rider_allowed := true;
  exception when others then
    rider_allowed := false;
  end;

  select count(*) into orphan_vendors
    from public.profiles p
   where p.role in ('vendor', 'landlord')
     and p.archived_at is null
     and not exists (select 1 from public.vendor_profiles v where v.id = p.id);

  if not rider_allowed then
    raise exception 'profiles_role_check does not admit the rider role';
  end if;

  if orphan_vendors > 0 then
    raise exception '% vendor/landlord profile(s) have no storefront row', orphan_vendors;
  end if;

  raise notice 'identity layer ready: 6 roles, storefronts backfilled, documents table live.';
end $$;
-- ============================================================================
-- FOLLOW-UP REQUIRED IN APPLICATION CODE (not doable from SQL)
--   src/proxy.ts   — add 'rider' to the Role union and ALL[], and add a route
--                    rule { prefix: '/rider', roles: ['rider'] }.
--   src/modules/auth/types.ts — add 'rider' to the Role union.
--   The /rider dashboard route group does not exist yet.
-- ============================================================================;
