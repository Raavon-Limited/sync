-- ============================================================================
-- storefronts
--
-- One business, many branches. `vendor_profiles` remains the BRAND — one row
-- per vendor account, holding the name, logo, verification, rating, wallet and
-- subscription. `storefronts` holds the physical locations that brand trades
-- from, each with its own address, hours and open/closed switch.
--
-- WHY vendor_profiles WAS NOT MADE MANY-PER-USER
--   The obvious alternative is to drop `vendor_profiles.id = profiles.id` and
--   let a user own several rows. That identity is load-bearing: every vendor
--   RLS policy in this schema is written as `auth.uid() = vendor_id` or
--   `auth.uid() = id`. Breaking it means rewriting the permission layer across
--   seven migrations at the same time as shipping a feature. Keeping it means
--   the entire existing policy set continues to hold unchanged.
--
-- THE TWO MEANINGS OF vendor_id, NOW MADE EXPLICIT
--   This schema already used `vendor_id` for two different things, and got away
--   with it only because both resolved to the same uuid:
--     * listings.vendor_id, orders.vendor_id       -> public.profiles  (the OWNER)
--     * carts, services, subscriptions, promotions -> vendor_profiles  (the SHOP)
--   Multi-branch is what pulls those apart. The resolution here is deliberate:
--   `vendor_id` keeps meaning WHO OWNS AND GETS PAID, and the new
--   `storefront_id` means WHERE IT PHYSICALLY HAPPENS. Nothing is repointed, so
--   `listings_write_own` and `orders_update_vendor` keep working verbatim, and
--   an owner automatically reaches every branch they own.
--
-- LISTINGS ARE PER-BRANCH, NOT SHARED
--   A shared catalogue with per-branch stock (listings on the brand plus a
--   storefront_listings join) is the other reasonable model. Per-branch was
--   chosen because campus vendors genuinely price and stock differently by
--   location, and because splitting a shared catalogue apart later is far
--   harder than consolidating independent ones.
--
-- STAFF ARE OUT OF SCOPE HERE
--   Only the owner manages branches in v1. Per-branch managers need a
--   `storefront_staff` table and policies that consult it; the policies below
--   are written so that adding it later means widening one predicate rather
--   than rewriting them.
--
-- ROLLBACK
--   alter table public.listings drop column if exists storefront_id;
--   alter table public.orders   drop column if exists storefront_id;
--   alter table public.carts    drop column if exists storefront_id;
--   drop index if exists public.carts_one_open_per_storefront_idx;
--   create unique index carts_one_open_per_vendor_idx
--     on public.carts (student_id, vendor_id) where status = 'open';
--   drop function if exists private.owns_storefront(uuid, uuid);
--   drop table if exists public.storefronts cascade;
-- ============================================================================

-- 1. The branches -----------------------------------------------------------
create table if not exists public.storefronts (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendor_profiles (id) on delete cascade,
  -- "Tanke branch". Distinguishes locations WITHIN a brand; the brand name
  -- still lives on vendor_profiles.business_name.
  name          text not null,
  slug          text not null unique,
  -- Location. Discovery is location-first, so these are the columns students
  -- are actually filtered and sorted by.
  area          text,
  campus_id     uuid references public.campuses (id) on delete set null,
  geo           extensions.geography(Point, 4326),
  address       text,
  public_phone  text,
  -- Trading hours are per-branch: one location closing early does not close
  -- the business.
  opens_at            time,
  closes_at           time,
  is_accepting_orders boolean not null default true,
  -- Exactly one branch per brand is primary - the one a link to the brand
  -- resolves to, and the backfill target for existing rows.
  is_primary    boolean not null default false,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists storefronts_vendor_idx on public.storefronts (vendor_id)
  where archived_at is null;
create index if not exists storefronts_area_idx   on public.storefronts (area)
  where archived_at is null;
-- The shape "find open branches near me" probes.
create index if not exists storefronts_geo_idx    on public.storefronts using gist (geo);
-- One primary per brand, enforced rather than hoped for.
create unique index if not exists storefronts_one_primary_idx
  on public.storefronts (vendor_id) where is_primary and archived_at is null;
-- 2. Backfill: every existing brand becomes its own first branch -------------
-- Existing vendors already have exactly one location's worth of data sitting on
-- vendor_profiles. Move it, do not invent it.
insert into public.storefronts (
  vendor_id, name, slug, area, campus_id, geo, address, public_phone,
  opens_at, closes_at, is_accepting_orders, is_primary
)
select
  vp.id,
  'Main branch',
  vp.slug || '-main',
  vp.area,
  vp.campus_id,
  vp.geo,
  vp.business_address,
  vp.public_phone,
  vp.opens_at,
  vp.closes_at,
  vp.is_accepting_orders,
  true
from public.vendor_profiles vp
where not exists (
  select 1 from public.storefronts s where s.vendor_id = vp.id
);
-- 3. Point the transactional tables at a branch ------------------------------
-- Nullable on arrival so the backfill can run; tightened at the end.
alter table public.listings add column if not exists storefront_id uuid
  references public.storefronts (id) on delete cascade;
alter table public.orders   add column if not exists storefront_id uuid
  references public.storefronts (id) on delete restrict;
alter table public.carts    add column if not exists storefront_id uuid
  references public.storefronts (id) on delete cascade;
-- Existing rows predate branches, so they belong to the primary one. The join
-- is via profiles.id = vendor_profiles.id, which still holds.
update public.listings l
   set storefront_id = s.id
  from public.storefronts s
 where s.vendor_id = l.vendor_id and s.is_primary and l.storefront_id is null;
update public.orders o
   set storefront_id = s.id
  from public.storefronts s
 where s.vendor_id = o.vendor_id and s.is_primary and o.storefront_id is null;
update public.carts c
   set storefront_id = s.id
  from public.storefronts s
 where s.vendor_id = c.vendor_id and s.is_primary and c.storefront_id is null;
create index if not exists listings_storefront_idx on public.listings (storefront_id);
create index if not exists orders_storefront_idx   on public.orders   (storefront_id, status);
create index if not exists carts_storefront_idx    on public.carts    (storefront_id);
-- 4. A cart belongs to a branch, not a brand ---------------------------------
-- Ordering from the Tanke branch and the Gaa Akanbi branch are two carts. The
-- old index would have silently merged them into one.
drop index if exists public.carts_one_open_per_vendor_idx;
create unique index if not exists carts_one_open_per_storefront_idx
  on public.carts (student_id, storefront_id)
  where status = 'open';
-- 5. Ownership helper --------------------------------------------------------
-- SECURITY DEFINER so a policy can ask "is this branch mine" without the caller
-- needing read access to storefronts rows they do not own. When per-branch
-- staff arrive, this is the single function that learns about them.
create or replace function private.owns_storefront(p_storefront uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.storefronts s
     where s.id = p_storefront and s.vendor_id = p_user
  );
$fn$;
grant execute on function private.owns_storefront(uuid, uuid) to authenticated, service_role;
-- 6. RLS ---------------------------------------------------------------------
alter table public.storefronts enable row level security;
-- Public read: students browse branches before signing in, exactly as they
-- browse vendor_profiles today.
drop policy if exists "storefronts_select_public" on public.storefronts;
create policy "storefronts_select_public" on public.storefronts
  for select to anon, authenticated
  using (archived_at is null);
-- The owner writes their own branches. vendor_id IS the owner's uid, because
-- vendor_profiles.id = profiles.id - the identity this migration preserves.
drop policy if exists "storefronts_write_own" on public.storefronts;
create policy "storefronts_write_own" on public.storefronts
  for all to authenticated
  using       ((select auth.uid()) = vendor_id)
  with check  ((select auth.uid()) = vendor_id);
drop policy if exists "storefronts_staff" on public.storefronts;
create policy "storefronts_staff" on public.storefronts
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
revoke all on public.storefronts from anon, authenticated;
grant select                 on public.storefronts to anon, authenticated;
grant insert, update, delete on public.storefronts to authenticated;
-- 7. Tighten -----------------------------------------------------------------
-- Only after the backfill. A listing or cart with no branch is not a state the
-- application should be able to reach.
--
-- The backfill joins storefronts.vendor_id (-> vendor_profiles) against
-- listings.vendor_id (-> profiles). Those are the same uuid ONLY while every
-- trading vendor has a vendor_profiles row. A vendor without one leaves rows
-- unmatched, and `set not null` would then fail with a constraint error that
-- says nothing about the cause. Fail loudly instead, naming the fix.
do $guard$
declare
  v_listings int;
  v_carts    int;
begin
  select count(*) into v_listings from public.listings where storefront_id is null;
  select count(*) into v_carts    from public.carts    where storefront_id is null;

  if v_listings > 0 or v_carts > 0 then
    raise exception
      'storefront backfill incomplete: % listing(s), % cart(s) unmatched. '
      'Their vendor_id has no public.vendor_profiles row, so no branch was '
      'created for it. Backfill vendor_profiles for those accounts, then '
      're-run this migration.',
      v_listings, v_carts
      using errcode = 'P0001';
  end if;
end;
$guard$;
alter table public.listings alter column storefront_id set not null;
alter table public.carts    alter column storefront_id set not null;
-- orders stays nullable: `on delete restrict` protects live branches, but an
-- order must survive a branch being force-removed in a data-repair scenario.

-- 8. Discovery ---------------------------------------------------------------
-- "Branches near me", the query the student side is built around. This has to
-- be an RPC: PostgREST cannot express ST_Distance, and doing it client-side
-- would mean shipping every storefront in the city to sort three of them.
--
-- RANKED, NOT FILTERED, when no radius is given. A hard boundary means a
-- student a few hundred metres outside it sees an empty app; ordering by
-- distance degrades gracefully and needs no correct boundaries. Pass
-- p_radius_m only when a genuine cutoff is wanted.
--
-- Branches with no pin (geo is null) sort last rather than vanishing — a vendor
-- who never dropped a pin should still be findable.
create or replace function public.nearby_storefronts(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m double precision default null,
  p_category text            default null,
  p_limit    integer         default 50
)
returns table (
  id                  uuid,
  vendor_id           uuid,
  name                text,
  slug                text,
  area                text,
  address             text,
  opens_at            time,
  closes_at           time,
  is_accepting_orders boolean,
  is_primary          boolean,
  business_name       text,
  logo_url            text,
  category            text,
  rating_avg          numeric,
  rating_count        integer,
  distance_m          double precision
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with origin as (
    select extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography as g
  )
  select
    s.id, s.vendor_id, s.name, s.slug, s.area, s.address,
    s.opens_at, s.closes_at, s.is_accepting_orders, s.is_primary,
    vp.business_name, vp.logo_url, vp.category, vp.rating_avg, vp.rating_count,
    case when s.geo is null then null
         else extensions.ST_Distance(s.geo, o.g)
    end as distance_m
  from public.storefronts s
  join public.vendor_profiles vp on vp.id = s.vendor_id
  cross join origin o
  where s.archived_at  is null
    and vp.archived_at is null
    and (p_category is null or vp.category = p_category)
    and (
      p_radius_m is null
      or s.geo is null
      or extensions.ST_DWithin(s.geo, o.g, p_radius_m)
    )
  order by
    -- Unpinned branches last, then nearest first.
    (s.geo is null),
    case when s.geo is null then null else extensions.ST_Distance(s.geo, o.g) end asc,
    vp.rating_avg desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$fn$;
grant execute on function
  public.nearby_storefronts(double precision, double precision, double precision, text, integer)
  to anon, authenticated, service_role;
-- 9. Promoting a branch to primary -------------------------------------------
-- Two statements (clear the old, set the new) can interleave under
-- storefronts_one_primary_idx and leave a brand with NO primary, which is worse
-- than the duplicate the index exists to prevent. One function, one
-- transaction, one lock on the brand's rows.
create or replace function public.set_primary_storefront(p_storefront_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_vendor uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lock every branch of this brand before touching any of them.
  select s.vendor_id into v_vendor
    from public.storefronts s
   where s.id = p_storefront_id
     for update;

  if v_vendor is null then
    raise exception 'storefront not found' using errcode = 'P0002';
  end if;

  -- Authorisation, restated because SECURITY DEFINER turned RLS off.
  if v_vendor <> v_uid then
    raise exception 'not your storefront' using errcode = '42501';
  end if;

  update public.storefronts
     set is_primary = (id = p_storefront_id),
         updated_at = now()
   where vendor_id = v_vendor
     and archived_at is null;
end;
$fn$;
grant execute on function public.set_primary_storefront(uuid) to authenticated, service_role;
