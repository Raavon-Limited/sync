-- ============================================================================
-- fix_role_guard
--
-- TWO BUGS, ONE TRIGGER. The second is a privilege escalation I introduced.
--
-- 1. ANY SIGNED-IN USER COULD GRANT THEMSELVES ADMIN
--      update profiles set roles = '{student,admin}' where id = <self>
--    succeeded. `guard_profile_privileged_cols` freezes `role` and
--    `verification_status` and knows nothing about `roles`, which
--    20260830090000 added. The row-level policy allows a user to update their
--    own row, so the only thing standing between a student and the admin role
--    set was a column list written before that column existed.
--
--    It was not yet exploitable for real access — whatever a user holds in
--    `roles`, `current_app_role()` reads `role`, and the same guard was
--    reverting that. So they could hold admin and not wear it. That is one
--    line of code away from being real, and `roles` is already read by the UI.
--
-- 2. switch_role SILENTLY DID NOTHING
--    It returned the new role and changed nothing. 0004_seed_admin_roles
--    already recorded why:
--
--      "With the new Supabase sb_secret_/sb_publishable_ API keys, ALL
--       PostgREST writes ... are reverted this way and leave role unchanged."
--
--    `current_user` is `authenticated` for every request through PostgREST —
--    service-role calls and SECURITY DEFINER RPCs included. So the guard's
--    `current_user in ('authenticated','anon')` is, in practice, always true,
--    and no RPC can ever move `role`.
--
-- THE FIX: STOP ASKING WHO IS CALLING, START CHECKING WHAT IS BEING DONE
--   The guard now expresses the actual invariant instead of trusting the
--   caller's identity:
--
--     * `roles` is frozen unless a grant is explicitly in progress.
--     * `role` may move, but only to a role the profile ALREADY HOLDS.
--
--   That second rule is the same check `switch_role` performs, restated where
--   it cannot be bypassed: a direct PostgREST write can now move `role` too,
--   and it is exactly as safe, because it can only pick from `roles`.
--
-- THE GRANT FLAG
--   `claim_role` sets a transaction-local GUC that this trigger honours. A
--   client cannot set it: PostgREST executes no arbitrary SQL, so the only
--   way to turn it on is to call a function that turns it on, and the only
--   one that does re-checks the rules first. `set_config(..., true)` scopes it
--   to the transaction, so it cannot leak into the next request on a pooled
--   connection.
--
-- WHAT THIS DOES NOT FIX
--   `create_admin` / `promote_to_admin` still cannot set `role` through
--   PostgREST, for the reason 0004 documents. They were already broken; this
--   changes nothing for them. Admins are still seeded by migration, which runs
--   as `postgres` and is allowed through.
--
-- ROLLBACK
--   Re-run the guard from 0001_profiles.sql and
--   claim_role from 20260830090000_multi_role_accounts.sql.
-- ============================================================================

create or replace function public.guard_profile_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    -- `roles` is a set of privileges. Widening it is a grant, and grants go
    -- through claim_role, which checks what may be claimed. Anything else that
    -- touches this column is reverted, whoever it claims to be.
    if coalesce(current_setting('sync.role_grant', true), '') <> 'on' then
      new.roles := old.roles;
    end if;

    -- `role` is which held privilege is active. Moving it is not a grant, so
    -- it is allowed — but only within the set above, which by this point is
    -- either the old set or a legitimately granted one.
    if not (new.role = any (coalesce(new.roles, '{}'))) then
      new.role := old.role;
    end if;

    new.verification_status := old.verification_status;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
-- claim_role, restated to raise the flag around its own write.
create or replace function public.claim_role(p_role text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := (select auth.uid());
  v_roles text[];
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_role not in ('student', 'vendor', 'landlord', 'rider') then
    raise exception 'Cannot claim the % role', p_role using errcode = '42501';
  end if;

  select roles into v_roles from public.profiles where id = v_uid for update;

  if p_role = any (coalesce(v_roles, '{}')) then
    return v_roles;
  end if;

  if p_role in ('vendor', 'landlord', 'rider')
     and public.business_role_count(v_roles) > 0 then
    raise exception 'This account already has a business profile'
      using errcode = 'P0001';
  end if;

  -- Transaction-local: gone the moment this statement's transaction ends, so
  -- it cannot persist on a pooled connection into somebody else's request.
  perform set_config('sync.role_grant', 'on', true);

  update public.profiles
     set roles = array_append(coalesce(roles, '{}'), p_role), updated_at = now()
   where id = v_uid
  returning roles into v_roles;

  perform set_config('sync.role_grant', 'off', true);

  return v_roles;
end;
$fn$;
revoke all on function public.claim_role(text) from public, anon;
grant execute on function public.claim_role(text) to authenticated;
-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'guard_profile_privileged_cols'
       and p.prosrc like '%sync.role_grant%'
  ) then
    raise exception 'the guard is missing the roles protection';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'claim_role'
       and p.prosrc like '%sync.role_grant%'
  ) then
    raise exception 'claim_role is missing the grant flag';
  end if;
end $$;
