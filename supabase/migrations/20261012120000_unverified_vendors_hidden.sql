-- ============================================================================
-- unverified_vendors_hidden
--
-- An unverified vendor is visible to every student, and to anyone with the
-- anon key.
--
--   vendor_profiles_select_public:  using (archived_at is null)
--   storefronts_select_public:      using (archived_at is null)
--   listings_select_active:         using (archived_at is null and status <> 'Archived')
--
-- Verification is in none of them. Hostels had exactly this defect and were
-- fixed in 20260908150000 (unverified_hostels_hidden); vendors were never
-- brought across, so a business that had signed up and uploaded nothing could
-- be browsed, messaged and ordered from beside the ones Sync had vouched for.
--
-- THIS COPIES THE HOSTEL SOLUTION, DELIBERATELY
--   One SECURITY DEFINER helper that answers "may this be read" - here
--   `vendor_is_visible`, there `hostel_is_visible` - and every policy and child
--   table defers to it, so a photo, a menu or a promotion cannot outlive its
--   owner's visibility. Same exemptions: the owner (or they cannot see the
--   business they just created, which is their whole dashboard) and staff
--   (reviewing it is the job). One addition the hostel rule did not need: a
--   branch MANAGER, who is neither, but runs the shop.
--
-- RLS, NOT A FILTER IN THE QUERY
--   A `.eq('verified')` in one query is one screen fixed and PostgREST still
--   answering to anyone with the anon key. Policies cover every path, including
--   the ones that have not been written yet.
--
-- LANDLORDS ARE LEFT EXACTLY AS THEY WERE
--   `vendor_profiles` also holds landlords (category 'landlord'). Their
--   visibility is governed by `hostels`, which has its own rule; a landlord's
--   business name is read on hostel pages whatever their account state. The
--   rule here is for stores, so landlords are exempted from it.
--
-- THE TRAP THIS HAD TO WALK AROUND   read 20260910180000 before editing
--   A policy expression runs as the CALLER. Hostels hit this: a policy calling
--   `is_staff()` directly errored for `anon`, and an error in USING FAILS THE
--   QUERY instead of filtering a row. The same shape is waiting here, one step
--   removed. `listings_write_own`, `storefront_listings_write_manager` and
--   `promotions_write_own` are FOR ALL policies that call private.* functions,
--   and `authenticated` cannot reach schema private (20260816225649). Today
--   they are never evaluated for a student, because the permissive select
--   policy above them is true and Postgres stops there. The moment that policy
--   can be FALSE for a row, they are evaluated, and a student's query errors
--   with "permission denied for schema private" instead of simply not seeing
--   the row - which is the whole feature turning into a 500.
--
--   So the three are re-pointed at public SECURITY DEFINER wrappers. Same
--   boolean, same arguments, same answer for anyone who could ever reach the
--   private function: this changes REACHABILITY, not logic. The self-test at the
--   foot proves it by querying as a signed-in stranger.
--
-- TWO OWNER-RIGHTS FUNCTIONS IGNORE POLICIES ENTIRELY
--   `nearby_storefronts` (near-me search) and `campus_pulse` (the "new shops this
--   fortnight" list, which names stores and slugs) are SECURITY DEFINER, so no
--   policy reaches them. Each is patched with the same helper.
--
-- WHAT THIS DOES NOT DO
--   * It does not stop an unverified vendor being ORDERED from by a crafted
--     request: checkout_cart is owner-rights and calls store_accepting_orders as
--     its owner, bypassing these policies. It removes the shop from every
--     screen and every list; it does not harden checkout. That is a separate
--     change.
--   * A vendor that WAS verified and is later rejected disappears. Correct, and
--     worth knowing before somebody reports it as a bug.
--   * Reviews are not hidden. They are read on the vendor's page, which is gone.
--   * A student's own past orders are unaffected: they read `orders`, not the
--     business.
--
-- ROLLBACK
--   drop policy if exists "vendor_profiles_select_public" on public.vendor_profiles;
--   create policy "vendor_profiles_select_public" on public.vendor_profiles
--     for select to anon, authenticated using (archived_at is null);
--   -- likewise storefronts_select_public (20260822090000), listings_select_active
--   -- (0006_student_core), storefront_listings_select_public (20260829090000),
--   -- services_select_active (20260817090100), promotions_select_live
--   -- (20260817090500); restore nearby_storefronts from 20260822100000 and
--   -- campus_pulse from 20260829110000; then
--   drop function if exists public.vendor_is_visible(uuid);
--   -- The three write-policy wrappers are harmless to leave in place.
-- ============================================================================

-- ── 1. One definition of "may this vendor be read" ──────────────────────────
-- SECURITY DEFINER so every branch below executes as the function's owner, who
-- can reach the tables, private.* and is_staff() for ANY caller including anon.
-- It answers only about the caller (auth.uid()), so it cannot be used to
-- enumerate who runs which shop.
create or replace function public.vendor_is_visible(p_vendor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
      from public.vendor_profiles vp
     where vp.id = p_vendor
       and vp.archived_at is null
       and (
            vp.verification_status = 'verified'
         or vp.category = 'landlord'
         or vp.id = (select auth.uid())
         or public.is_staff()
         -- A manager runs the shop but is neither the owner nor staff. Active
         -- memberships only: revoked rows are kept for the audit trail.
         or exists (
              select 1
                from public.storefront_staff ss
                join public.storefronts sf on sf.id = ss.storefront_id
               where sf.vendor_id = vp.id
                 and ss.user_id = (select auth.uid())
                 and ss.revoked_at is null
            )
       )
  );
$fn$;

comment on function public.vendor_is_visible(uuid) is
  'One definition of "may this vendor be read", used by every public vendor policy so a menu or a promotion cannot outlive its business''s visibility. Mirror of hostel_is_visible.';

revoke all on function public.vendor_is_visible(uuid) from public;
grant execute on function public.vendor_is_visible(uuid) to anon, authenticated, service_role;

-- ── 2. Wrappers, so policies can reach what lives in schema private ─────────
-- See the header. Each answers only for the caller.
create or replace function public.i_manage_storefront(p_storefront uuid)
returns boolean language sql stable security definer set search_path = ''
as $fn$ select private.can_manage_storefront(p_storefront, (select auth.uid())); $fn$;

create or replace function public.i_have_storefront_scope(p_storefront uuid, p_scope text)
returns boolean language sql stable security definer set search_path = ''
as $fn$ select private.storefront_scope(p_storefront, (select auth.uid()), p_scope); $fn$;

create or replace function public.i_have_business_scope(p_vendor uuid, p_scope text)
returns boolean language sql stable security definer set search_path = ''
as $fn$ select private.business_scope(p_vendor, (select auth.uid()), p_scope); $fn$;

revoke all on function public.i_manage_storefront(uuid) from public, anon;
revoke all on function public.i_have_storefront_scope(uuid, text) from public, anon;
revoke all on function public.i_have_business_scope(uuid, text) from public, anon;
grant execute on function public.i_manage_storefront(uuid) to authenticated, service_role;
grant execute on function public.i_have_storefront_scope(uuid, text) to authenticated, service_role;
grant execute on function public.i_have_business_scope(uuid, text) to authenticated, service_role;

-- ── 3. The write policies that would turn a hidden row into an error ────────
drop policy if exists "listings_write_own" on public.listings;
create policy "listings_write_own" on public.listings
  for all to authenticated
  using       ((select auth.uid()) = vendor_id
               or public.i_have_storefront_scope(storefront_id, 'listings'))
  with check  ((select auth.uid()) = vendor_id
               or public.i_have_storefront_scope(storefront_id, 'listings'));

drop policy if exists "storefront_listings_write_manager" on public.storefront_listings;
create policy "storefront_listings_write_manager" on public.storefront_listings
  for all to authenticated
  using       (public.i_manage_storefront(storefront_id))
  with check  (public.i_manage_storefront(storefront_id));

drop policy if exists "promotions_write_own" on public.promotions;
create policy "promotions_write_own" on public.promotions
  for all to authenticated
  using       (public.i_have_business_scope(vendor_id, 'promotions'))
  with check  (public.i_have_business_scope(vendor_id, 'promotions'));

-- ── 4. The visibility rule itself ───────────────────────────────────────────
drop policy if exists "vendor_profiles_select_public" on public.vendor_profiles;
create policy "vendor_profiles_select_public" on public.vendor_profiles
  for select to anon, authenticated
  using (public.vendor_is_visible(id));

drop policy if exists "storefronts_select_public" on public.storefronts;
create policy "storefronts_select_public" on public.storefronts
  for select to anon, authenticated
  using (archived_at is null and public.vendor_is_visible(vendor_id));

drop policy if exists "listings_select_active" on public.listings;
create policy "listings_select_active" on public.listings
  for select
  using (archived_at is null and status <> 'Archived' and public.vendor_is_visible(vendor_id));

-- The link rows. Deferring to the storefront (whose own policy applies, as the
-- caller) means a menu is visible exactly when its shop is, with no second
-- definition to drift. Archived shops' menus were readable before; they are not
-- now, which is correct.
drop policy if exists "storefront_listings_select_public" on public.storefront_listings;
create policy "storefront_listings_select_public" on public.storefront_listings
  for select to anon, authenticated
  using (exists (select 1 from public.storefronts s where s.id = storefront_id));

drop policy if exists "services_select_active" on public.services;
create policy "services_select_active" on public.services
  for select to anon, authenticated
  using (archived_at is null and is_active and public.vendor_is_visible(vendor_id));

drop policy if exists "promotions_select_live" on public.promotions;
create policy "promotions_select_live" on public.promotions
  for select to anon, authenticated
  using (
    is_active and starts_at <= now() and (ends_at is null or ends_at > now())
    and public.vendor_is_visible(vendor_id)
  );

-- ── 5. The two owner-rights functions that ignore policies ──────────────────
-- Both run as their owner, so no policy above reaches them. Bodies are the
-- latest definitions, unchanged except for the one added condition each.

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
  lat                 double precision,
  lng                 double precision,
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
    s.id, s.vendor_id, s.name, s.slug, s.area, s.address, s.lat, s.lng,
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
    and public.vendor_is_visible(s.vendor_id)
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

create or replace function public.campus_pulse()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_min_cohort integer := private.setting_int('pulse_min_cohort', 5);
  v_steady     integer := private.setting_int('pulse_steady_orders', 5);
  v_busy       integer := private.setting_int('pulse_busy_orders', 20);
  v_out        jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  with
  -- Every area that has a live store. Areas with none are not "quiet", they
  -- are simply not places you can order from, and listing them as quiet would
  -- send students somewhere with nothing in it.
  areas as (
    select distinct s.area
      from public.storefronts s
     where s.archived_at is null and public.vendor_is_visible(s.vendor_id) and s.area is not null
  ),

  -- Open / paused / closed, using the same definition checkout uses.
  stores as (
    select s.area,
           count(*)                                                          as total,
           count(*) filter (where public.store_accepting_orders(s.id))       as open,
           count(*) filter (where s.is_accepting_orders
                              and s.paused_until is not null
                              and s.paused_until > now())                    as on_cooldown,
           count(*) filter (where not s.is_accepting_orders)                 as closed
      from public.storefronts s
     where s.archived_at is null and public.vendor_is_visible(s.vendor_id) and s.area is not null
     group by s.area
  ),

  -- Stores that appeared in the last fortnight. Public information: a new shop
  -- is a thing you can walk past.
  fresh as (
    select s.area,
           jsonb_agg(jsonb_build_object('name', s.name, 'slug', s.slug)
                     order by s.created_at desc) as j
      from public.storefronts s
     where s.archived_at is null and public.vendor_is_visible(s.vendor_id)
       and s.area is not null
       and s.created_at > now() - interval '14 days'
     group by s.area
  ),

  -- Paid orders in the last three hours, by area. Used only to pick a bucket.
  recent as (
    select s.area,
           count(*)                        as orders,
           count(distinct o.student_id)    as students
      from public.orders o
      join public.storefronts s on s.id = o.storefront_id
     where o.paid_at is not null
       and o.status <> 'cancelled'
       and o.paid_at > now() - interval '3 hours'
       and s.area is not null
     group by s.area
  ),

  -- A week of orders, for what people are actually buying.
  week as (
    select s.area, i.name, sum(i.qty) as qty
      from public.order_items i
      join public.orders o      on o.id = i.order_id
      join public.storefronts s on s.id = o.storefront_id
     where o.paid_at is not null
       and o.status <> 'cancelled'
       and o.paid_at > now() - interval '7 days'
       and s.area is not null
     group by s.area, i.name
  ),
  -- The cohort test is per AREA, not per item: an area with five students
  -- buying five different things still has five people in it, and publishing
  -- its top item does not single any of them out. Counted straight from
  -- orders rather than summed out of `week`, because summing per-item
  -- distinct counts would double-count a student who bought two things.
  area_students as (
    select s.area, count(distinct o.student_id) as students
      from public.orders o
      join public.storefronts s on s.id = o.storefront_id
     where o.paid_at is not null
       and o.status <> 'cancelled'
       and o.paid_at > now() - interval '7 days'
       and s.area is not null
     group by s.area
  ),
  trending as (
    select w.area,
           jsonb_agg(jsonb_build_object('name', w.name) order by w.qty desc) as j
      from (
        select area, name, qty,
               row_number() over (partition by area order by qty desc) as rn
          from week
      ) w
      join area_students a on a.area = w.area
     where w.rn <= 3
       and a.students >= v_min_cohort
     group by w.area
  )

  select jsonb_agg(
           jsonb_build_object(
             'area',        areas.area,
             'stores',      jsonb_build_object(
                              'total',       coalesce(stores.total, 0),
                              'open',        coalesce(stores.open, 0),
                              'onCooldown',  coalesce(stores.on_cooldown, 0),
                              'closed',      coalesce(stores.closed, 0)
                            ),
             -- A bucket, never a number.
             'busyness',    case
                              when coalesce(recent.orders, 0) >= v_busy   then 'busy'
                              when coalesce(recent.orders, 0) >= v_steady then 'steady'
                              else 'quiet'
                            end,
             'newStores',   coalesce(fresh.j, '[]'::jsonb),
             'trending',    coalesce(trending.j, '[]'::jsonb),
             -- So the UI can say "not enough activity yet" rather than
             -- rendering an empty list that reads as "nobody buys anything".
             'trendingSuppressed',
                            coalesce(trending.j, '[]'::jsonb) = '[]'::jsonb
                              and exists (select 1 from week w2 where w2.area = areas.area)
           )
           order by
             -- Busiest first: the point of the board is where things are
             -- happening, not the alphabet.
             coalesce(recent.orders, 0) desc, areas.area
         )
    into v_out
    from areas
    left join stores    on stores.area = areas.area
    left join fresh     on fresh.area = areas.area
    left join recent    on recent.area = areas.area
    left join trending  on trending.area = areas.area;

  return coalesce(v_out, '[]'::jsonb);
end;
$fn$;

-- ── Self-test: the rule, against real rows, leaving no trace ────────────────
-- A policy that passes a read of its own text and fails for a real caller is how
-- 20260910180000 happened, so this runs the actual queries as the actual roles.
--
-- It takes a real store, flips its vendor to 'unverified' inside a SUBTRANSACTION,
-- queries as each kind of caller, and then raises a sentinel on purpose so the
-- subtransaction (the update, the temporary manager, the role and claims
-- changes) is rolled back. Anything that is NOT the sentinel is a real failure
-- and aborts the migration, which is the point.
--
-- THE CASE THAT MATTERS MOST IS THE SIGNED-IN STRANGER. It is the only caller
-- for whom listings_write_own and friends are evaluated against a hidden row,
-- so it is the one that errors with "permission denied for schema private" if
-- section 3 is wrong.
do $fn$
declare
  v_vendor   uuid;
  v_store    uuid;
  v_slug     text;
  v_status   text;
  v_listings integer;
  v_links    integer;
  v_n        integer;
  v_stranger uuid := gen_random_uuid();
  v_staff    uuid;
  v_manager  uuid;
  -- The role this migration actually runs as. NOT `reset role`: the CLI connects
  -- as a login role and then switches to postgres, so reset drops back to a role
  -- with no table privileges and the next statement dies with permission denied.
  v_me       text := current_user;
begin
  select sf.vendor_id, sf.id, sf.slug into v_vendor, v_store, v_slug
    from public.storefronts sf
    join public.vendor_profiles vp on vp.id = sf.vendor_id
   where vp.category <> 'landlord' and sf.archived_at is null
   order by sf.created_at
   limit 1;

  if v_vendor is null then
    raise notice 'self-test skipped: no store exists to test against';
    return;
  end if;

  select verification_status into v_status from public.vendor_profiles where id = v_vendor;
  select count(*) into v_listings
    from public.listings where vendor_id = v_vendor and archived_at is null and status <> 'Archived';
  select count(*) into v_links from public.storefront_listings where storefront_id = v_store;
  select id into v_staff from public.profiles where role in ('admin', 'super_admin') limit 1;
  select id into v_manager from public.profiles
   where id <> v_vendor and (role is null or role not in ('admin', 'super_admin')) limit 1;

  -- ── Control: a VERIFIED vendor must still be seen. Without it, a policy that
  -- hid everything would pass every "cannot see" check below.
  if v_status = 'verified' then
    begin
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      set local role anon;
      select count(*) into v_n from public.vendor_profiles where id = v_vendor;
      if v_n <> 1 then raise exception 'control: anon cannot see a VERIFIED vendor'; end if;
      select count(*) into v_n from public.storefronts where id = v_store;
      if v_n <> 1 then raise exception 'control: anon cannot see a VERIFIED store'; end if;
      select count(*) into v_n from public.listings where vendor_id = v_vendor;
      if v_n <> v_listings then
        raise exception 'control: anon sees % of % listings of a VERIFIED vendor', v_n, v_listings;
      end if;
      select count(*) into v_n from public.storefront_listings where storefront_id = v_store;
      if v_n <> v_links then
        raise exception 'control: anon sees % of % menu links of a VERIFIED store', v_n, v_links;
      end if;
      select count(*) into v_n from public.nearby_storefronts(0, 0, null, null, 200) n where n.vendor_id = v_vendor;
      if v_n <> 1 then raise exception 'control: near-me lost a VERIFIED store'; end if;
      execute format('set local role %I', v_me);
    end;
  end if;

  -- ── The test proper, in a subtransaction that is always rolled back ───────
  begin
    update public.vendor_profiles set verification_status = 'unverified' where id = v_vendor;

    if v_manager is not null then
      insert into public.storefront_staff (storefront_id, user_id, role)
      values (v_store, v_manager, 'manager');
    end if;

    -- 1. A logged-out visitor.
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
    select count(*) into v_n from public.vendor_profiles where id = v_vendor;
    if v_n <> 0 then raise exception 'anon can read an UNVERIFIED vendor'; end if;
    select count(*) into v_n from public.storefronts where id = v_store;
    if v_n <> 0 then raise exception 'anon can read an UNVERIFIED vendor''s store'; end if;
    select count(*) into v_n from public.listings where vendor_id = v_vendor;
    if v_n <> 0 then raise exception 'anon can read an UNVERIFIED vendor''s listings'; end if;
    select count(*) into v_n from public.storefront_listings where storefront_id = v_store;
    if v_n <> 0 then raise exception 'anon can read an UNVERIFIED store''s menu links'; end if;
    select count(*) into v_n from public.services where vendor_id = v_vendor;
    if v_n <> 0 then raise exception 'anon can read an UNVERIFIED vendor''s services'; end if;
    select count(*) into v_n from public.promotions where vendor_id = v_vendor;
    if v_n <> 0 then raise exception 'anon can read an UNVERIFIED vendor''s promotions'; end if;
    select count(*) into v_n from public.nearby_storefronts(0, 0, null, null, 200) n where n.vendor_id = v_vendor;
    if v_n <> 0 then raise exception 'near-me returns an UNVERIFIED store to anon'; end if;
    execute format('set local role %I', v_me);

    -- 2. A signed-in stranger: a student. Must FILTER, and must not ERROR.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.vendor_profiles where id = v_vendor;
    if v_n <> 0 then raise exception 'a student can read an UNVERIFIED vendor'; end if;
    select count(*) into v_n from public.storefronts where id = v_store;
    if v_n <> 0 then raise exception 'a student can read an UNVERIFIED vendor''s store'; end if;
    select count(*) into v_n from public.listings where vendor_id = v_vendor;
    if v_n <> 0 then raise exception 'a student can read an UNVERIFIED vendor''s listings'; end if;
    select count(*) into v_n from public.storefront_listings where storefront_id = v_store;
    if v_n <> 0 then raise exception 'a student can read an UNVERIFIED store''s menu links'; end if;
    select count(*) into v_n from public.services where vendor_id = v_vendor;
    if v_n <> 0 then raise exception 'a student can read an UNVERIFIED vendor''s services'; end if;
    select count(*) into v_n from public.promotions where vendor_id = v_vendor;
    if v_n <> 0 then raise exception 'a student can read an UNVERIFIED vendor''s promotions'; end if;
    select count(*) into v_n from public.nearby_storefronts(0, 0, null, null, 200) n where n.vendor_id = v_vendor;
    if v_n <> 0 then raise exception 'near-me returns an UNVERIFIED store to a student'; end if;
    if public.campus_pulse()::text like '%' || v_slug || '%' then
      raise exception 'campus_pulse names an UNVERIFIED store to a student';
    end if;
    execute format('set local role %I', v_me);

    -- 3. The owner still sees all of their own business.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.vendor_profiles where id = v_vendor;
    if v_n <> 1 then raise exception 'the OWNER cannot see their own unverified business'; end if;
    select count(*) into v_n from public.storefronts where id = v_store;
    if v_n <> 1 then raise exception 'the OWNER cannot see their own unverified store'; end if;
    select count(*) into v_n from public.listings where vendor_id = v_vendor;
    if v_n < v_listings then
      raise exception 'the OWNER sees % of % of their own listings', v_n, v_listings;
    end if;
    select count(*) into v_n from public.storefront_listings where storefront_id = v_store;
    if v_n <> v_links then
      raise exception 'the OWNER sees % of % of their own menu links', v_n, v_links;
    end if;
    execute format('set local role %I', v_me);

    -- 4. Staff, whose job is to review it.
    if v_staff is not null then
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_n from public.vendor_profiles where id = v_vendor;
      if v_n <> 1 then raise exception 'STAFF cannot see an unverified vendor to review it'; end if;
      select count(*) into v_n from public.storefronts where id = v_store;
      if v_n <> 1 then raise exception 'STAFF cannot see an unverified store to review it'; end if;
      execute format('set local role %I', v_me);
    end if;

    -- 5. A branch manager: neither owner nor staff, and still runs the shop.
    if v_manager is not null then
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_n from public.vendor_profiles where id = v_vendor;
      if v_n <> 1 then raise exception 'a MANAGER cannot see the business they run'; end if;
      select count(*) into v_n from public.storefronts where id = v_store;
      if v_n <> 1 then raise exception 'a MANAGER cannot see the store they run'; end if;
      select count(*) into v_n from public.listings where vendor_id = v_vendor;
      if v_n < v_listings then
        raise exception 'a MANAGER sees % of % of their store''s listings', v_n, v_listings;
      end if;
      execute format('set local role %I', v_me);
    end if;

    raise exception 'SELFTEST_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'SELFTEST_ROLLBACK' then
        raise;
      end if;
  end;

  raise notice 'self-test passed against store % (vendor % was % before it ran)',
    v_slug, v_vendor, v_status;
end;
$fn$;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $fn$
declare
  v_pol  text;
  v_src  text;
  v_name text;
begin
  -- Every public read rule defers to the one helper.
  for v_name, v_pol in
    select c.relname || '.' || p.polname, pg_get_expr(p.polqual, p.polrelid)
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and (c.relname, p.polname) in (
         ('vendor_profiles', 'vendor_profiles_select_public'),
         ('storefronts',     'storefronts_select_public'),
         ('listings',        'listings_select_active'),
         ('services',        'services_select_active'),
         ('promotions',      'promotions_select_live')
       )
  loop
    if v_pol not like '%vendor_is_visible%' then
      raise exception '% does not consult vendor_is_visible: %', v_name, v_pol;
    end if;
  end loop;

  -- No policy that is EVALUATED WHEN A STUDENT READS may reach into schema private.
  -- That is SELECT (r) and ALL (*). An UPDATE-only policy is never run for a read,
  -- so storefronts_update_staff - which still calls private.storefront_scope - is
  -- out of scope here on purpose; it is the open item in docs/WORKFLOW.md.
  for v_name, v_pol in
    select c.relname || '.' || p.polname,
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('vendor_profiles', 'storefronts', 'listings', 'storefront_listings', 'services', 'promotions')
       and p.polcmd in ('r', '*')
  loop
    if v_pol like '%private.%' then
      raise exception '% still reaches into schema private: %', v_name, v_pol;
    end if;
  end loop;

  -- The owner-rights functions that no policy can reach.
  for v_name in select unnest(array['nearby_storefronts', 'campus_pulse']) loop
    select p.prosrc into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;
    if v_src is null or v_src not like '%vendor_is_visible%' then
      raise exception '% does not filter on vendor_is_visible', v_name;
    end if;
  end loop;

  -- Reachable by the roles that need them, and no wider.
  if not has_function_privilege('anon', 'public.vendor_is_visible(uuid)', 'execute') then
    raise exception 'anon cannot execute vendor_is_visible, so every public read would error';
  end if;
  if has_function_privilege('anon', 'public.i_manage_storefront(uuid)', 'execute')
     or has_function_privilege('anon', 'public.i_have_storefront_scope(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.i_have_business_scope(uuid, text)', 'execute') then
    raise exception 'anon can execute a write-policy wrapper';
  end if;
  if not has_function_privilege('authenticated', 'public.i_manage_storefront(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.i_have_storefront_scope(uuid, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.i_have_business_scope(uuid, text)', 'execute') then
    raise exception 'authenticated cannot execute a write-policy wrapper, so vendors could not write';
  end if;

  -- The premise of the wrappers: clients still cannot reach schema private.
  if has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception 'authenticated can now reach schema private   re-check this migration''s reasoning';
  end if;
end;
$fn$;
