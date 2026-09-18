-- ============================================================================
-- client_callable_helpers   nobody could ever create a store.
--
-- THE SYMPTOM
--   "You do not have permission to do that." on Add store, for a verified
--   business, on its FIRST store. `storefronts` has never held a single row in
--   production. No store means no listing either, because a listing needs one.
--
-- THE CAUSE
--   That sentence is lib/errors.ts's text for a RAW 42501   an RLS policy or a
--   GRANT refusing the write. Our own guards raise human sentences that are
--   passed through instead, so none of them produced it. The refusal came from
--   `enforce_store_plan_limit` (20260901160000), which is invoker-rights ON
--   PURPOSE (a SECURITY DEFINER trigger reports `current_user` as its owner, so
--   its "is this a client call?" test would never match) and calls
--   `private.effective_plan`.
--
--   `authenticated` cannot reach schema `private`. 20260816225649 says so in as
--   many words: `revoke all on schema private from anon, authenticated`, usage
--   to service_role alone. Running as the caller, the trigger could not so much
--   as look the function up, and the insert died with permission denied for
--   schema private.
--
--   The `grant execute on function private.effective_plan(uuid) to
--   authenticated` beside it has always been inert: EXECUTE on a function you
--   cannot reach is not a permission, it just reads like one. That is what made
--   this invisible in review.
--
-- WHY THIS DOES NOT OPEN THE SCHEMA
--   `grant usage on schema private to authenticated` would fix it in one line
--   and undo the posture that migration set deliberately. A SECURITY DEFINER
--   function in `public` runs as its owner, and its owner does reach `private`,
--   so a thin wrapper gets the caller an answer without getting them the
--   schema. Same shape as `is_assigned_agent` in 20260905120000.
--
-- WHY IT WAS ONLY EVER THE PLAN LIMITS
--   The policies that consult `private.can_manage_storefront` are OR-ed behind
--   a cheaper disjunct that is true for an owner (`auth.uid() = vendor_id`), so
--   Postgres short-circuits and never evaluates them. They are the same latent
--   bug and will surface the first time a MANAGER   not the owner   updates a
--   branch or reads an order. Left alone here because fixing them is a change
--   to somebody else's policies and this migration is about the reported break.
--   See docs/WORKFLOW.md section 6.
--
-- ROLLBACK
--   drop function if exists public.effective_plan(uuid);
--   drop function if exists public.owns_storefront(uuid);
--   -- and restore both triggers from 20260901160000 and the visits_owner_read
--   -- policy from 20260912120000.
-- ============================================================================

-- === 1. The plan a business is on ===========================================
-- SECURITY DEFINER purely to cross the schema boundary. It still answers only
-- about a business the caller is entitled to ask about, so it cannot be used to
-- read which plan somebody else pays for.
create or replace function public.effective_plan(p_vendor uuid)
returns public.plans
language plpgsql
security definer
stable
set search_path = ''
as $fn$
declare
  v_plan public.plans%rowtype;
  v_uid  uuid := (select auth.uid());
begin
  if p_vendor is null then
    return null;
  end if;

  -- The owner, somebody who staffs one of their branches (a manager adding a
  -- listing is subject to the BUSINESS's limit, not their own), or staff.
  if v_uid is distinct from p_vendor
     and not exists (
       select 1
         from public.storefront_staff st
         join public.storefronts s on s.id = st.storefront_id
        where s.vendor_id = p_vendor
          and st.user_id = v_uid
     )
     and not public.is_staff() then
    raise exception 'That is not your business' using errcode = '42501';
  end if;

  select * into v_plan from private.effective_plan(p_vendor) limit 1;
  return v_plan;
end;
$fn$;

revoke all on function public.effective_plan(uuid) from public, anon;
grant execute on function public.effective_plan(uuid) to authenticated, service_role;

comment on function public.effective_plan(uuid) is
  'The plan a business is actually on. Exists because the plan-limit triggers run as the caller, and the caller cannot reach schema private   see 20260918090000.';

-- === 2. The two triggers that could not call it =============================
-- Unchanged apart from the function they ask. Still invoker-rights, for the
-- reason written on them: the current_user test is what makes the limit apply
-- to client writes and not to migrations or service-role backfills.
create or replace function public.enforce_store_plan_limit()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_plan  public.plans%rowtype;
  v_count integer;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  v_plan := public.effective_plan(new.vendor_id);

  if v_plan.max_stores is null then
    return new;
  end if;

  select count(*) into v_count
    from public.storefronts s
   where s.vendor_id = new.vendor_id
     and s.archived_at is null;

  if v_count >= v_plan.max_stores then
    raise exception
      'The % plan allows % store(s). Archive one, or upgrade to open more.',
      v_plan.name, v_plan.max_stores
      using errcode = 'P0001',
            hint = 'Plans are on /vendor/plan.';
  end if;

  return new;
end;
$fn$;

create or replace function public.enforce_listing_plan_limit()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_plan  public.plans%rowtype;
  v_count integer;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  v_plan := public.effective_plan(new.vendor_id);

  if v_plan.max_listings is null then
    return new;
  end if;

  select count(*) into v_count
    from public.listings l
   where l.vendor_id = new.vendor_id
     and l.archived_at is null;

  if v_count >= v_plan.max_listings then
    raise exception
      'The % plan allows % listing(s). Archive one, or upgrade to add more.',
      v_plan.name, v_plan.max_listings
      using errcode = 'P0001',
            hint = 'Plans are on /vendor/plan.';
  end if;

  return new;
end;
$fn$;

-- === 3. The same trap, in a policy I wrote ==================================
-- `visits_owner_read` (20260912120000) asks `private.owns_storefront`, and a
-- policy expression runs as the CALLER (docs/WORKFLOW.md invariant 1). It has
-- never fired because there were no stores to read a visit for; it would have
-- failed the first time a vendor opened one.
create or replace function public.owns_storefront(p_storefront uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $fn$
  select exists (
    select 1 from public.storefronts sf
     where sf.id = p_storefront
       and sf.vendor_id = (select auth.uid())
  );
$fn$;

revoke all on function public.owns_storefront(uuid) from public, anon;
grant execute on function public.owns_storefront(uuid) to authenticated, service_role;

comment on function public.owns_storefront(uuid) is
  'Does the caller own this branch? In public rather than private because an RLS policy runs as the caller, and the caller cannot reach schema private.';

drop policy if exists "visits_owner_read" on public.verification_visits;
create policy "visits_owner_read" on public.verification_visits
  for select to authenticated
  using (
    vendor_id = (select auth.uid())
    or exists (
      select 1 from public.hostels h
       where h.id = verification_visits.hostel_id
         and h.landlord_id = (select auth.uid())
    )
    or (verification_visits.storefront_id is not null
        and public.owns_storefront(verification_visits.storefront_id))
    or meet_user_id = (select auth.uid())
  );

drop function if exists private.owns_storefront(uuid);

-- ── Verify ──────────────────────────────────────────────────────────────────
do $fn$
declare
  v_src text;
begin
  -- THE PREMISE OF THIS WHOLE MIGRATION. If this ever becomes false, somebody
  -- has opened the schema and these wrappers are no longer the reason things
  -- work   read 20260816225649 before deciding that is fine.
  if has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception
      'authenticated can now reach schema private   re-check this migration''s reasoning';
  end if;

  if to_regprocedure('public.effective_plan(uuid)') is null then
    raise exception 'public.effective_plan is missing';
  end if;
  if not has_function_privilege('authenticated', 'public.effective_plan(uuid)', 'execute') then
    raise exception 'authenticated cannot execute public.effective_plan   the triggers still fail';
  end if;
  if has_function_privilege('anon', 'public.effective_plan(uuid)', 'execute') then
    raise exception 'anon can execute public.effective_plan';
  end if;

  -- Neither trigger may reach into private again.
  for v_src in
    select prosrc from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('enforce_store_plan_limit', 'enforce_listing_plan_limit')
  loop
    if v_src like '%private.effective_plan%' then
      raise exception 'a plan-limit trigger still calls private.effective_plan';
    end if;
    -- The current_user test is what keeps migrations and service-role writes
    -- out of the limit. A rewrite that drops it makes backfills fail.
    if v_src not like '%current_user%' then
      raise exception 'a plan-limit trigger lost its client-call test';
    end if;
  end loop;

  select pg_get_expr(polqual, polrelid) into v_src
    from pg_policy
   where polname = 'visits_owner_read'
     and polrelid = 'public.verification_visits'::regclass;
  if v_src is null or v_src like '%private.%' then
    raise exception 'visits_owner_read still reaches into private: %', coalesce(v_src, '<missing>');
  end if;
end;
$fn$;
