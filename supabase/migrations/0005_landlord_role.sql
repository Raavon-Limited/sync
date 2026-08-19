-- ============================================================================
-- 0005_landlord_role.sql
-- Promote `landlord` from a vendor_category to a first-class role.
--
-- Why: the proxy gate in src/proxy.ts matches on `profiles.role`, so while
-- landlords were role='vendor' + vendor_category='landlord' the gate could not
-- separate /vendor from /landlord - a food vendor could open the landlord
-- dashboard and vice versa. Roles are server-trusted (see the privileged-column
-- guard in 0001), so moving the distinction into `role` makes the gate real.
--
-- `vendor_category='landlord'` is KEPT in place as the business category. The
-- two now travel together: role='landlord' implies vendor_category='landlord'.
--
-- Idempotent - safe to re-run. Run in Supabase → SQL Editor (or `supabase db push`).
-- ============================================================================

-- ── 1. Allow the new role ───────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'vendor', 'landlord', 'admin', 'super_admin'));
-- ── 2. Backfill existing landlords ──────────────────────────────────────────
-- Only touch vendors: never demote an admin who happens to own property.
update public.profiles
   set role = 'landlord'
 where role = 'vendor'
   and vendor_category = 'landlord';
-- ── 3. Signup trigger assigns landlord directly ─────────────────────────────
-- Still clamped: a client can only ever land on student / vendor / landlord,
-- never admin. Landlord requires BOTH role=vendor|landlord and the landlord
-- category in the signup metadata, so it can't be reached by accident.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_role     text := new.raw_user_meta_data ->> 'role';
  claimed_category text := nullif(new.raw_user_meta_data ->> 'vendor_category', '');
  resolved_role    text;
begin
  if claimed_role in ('vendor', 'landlord') then
    resolved_role := case when claimed_category = 'landlord' then 'landlord' else 'vendor' end;
  else
    resolved_role := 'student';
  end if;

  insert into public.profiles (
    id, role, full_name, phone, vendor_category, trade,
    business_name, sells, business_address
  )
  values (
    new.id,
    resolved_role,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    claimed_category,
    nullif(new.raw_user_meta_data ->> 'trade', ''),
    new.raw_user_meta_data ->> 'business_name',
    new.raw_user_meta_data ->> 'sells',
    new.raw_user_meta_data ->> 'business_address'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
-- ── 4. Keep role and category consistent ────────────────────────────────────
-- Guards against a server-side update setting one without the other. Runs after
-- the privileged-column guard from 0001 (alphabetical trigger order: this is
-- named _z_ so it fires last and sees the final role).
create or replace function public.sync_landlord_role()
returns trigger language plpgsql as $$
begin
  if new.role = 'landlord' then
    new.vendor_category := 'landlord';
  elsif new.role = 'vendor' and new.vendor_category = 'landlord' then
    -- A vendor may not hold the landlord category; promote instead of drifting.
    new.role := 'landlord';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_z_sync_landlord on public.profiles;
create trigger profiles_z_sync_landlord
  before insert or update on public.profiles
  for each row execute function public.sync_landlord_role();
