-- ============================================================================
-- multi_role_accounts
--
-- One person, one login, more than one hat.
--
-- THE PROBLEM
--   `profiles.role` is a single column, and the proxy gates `/me` to student,
--   `/vendor` to vendor and `/landlord` to landlord. So a student who also
--   sells food needs two email addresses, and the `sync_landlord_role` trigger
--   actively removes your vendor role when you become a landlord.
--
-- THE SHAPE OF THE FIX
--   `roles`  — every hat you HOLD.
--   `role`   — the hat you are WEARING right now.
--
--   Keeping `role` as the active hat is the whole trick. `current_app_role()`,
--   `has_role()`, `is_staff()`, every RLS policy and the proxy all read `role`
--   and none of them change. Switching is an UPDATE of one column, and the
--   permission system carries on being about ownership, which is what it was
--   already about: only 10 policies in this schema gate on role at all, and 39
--   of the role-ish checks are is_staff/is_admin, which this does not touch.
--
-- SWITCHING TAKES EFFECT IMMEDIATELY, FOR NOW
--   `current_app_role()` prefers the `app_role` JWT claim and falls back to
--   `profiles.role`. The custom access token hook that would set that claim
--   has never been built, so the fallback is what actually runs and a switch
--   is live on the next query.
--
--   WHOEVER BUILDS THAT HOOK: switching will silently stop working. The claim
--   is minted at sign-in, so a user would switch to vendor and keep browsing
--   as a student until their token refreshed. Either omit app_role from the
--   hook, or force a token refresh in `switch_role`.
--
-- STUDENT + ONE BUSINESS
--   Deliberately constrained. You may hold any number of roles but at most one
--   BUSINESS role, because a business role owns a `vendor_profiles` row and
--   that table is keyed `id primary key references profiles(id)` — one
--   business per person. Allowing {vendor, landlord} here would let someone
--   into a state the business table cannot represent.
--
--   To relax it later, `vendor_profiles` has to become many-per-user first.
--   The constraint is named so it is easy to find when that day comes.
--
-- ROLLBACK
--   drop function if exists public.switch_role(text);
--   drop function if exists public.claim_role(text);
--   alter table public.profiles drop constraint if exists profiles_active_role_is_held;
--   alter table public.profiles drop constraint if exists profiles_one_business_role;
--   alter table public.profiles drop column if exists roles;
-- ============================================================================

alter table public.profiles
  add column if not exists roles text[] not null default '{}';

-- Everyone currently holds exactly the hat they are wearing.
update public.profiles set roles = array[role] where roles = '{}';

-- The active role must be one you hold. Without this, `role` and `roles` can
-- drift and the switcher offers hats that the gate then refuses.
alter table public.profiles drop constraint if exists profiles_active_role_is_held;
alter table public.profiles add constraint profiles_active_role_is_held
  check (role = any (roles));

-- The business roles, in one place, so the constraint, the trigger and
-- claim_role cannot disagree about what counts as one.
create or replace function public.business_role_count(p_roles text[])
returns integer
language sql
immutable
set search_path = ''
as $$
  select cardinality(
           array(select r from unnest(coalesce(p_roles, '{}'::text[])) r
                  where r in ('vendor', 'landlord', 'rider'))
         );
$$;

-- At most one business role. See the header for why, and for what has to
-- change before this can be loosened.
--
-- Via a function because a CHECK constraint may not contain a subquery, and
-- counting matches in an array needs one. The function is IMMUTABLE and reads
-- only its argument, which is what makes it legal here.
alter table public.profiles drop constraint if exists profiles_one_business_role;
alter table public.profiles add constraint profiles_one_business_role
  check (public.business_role_count(roles) <= 1);

create index if not exists profiles_roles_idx on public.profiles using gin (roles);

-- ── Wearing a different hat ─────────────────────────────────────────────────
create or replace function public.switch_role(p_role text)
returns text
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

  select roles into v_roles from public.profiles where id = v_uid;

  -- You can only wear a hat you hold. This is the actual authorisation check:
  -- without it, switch_role would be a self-service privilege escalation to
  -- any role including admin.
  if not (p_role = any (coalesce(v_roles, '{}'))) then
    raise exception 'You do not have a % account', p_role using errcode = '42501';
  end if;

  update public.profiles set role = p_role, updated_at = now() where id = v_uid;
  return p_role;
end;
$fn$;

-- ── Taking on a new hat ─────────────────────────────────────────────────────
-- Self-service, because signing up as a vendor already is: onboarding creates
-- the vendor_profiles row and the role that goes with it. Being a vendor grants
-- no access to anyone else's data — every vendor policy is `auth.uid() =
-- vendor_id` — so this widens nothing.
--
-- Staff roles are excluded outright. `create_admin` exists for those and is
-- service-role only.
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
    return v_roles; -- Idempotent: claiming twice is not an error.
  end if;

  -- The one-business rule, enforced here with a readable message rather than
  -- letting the check constraint reject it with a constraint name.
  if p_role in ('vendor', 'landlord', 'rider')
     and public.business_role_count(v_roles) > 0 then
    raise exception 'This account already has a business profile'
      using errcode = 'P0001';
  end if;

  update public.profiles
     set roles = array_append(coalesce(roles, '{}'), p_role), updated_at = now()
   where id = v_uid
  returning roles into v_roles;

  return v_roles;
end;
$fn$;

revoke all on function public.switch_role(text) from public, anon;
revoke all on function public.claim_role(text)  from public, anon;
grant execute on function public.switch_role(text) to authenticated;
grant execute on function public.claim_role(text)  to authenticated;

comment on function public.switch_role(text) is
  'Set the caller''s ACTIVE role to one they already hold. Refuses anything not in profiles.roles, which is what stops it being a self-service escalation.';
comment on function public.claim_role(text) is
  'Add a role to the caller''s own set. Student/vendor/landlord/rider only, at most one business role. Idempotent.';

-- ── The landlord trigger has to stop clobbering the active role ─────────────
-- 20260828090000 flipped `role` between vendor and landlord to match
-- vendor_category. With a role SET that is wrong twice over: it would rewrite
-- the hat you are wearing, and it would leave `roles` describing a role you no
-- longer hold, breaking profiles_active_role_is_held.
--
-- It now keeps the BUSINESS role in the set aligned with vendor_category, and
-- only moves the active role if the active role was the one being replaced.
create or replace function public.sync_landlord_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_want text;
begin
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

  return new;
end;
$fn$;

drop trigger if exists profiles_sync_landlord_role on public.profiles;
create trigger profiles_sync_landlord_role
  before insert or update of role, vendor_category, roles on public.profiles
  for each row execute function public.sync_landlord_role();

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad from public.profiles where not (role = any (roles));
  if v_bad > 0 then
    raise exception '% profile(s) have an active role they do not hold', v_bad;
  end if;

  select count(*) into v_bad from public.profiles where roles = '{}';
  if v_bad > 0 then
    raise exception '% profile(s) have no roles at all', v_bad;
  end if;
end $$;
