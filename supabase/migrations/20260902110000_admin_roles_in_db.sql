-- ============================================================================
-- admin_roles_in_db
--
-- Staff access stops being an environment variable and becomes a row.
--
-- WHAT WAS WRONG WITH ADMIN_EMAILS
--   It was written as a bootstrap   "detect the founding admins before
--   profiles.role is set"   and became the mechanism. Three problems came with
--   that:
--
--   1. IT DISAGREED WITH ITSELF. Every admin page resolved
--      `profile?.role ?? adminRoleForEmail(email)`, so the row won. The proxy
--      resolved `adminRoleForEmail(email) ?? profile?.role`, so the env var
--      won. The same person could be staff to the router and a student to the
--      page, or the reverse.
--   2. GRANTING ACCESS MEANT A DEPLOY. Adding a reviewer required editing an
--      env var and redeploying, and revoking one required the same   so in
--      practice nobody was ever removed.
--   3. IT WAS INVISIBLE TO THE DATABASE. `is_staff()` reads profiles.role, so
--      RLS and every SECURITY DEFINER function already ignored the allowlist
--      entirely. An "admin" who existed only in the env var could open the
--      screens and have every write refused.
--
-- SO WHY WAS THE ROW NOT JUST WRITTEN DIRECTLY
--   Because it could not be. `guard_profile_privileged_cols` (0001) reverts
--   `role` for any writer connecting as 'authenticated' or 'anon', which   with
--   the sb_secret_ API keys   is every PostgREST request, service role
--   included. That is why 0004 seeds admins from a migration and why
--   `npm run seed:admins` can create the user but not promote it.
--
--   The guard is right and stays. It gains one door: a transaction-local flag
--   that only set_account_role raises, exactly as the verification columns
--   already work.
--
-- THE FIRST ADMIN IS CREATED BY HAND, ON PURPOSE
--   Somebody has to be able to promote the second one. That first account is
--   made in the Supabase dashboard and promoted with a one-off statement in
--   the SQL editor - see docs/ADMIN_ACCESS.md - rather than seeded from a
--   migration, because a migration is committed and a staff address in the
--   repository is a name handed to anyone who reads it.
--
--   After that it is a super_admin promoting people from a screen, audited,
--   with no deploy and no secret in the tree.
--
-- ROLLBACK
--   drop function if exists public.set_account_role(uuid, text);
--   -- and restore guard_profile_privileged_cols from 20260901270000.
-- ============================================================================

-- ── 1. The guard gains a door ───────────────────────────────────────────────
create or replace function public.guard_profile_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    -- `role` is writable only inside set_account_role, which raises this flag
    -- for the length of its own transaction and lowers it again. Nothing else
    -- sets it, so a direct PATCH on profiles still cannot make anyone staff.
    if coalesce(current_setting('sync.role_grant', true), '') <> 'on' then
      new.role := old.role;
    end if;

    new.verification_status := old.verification_status;
    -- A self-service unsuspend is not a suspension.
    new.suspended_at     := old.suspended_at;
    new.suspended_reason := old.suspended_reason;
    new.suspended_by     := old.suspended_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ── 2. Promoting and demoting ───────────────────────────────────────────────
create or replace function public.set_account_role(p_user uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid  uuid := (select auth.uid());
  v_me   text;
  v_old  text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select role into v_me from public.profiles where id = v_uid;

  -- SUPER ADMIN ONLY, not is_staff(). An admin who can appoint admins is a
  -- super admin by another name, and the distinction between the two roles
  -- would last exactly as long as the first person noticed.
  if v_me is distinct from 'super_admin' then
    raise exception 'Only a super admin can change what someone is'
      using errcode = '42501';
  end if;

  if p_role not in ('student', 'vendor', 'landlord', 'rider', 'admin', 'super_admin') then
    raise exception 'Unknown role: %', p_role using errcode = '22023';
  end if;

  select role into v_old from public.profiles where id = p_user for update;
  if not found then
    raise exception 'no such account' using errcode = 'P0002';
  end if;

  -- A super admin removing their own access locks the last one of them out of
  -- the console with no way back except a migration. Demote somebody else, or
  -- have somebody else demote you.
  if p_user = v_uid and p_role <> 'super_admin' then
    raise exception 'You cannot remove your own super admin access'
      using errcode = 'P0001';
  end if;

  -- The last super admin is not removable either, however it is attempted.
  if v_old = 'super_admin' and p_role <> 'super_admin' then
    if (select count(*) from public.profiles where role = 'super_admin') <= 1 then
      raise exception 'That is the only super admin left. Appoint another first.'
        using errcode = 'P0001';
    end if;
  end if;

  perform set_config('sync.role_grant', 'on', true);

  -- BOTH COLUMNS, AND THAT IS NOT TIDINESS.
  --
  -- `profiles_active_role_is_held` (20260830090000) checks `role = any(roles)`:
  -- the role you are currently acting as must be one you actually hold. Writing
  -- `role` alone leaves the new value outside the array and the constraint
  -- rejects the whole update   which is exactly how seeding an admin failed
  -- before this function existed.
  --
  -- Appended rather than replaced: an admin who was also a vendor keeps the
  -- vendor account and the role switcher keeps working.
  update public.profiles
     set role  = p_role,
         -- array[p_role], NOT p_role. `text[] || text` is ambiguous to the
         -- parser, which tries to read the bare literal as an array and fails
         -- with "malformed array literal". Concatenating two arrays is not.
         roles = case
                   when p_role = any (coalesce(roles, '{}')) then roles
                   else coalesce(roles, '{}') || array[p_role]
                 end,
         updated_at = now()
   where id = p_user;

  perform set_config('sync.role_grant', 'off', true);

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'super_admin', 'role.changed', 'profile', p_user::text,
          jsonb_build_object('role', v_old),
          jsonb_build_object('role', p_role));

  return p_role;
end;
$fn$;

revoke all on function public.set_account_role(uuid, text) from public, anon;
grant execute on function public.set_account_role(uuid, text) to authenticated, service_role;

comment on function public.set_account_role is
  'The only way to make somebody staff. Super admin only, audited, and it refuses to remove the last super admin or your own access.';

-- ── 3. Who the staff are ────────────────────────────────────────────────────
-- A super admin needs to see the team to manage it, and profiles' own RLS is
-- own-row plus staff   which is enough, but this saves every screen rebuilding
-- the same join.
create or replace function public.list_staff()
returns table (id uuid, full_name text, email text, role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.is_staff() then
    raise exception 'Only Sync staff can see this' using errcode = '42501';
  end if;

  return query
    select p.id, p.full_name, u.email::text, p.role, p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.role in ('admin', 'super_admin')
     order by p.role desc, p.created_at;
end;
$fn$;

revoke all on function public.list_staff() from public, anon;
grant execute on function public.list_staff() to authenticated, service_role;
