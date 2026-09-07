-- ============================================================================
-- signup_role_resolution
--
-- Signing up as a rider or an event organiser made you a student.
--
-- WHAT WENT WRONG
--   handle_new_user (20260901210000) resolves the role claimed in signup
--   metadata rather than trusting it, which is right - user_metadata is
--   client-controlled and 'admin' must be unreachable from it. But the
--   resolution was:
--
--     if claimed_role in ('vendor', 'landlord') then ... else 'student'
--
--   'rider' was already a signup option when that was written, and it fell
--   into the else. 'event_manager' joined it when the card went live. Both
--   became students. Nothing raised, nothing logged: the account worked, it
--   was just the wrong kind, and the only symptom was landing on a dashboard
--   that did not match what you picked.
--
-- THE FIX KEEPS THE ALLOWLIST
--   The two roles are named explicitly rather than passing claimed_role
--   through. Passing it through would be the easy version and would also make
--   'admin' claimable from a signup form, which is the exact thing this
--   function exists to prevent.
--
-- EXISTING ACCOUNTS ARE NOT REWRITTEN
--   Anybody already mislabelled is a person who may since have used the
--   account as a student. Guessing which of them meant to be a rider is not
--   something a migration can do safely, so it is left to a super admin and
--   set_account_role. The query to find them is below, commented.
--
-- ROLLBACK
--   Restore handle_new_user from 20260901210000.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_role     text := new.raw_user_meta_data ->> 'role';
  claimed_category text := nullif(new.raw_user_meta_data ->> 'vendor_category', '');
  claimed_campus   text := nullif(new.raw_user_meta_data ->> 'campus_id', '');
  claimed_other    text := nullif(new.raw_user_meta_data ->> 'campus_other', '');
  resolved_role    text;
  resolved_campus  uuid;
begin
  -- The role is RESOLVED, never taken. raw_user_meta_data is user-controlled,
  -- so anything that is not a business signup lands as 'student' and 'admin'
  -- is unreachable from here.
  if claimed_role in ('vendor', 'landlord') then
    resolved_role := case when claimed_category = 'landlord' then 'landlord' else 'vendor' end;
  elsif claimed_role in ('rider', 'event_manager', 'creator') then
    -- THE ROLES THAT USED TO FALL THROUGH TO 'student'.
    --
    -- The old branch was vendor/landlord or else student, so every rider who
    -- ever signed up became a student, and so did every event organiser once
    -- that card went live. Nothing errored: the account worked, it was simply
    -- the wrong kind, and the only symptom was a dashboard that did not match
    -- what somebody had picked.
    --
    -- 'creator' is here too, even though its signup card still says Coming
    -- soon and `signupSchema` will not send it. A role that is legal in one
    -- layer and silently rewritten in another is how this bug happened in the
    -- first place: the taxonomy should be complete in the database, and which
    -- roles are OFFERED is a decision for the form.
    --
    -- Listed EXPLICITLY rather than passing claimed_role through. The metadata
    -- is user-controlled, so an allowlist is what keeps 'admin' unreachable
    -- from here - the refusal this function was built around.
    resolved_role := claimed_role;
  else
    resolved_role := 'student';
  end if;

  if resolved_role = 'student' and claimed_campus is not null then
    begin
      select id into resolved_campus
      from public.campuses
      where id = claimed_campus::uuid and is_active;
    exception when invalid_text_representation then
      resolved_campus := null;
    end;
  end if;

  insert into public.profiles (
    id, role, roles, full_name, phone, vendor_category, trade,
    business_name, sells, business_address, campus_id, campus_other
  )
  values (
    new.id,
    resolved_role,
    -- THE LINE THAT WAS MISSING. `roles` is the set of hats held; `role` is the
    -- one being worn. A brand new account holds exactly the one it was created
    -- as. Derived from resolved_role and never from the metadata, so it
    -- inherits that resolution's refusal to mint an admin.
    array[resolved_role],
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    claimed_category,
    nullif(new.raw_user_meta_data ->> 'trade', ''),
    new.raw_user_meta_data ->> 'business_name',
    new.raw_user_meta_data ->> 'sells',
    new.raw_user_meta_data ->> 'business_address',
    resolved_campus,
    -- Only keep the free-text campus when it did not resolve to a real row,
    -- so the two columns never disagree about the same student.
    case when resolved_role = 'student' and resolved_campus is null
         then left(claimed_other, 160)
         else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Who to look at, if you want to correct the accounts created before this:
--
--   select p.id, p.role, u.raw_user_meta_data ->> 'role' as claimed
--     from public.profiles p
--     join auth.users u on u.id = p.id
--    where p.role = 'student'
--      and u.raw_user_meta_data ->> 'role' in ('rider', 'event_manager');
--
-- Then, per account, FROM THE SQL EDITOR (not the app):
--
--   update public.profiles
--      set role  = 'event_manager',
--          roles = case
--                    when 'event_manager' = any (coalesce(roles, '{}')) then roles
--                    else coalesce(roles, '{}') || array['event_manager']
--                  end,
--          updated_at = now()
--    where id = '<id>';
--
-- NOT set_account_role. That function reads auth.uid() to check the caller is a
-- super admin, and the SQL Editor has no session - auth.uid() is null there and
-- it raises 'not authenticated' before doing anything. It is the right call
-- from the app and the wrong one from a console.
--
-- The direct update works because guard_profile_privileged_cols only reverts
-- privileged columns when current_user is 'authenticated' or 'anon'. The SQL
-- Editor connects as 'postgres', which the guard allows - the same reason the
-- first super admin is created this way (docs/ADMIN_ACCESS.md).
--
-- BOTH COLUMNS. profiles_active_role_is_held checks role = any(roles), so
-- writing role alone is rejected by the constraint.

-- === Verify =================================================================
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'handle_new_user'
   limit 1;

  if v_src is null then
    raise exception 'handle_new_user missing';
  end if;

  if position('event_manager' in v_src) = 0 then
    raise exception 'handle_new_user still drops event_manager to student';
  end if;

  -- The security property this function exists for. If an allowlist ever turns
  -- into a pass-through, this is what catches it.
  if position('resolved_role := claimed_role;' in v_src) > 0
     and position($q$in ('rider', 'event_manager')$q$ in v_src) = 0 then
    raise exception 'handle_new_user passes the claimed role through unfiltered';
  end if;
end $$;
