-- ============================================================================
-- signup_roles — a new account holds the role it is wearing.
--
-- SIGNUP HAS BEEN BROKEN FOR EVERY STUDENT SINCE 20260830090000.
--
--   > Database error saving new user
--
--   That string is GoTrue's. It is what Supabase says when the AFTER INSERT
--   trigger on auth.users raises, and it is all it says — the real error never
--   leaves the database. The real error was:
--
--     new row for relation "profiles" violates check constraint
--     "profiles_active_role_is_held"                            (SQLSTATE 23514)
--
-- HOW THE TWO HALVES MISSED EACH OTHER
--   20260830090000 added `profiles.roles text[] not null default '{}'` and the
--   constraint `check (role = any (roles))` — the active role must be one you
--   hold. It populated `roles` for every EXISTING row and taught claim_role,
--   switch_role and sync_landlord_role to maintain it.
--
--   It did not teach the one place where profiles are actually BORN.
--   handle_new_user() (20260831140000) inserts a profile from the signup
--   metadata and never mentions `roles`, so the column takes its default of
--   '{}' — and 'student' = any('{}') is false. The insert is rejected, the
--   trigger raises, GoTrue rolls back auth.users, and the account is not
--   created.
--
--   WHY IT LOOKED FINE. sync_landlord_role() fires BEFORE INSERT and does fill
--   `roles` — but its first statement is `if new.vendor_category is null then
--   return new; end if;`. A vendor signup carries a category, so the trigger
--   filled `roles` and the constraint passed. A STUDENT signup carries no
--   category, so the trigger returned before doing anything. Vendors could
--   sign up. Students — nearly everybody — could not, and the two paths were
--   never exercised against the same constraint.
--
--   The same hole swallowed any other insert into `profiles`: the founding
--   admin bootstrap in verifyLoginOtp() upserts {id, role:'admin'} with no
--   category and no roles, so it too could only ever have failed.
--
-- THE FIX, IN TWO PLACES, ON PURPOSE
--   1. handle_new_user() states `roles` explicitly. The row that is inserted
--      is correct on its own terms rather than correct because some other
--      trigger happened to run first.
--   2. sync_landlord_role() will not let an INSERT through with an active role
--      the row does not hold, whatever the category is. This is the net under
--      every OTHER way a profile can be created — the admin bootstrap, a seed
--      script, a future signup path — none of which should have to know that
--      `roles` exists in order to not fail.
--
--   The duplicate guarantee is deliberate. It costs two lines; missing one
--   costs every account anybody tries to create, with a symptom that names no
--   cause.
--
-- THE INSERT-ONLY SCOPE OF (2) IS LOAD BEARING
--   On UPDATE this trigger fires AFTER profiles_guard_privileged (alphabetical
--   order: g before s), and that guard has already forced `role` back into the
--   held set — reverting `roles` unless claim_role raised its flag, then
--   reverting `role` if it is not in that set. Appending to `roles` here on
--   UPDATE would run after the guard and undo exactly the check that stops a
--   client writing role='admin' and then holding it. So the net is INSERT
--   only, where no guard runs and none is being bypassed.
--
-- ROLLBACK
--   Restore handle_new_user from 20260831140000 and sync_landlord_role from
--   20260830090000. Note that doing so re-breaks student signup.
-- ============================================================================

-- ── 1. Profiles are born holding their role ─────────────────────────────────
-- 20260831140000 unchanged except for the `roles` lines, which are marked.
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
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
-- ── 2. The net under every other way a profile gets created ─────────────────
-- 20260830090000 unchanged except for the two INSERT blocks, which are marked.
create or replace function public.sync_landlord_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_want text;
begin
  -- A row may not be BORN wearing a hat it does not hold. Insert only — see
  -- the header for why this must not extend to UPDATE.
  --
  -- Above the category check, because the constraint applies to students and
  -- admins too and they have no category to key off.
  if tg_op = 'INSERT' then
    new.roles := coalesce(new.roles, '{}');
    if not (new.role = any (new.roles)) then
      new.roles := array_append(new.roles, new.role);
    end if;
  end if;

  if new.vendor_category is null then
    return new;
  end if;

  v_want := case when new.vendor_category = 'landlord' then 'landlord' else 'vendor' end;

  -- Staff keep whatever they were given, whatever their category says.
  if new.role in ('admin', 'super_admin') then
    return new;
  end if;

  new.roles := coalesce(new.roles, '{}');

  -- Swap whichever business role is held for the one the category implies.
  if not (v_want = any (new.roles)) then
    -- Strips EVERY business role before adding the wanted one. Filtering only
    -- vendor/landlord would leave a rider holding two business roles, which
    -- profiles_one_business_role then rejects with a constraint name instead
    -- of anything a person could act on.
    new.roles := array_append(
      array(select r from unnest(new.roles) r where r not in ('vendor', 'landlord', 'rider')),
      v_want
    );
  end if;

  -- Only re-point the active role if it was the business role we just replaced.
  -- A student wearing their student hat stays a student.
  if new.role in ('vendor', 'landlord') and new.role <> v_want then
    new.role := v_want;
  end if;

  -- The swap above strips business roles, so it can remove the very role the
  -- net added a moment ago — a rider signing up as role='rider' with a
  -- category set would leave holding 'vendor' alone. Re-established once the
  -- category has had its say, so the two rules cannot cancel each other out.
  if tg_op = 'INSERT' and not (new.role = any (new.roles)) then
    new.roles := array_append(new.roles, new.role);
  end if;

  return new;
end;
$fn$;
drop trigger if exists profiles_sync_landlord_role on public.profiles;
create trigger profiles_sync_landlord_role
  before insert or update of role, vendor_category, roles on public.profiles
  for each row execute function public.sync_landlord_role();
-- Left behind by 0005, which named it `_z_` to sort last, and never dropped by
-- 20260828090000 when the trigger was renamed. It calls the same function, so
-- it has been running this logic a second time on every write — harmless,
-- because the body is idempotent, and removed now so there is one trigger to
-- reason about rather than two that stay identical by luck.
drop trigger if exists profiles_z_sync_landlord on public.profiles;
-- ── 3. Anything already in the hole ─────────────────────────────────────────
-- Expected to touch nothing: the constraint has been enforced since it was
-- added, so no violating row can exist. It is here because if one ever did, it
-- could not be UPDATEd either, which would put it beyond the reach of the app.
update public.profiles
   set roles = array_append(coalesce(roles, '{}'), role)
 where not (role = any (coalesce(roles, '{}')));
-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_bad integer;
begin
  -- The invariant itself, asserted against real data.
  select count(*) into v_bad
    from public.profiles where not (role = any (coalesce(roles, '{}')));
  if v_bad > 0 then
    raise exception '% profile(s) wear a role they do not hold', v_bad;
  end if;

  -- The bug was an omission, so what is asserted is that the column is named
  -- in the function that was missing it. A body that stopped listing `roles`
  -- would reintroduce exactly this outage.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'handle_new_user'
       and pg_get_functiondef(p.oid) like '%array[resolved_role]%'
  ) then
    raise exception 'handle_new_user does not seed profiles.roles — student signup will fail';
  end if;

  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'sync_landlord_role'
       and pg_get_functiondef(p.oid) like '%INSERT%'
  ) then
    raise exception 'sync_landlord_role has lost the insert-time roles net';
  end if;

  if exists (
    select 1 from pg_trigger
     where tgname = 'profiles_z_sync_landlord' and not tgisinternal
  ) then
    raise exception 'the stale profiles_z_sync_landlord trigger is still attached';
  end if;
end $$;
