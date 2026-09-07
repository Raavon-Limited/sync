-- ============================================================================
-- fix_profile_exposure
--
-- PROBLEM
--   `profiles_select_active` (from the archived 0001_profiles.sql) was created
--   without a `to <role>` clause, so Postgres attached it to PUBLIC   every
--   role, including `anon`. Combined with Supabase's default grants, that made
--   the whole table readable by anyone holding the publishable key, which ships
--   in the browser bundle:
--
--     curl "$SUPABASE_URL/rest/v1/profiles?select=full_name,phone" -H "apikey: <publishable>"
--
--   That exposed full_name, phone, business_address and business_name for every
--   account. Confirmed live via `select ... from pg_policies`   the policy shows
--   roles={public}, and `anon` holds DELETE/INSERT/REFERENCES/SELECT/TRIGGER/…
--   on public.profiles.
--
--   The original intent was legitimate: anonymous visitors need to browse
--   vendors for /around. The mistake was serving that from a table that also
--   holds student PII.
--
-- WHY THIS IS SAFE TO APPLY NOW
--   Every profiles access in the app is either service-role (bypasses RLS) or
--   scoped to the caller's own id. Verified across all 14 call sites:
--     • service-role    admin/users/page, cron/purge-archived, account/actions,
--                       auth/actions
--     • own row only    api/profile (GET + PATCH), lib/supabase/middleware,
--                       modules/auth/queries
--   Nothing reads another user's profile through RLS, and nothing reads
--   profiles anonymously. Removing public read therefore breaks no code path.
--
--   Anonymous vendor browsing returns in Phase 02 via `vendor_profiles`, which
--   holds ONLY publicly-safe storefront columns and gets its own public-read
--   policy. Student PII never lives there.
--
-- DELIBERATELY NOT DONE HERE (each would break production today)
--   • No admin read policy. A policy that checks `profiles.role` from within a
--     policy ON profiles recurses infinitely. It needs the SECURITY DEFINER
--     `is_admin()` helper or the app_role JWT claim   both land in the next
--     migration. Admin screens use the service-role client, so they are
--     unaffected meanwhile.
--   • No `force row level security`. FORCE applies RLS to the table owner too,
--     and `handle_new_user()` is a SECURITY DEFINER trigger that INSERTs here
--     as postgres. With no INSERT policy present, forcing RLS would deny it and
--     break signup outright.
--   • The `guard_profile_privileged_cols()` trigger is left alone. Replacing it
--     with column grants is correct (see docs/BACKEND_BLUEPRINT.md §05) but is a
--     separate, larger change.
--
-- ROLLBACK
--   drop policy if exists "profiles_select_own" on public.profiles;
--   create policy "profiles_select_active" on public.profiles
--     for select using (archived_at is null);
--   drop policy if exists "profiles_update_own" on public.profiles;
--   create policy "profiles_update_own" on public.profiles
--     for update using (auth.uid() = id) with check (auth.uid() = id);
--   grant select, insert, update, delete on public.profiles to anon;
--   grant insert, delete on public.profiles to authenticated;
--   -- (Restores the vulnerability. Only for emergency recovery.)
-- ============================================================================

-- ── 1. Remove public read ───────────────────────────────────────────────────
-- Both names dropped: 0001 created `profiles_select_active` and an earlier
-- revision used `profiles_select_all`. Neither should survive.
drop policy if exists "profiles_select_active" on public.profiles;
drop policy if exists "profiles_select_all"    on public.profiles;
-- ── 2. Signed-in users read their own row, and only their own ───────────────
-- auth.uid() is wrapped in a subselect so the planner treats it as an initplan
-- and evaluates it once per statement rather than once per row.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);
-- ── 3. Re-scope the UPDATE policy to authenticated ──────────────────────────
-- 0001 created `profiles_update_own` with no `to` clause either, so it is also
-- attached to PUBLIC. Unlike the select policy this was never exploitable  
-- for anon, auth.uid() is null, so `null = id` yields NULL and no row ever
-- matches. It is rescoped anyway: the step-5 assertion demands zero PUBLIC
-- policies, and "not exploitable today" is a weaker guarantee than "not
-- granted at all". Predicate is unchanged apart from the initplan wrapper.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using       ((select auth.uid()) = id)
  with check  ((select auth.uid()) = id);
-- ── 4. Drop anon's grants entirely ──────────────────────────────────────────
-- RLS already denies anon (no policy now applies to it), but the grants are
-- what decide whether a column can be named in a query at all. Defence in
-- depth: a future permissive policy added by mistake still finds no privileges
-- behind it. Nothing in the app touches profiles as anon   signup writes via
-- the SECURITY DEFINER handle_new_user() trigger, which is unaffected.
revoke all on public.profiles from anon;
-- ── 5. Narrow authenticated to what it actually uses ────────────────────────
-- The app only ever SELECTs and UPDATEs profiles as a signed-in user; rows are
-- created by the signup trigger and removed by the service-role purge job.
-- No INSERT or DELETE policy exists, so RLS already denied these   this just
-- removes the privilege behind the denial.
revoke insert, delete, truncate on public.profiles from authenticated;
-- ── 6. Verify ───────────────────────────────────────────────────────────────
-- Fails the migration rather than silently leaving the hole open.
do $$
declare
  public_policies int;
  anon_grants     int;
begin
  select count(*) into public_policies
    from pg_policies
   where schemaname = 'public'
     and tablename  = 'profiles'
     and 'public' = any (roles);

  select count(*) into anon_grants
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name   = 'profiles'
     and grantee      = 'anon';

  if public_policies > 0 then
    raise exception
      'profiles still has % policy/policies granted to PUBLIC', public_policies;
  end if;

  if anon_grants > 0 then
    raise exception
      'anon still holds % privilege(s) on profiles', anon_grants;
  end if;

  raise notice 'profiles exposure closed: no PUBLIC policies, no anon grants.';
end $$;
