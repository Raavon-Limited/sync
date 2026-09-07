-- ============================================================================
-- public_hostels_readable
--
-- A signed-out visitor cannot read `hostels` at all. Not "sees fewer rows"   the
-- query fails outright:
--
--   GET /rest/v1/hostels  ->  42501  permission denied for function current_app_role
--
-- WHY
--   `hostels_select_visible` (20260908150000) is:
--
--     using (archived_at is null and (verified or landlord_id = auth.uid()
--                                     or public.is_staff()))
--
--   and `is_staff()` is a plain SQL function whose EXECUTE was granted to
--   `authenticated, service_role` only (20260817090000), as was the
--   `current_app_role()` it calls. A POLICY EXPRESSION RUNS AS THE CALLER, so
--   for `anon` the third branch is not a false   it is a permission error, and
--   an error in a USING clause fails the statement instead of filtering a row.
--
--   The row-level logic was right. The grant underneath it was not.
--
-- WHY THE CHILD TABLES SURVIVED IT
--   `hostel_images` and `hostel_rooms` test `public.hostel_is_visible(hostel_id)`,
--   which is SECURITY DEFINER   so the `is_staff()` inside it executes as the
--   function's owner, who has the grant. The parent policy calls `is_staff()`
--   directly, as the caller, and is the only one that does. That is exactly why
--   this was invisible: the photos loaded and the listing did not.
--
-- THE SAME RULE APPLIES TO TABLES, AND CAUGHT THE FIRST DRAFT OF THIS FILE
--   The agent branch below started as an inline
--   `exists (select 1 from public.verification_visits ...)`. `anon` has no
--   SELECT grant on that table   20260905120000 grants it to `authenticated`
--   only   so the policy failed for anonymous callers exactly as before: a
--   different object, an identical defect, and the verify block at the foot of
--   this file is what caught it.
--
--   Every table and every function a policy touches has to be reachable by every
--   role the policy applies to, or be reached through a SECURITY DEFINER
--   wrapper. Hence `is_assigned_agent`.
--
-- IT ALSO CLOSES A SECOND GAP: the agent assigned to visit an unverified hostel
-- could not read it either. Nothing broke only because /agent/visits reads
-- through the service-role client and bypasses RLS entirely.
--
-- ROLLBACK
--   revoke execute on function public.current_app_role() from anon;
--   revoke execute on function public.is_staff() from anon;
--   revoke execute on function public.is_admin() from anon;
--   drop policy if exists "hostels_select_visible" on public.hostels;
--   drop function if exists public.is_assigned_agent(uuid);
--   -- and restore hostels_select_visible / hostel_is_visible from 20260908150000.
-- ============================================================================

-- ── 1. A policy must be able to ask "are you staff?" without erroring ───────
-- Granting EXECUTE to `anon` leaks nothing. `current_app_role()` is SECURITY
-- DEFINER and reads one row   the caller's own profile, by auth.uid(). With no
-- session there is no uid, so it returns the literal 'anon' and `is_staff()`
-- returns false. An anonymous caller learns that they are anonymous.
grant execute on function public.current_app_role() to anon;
grant execute on function public.is_staff()         to anon;
-- `is_admin` is the same shape and appears in policies beside is_staff; granting
-- one and not the other leaves the identical trap set for the next policy.
grant execute on function public.is_admin()         to anon;

comment on function public.is_staff() is
  'Staff check for policy expressions. Executable by anon: a policy runs as the caller, and an anonymous caller must be able to be told "no" rather than hit a permission error that fails the whole statement.';

-- ── 2. "Was I sent to this hostel?", askable by anyone ──────────────────────
-- SECURITY DEFINER for the reason the header gives: `verification_visits` is
-- granted to `authenticated` only, and a policy on a PUBLIC table cannot read a
-- table its anonymous callers have no grant on. The definer's context makes the
-- lookup possible without widening anybody's access to the visits table itself.
--
-- VERIFICATION VISITS ONLY, not inspections. A paid student viewing cannot
-- exist on an unverified hostel   students cannot see one to book it   so an
-- inspection is never the reason an agent needs this. Narrower is better here.
create or replace function public.is_assigned_agent(p_hostel uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
      from public.verification_visits v
     where v.hostel_id = p_hostel
       and v.ambassador_id = (select auth.uid())
  );
$fn$;

revoke all on function public.is_assigned_agent(uuid) from public;
grant execute on function public.is_assigned_agent(uuid) to anon, authenticated, service_role;

comment on function public.is_assigned_agent is
  'True when the caller has a verification visit on this hostel. Exists so the hostels policy can ask without anon needing a grant on verification_visits.';

-- ── 3. Hidden on the public site, visible to the owner and to the agent ─────
create or replace function public.hostel_is_visible(p_hostel uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
      from public.hostels h
     where h.id = p_hostel
       and h.archived_at is null
       and (
         h.verified
         or h.landlord_id = (select auth.uid())
         or public.is_staff()
         or public.is_assigned_agent(h.id)
       )
  );
$fn$;

grant execute on function public.hostel_is_visible(uuid) to anon, authenticated;

-- The parent policy, same rule, inlined rather than calling hostel_is_visible:
-- that function selects from `hostels`, and calling it FROM the hostels policy
-- only avoids infinite recursion because a SECURITY DEFINER owner bypasses RLS.
-- Relying on that would break the day somebody sets FORCE ROW LEVEL SECURITY.
drop policy if exists "hostels_select_visible" on public.hostels;
create policy "hostels_select_visible" on public.hostels
  for select using (
    archived_at is null
    and (
      verified
      or landlord_id = (select auth.uid())
      or public.is_staff()
      or public.is_assigned_agent(id)
    )
  );

-- ── Verify ──────────────────────────────────────────────────────────────────
-- NO `SET LOCAL ROLE` HERE, AND THAT IS THE LESSON.
--
-- An earlier draft ran the read as `anon` to prove a signed-out visitor gets
-- rows. It did catch a real defect   but `RESET ROLE` did not restore the
-- session, so the CLI's own bookkeeping INSERT into
-- supabase_migrations.schema_migrations then failed with "permission denied for
-- schema supabase_migrations". A migration that changes the role it runs as can
-- break the tooling around it, whatever it proves about the policy.
--
-- So this asserts the MECHANISM   every function the policy touches is
-- executable by every role the policy applies to, which is the exact class of
-- bug this file exists to fix, twice over. The BEHAVIOUR is verified from
-- outside, against PostgREST with the anon key, which is a truer test anyway:
-- it exercises the API path a real visitor takes rather than a role switch
-- inside a superuser session.
do $$
declare
  v_fn text;
begin
  -- A policy expression runs as the caller. Any function it names that `anon`
  -- cannot execute turns the whole SELECT into a 42501 instead of filtering a
  -- row   which is precisely how /hostels came to 403 for signed-out visitors.
  foreach v_fn in array array[
    'public.current_app_role()',
    'public.is_staff()',
    'public.is_admin()',
    'public.is_assigned_agent(uuid)',
    'public.hostel_is_visible(uuid)'
  ]
  loop
    if not has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'anon cannot execute % - the hostels policy will 42501 for signed-out visitors', v_fn;
    end if;
  end loop;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'hostels'
       and policyname = 'hostels_select_visible'
  ) then
    raise exception 'hostels_select_visible is missing';
  end if;

  -- The agent branch must go through the wrapper. Naming `verification_visits`
  -- inline is the defect this file already made once: anon holds no grant on
  -- that table, so the policy raises rather than returning false.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'hostels'
       and policyname = 'hostels_select_visible'
       and qual like '%verification_visits%'
  ) then
    raise exception 'the hostels policy still reads verification_visits directly';
  end if;
end $$;
