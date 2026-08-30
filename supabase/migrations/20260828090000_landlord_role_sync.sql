-- ============================================================================
-- landlord_role_sync
--
-- A landlord cannot reach the landlord dashboard.
--
--   profiles.vendor_category = 'landlord'
--   profiles.role            = 'vendor'
--   proxy.ts: { prefix: '/landlord', roles: ['landlord'] }  ->  403
--
-- 0005_landlord_role added 'landlord' to the role check and backfilled every
-- account that had `vendor_category = 'landlord'` at that moment. It was a
-- one-off, and nothing has kept the two columns in step since — so every
-- landlord who signed up afterwards is stranded on a role that cannot open
-- their own dashboard.
--
-- WHY A TRIGGER RATHER THAN ANOTHER BACKFILL
--   Another one-off UPDATE fixes today's rows and leaves tomorrow's broken in
--   exactly the same way. The category is what the person chose; the role is
--   what the gate reads. Keeping them consistent at write time means the next
--   signup, import or admin edit cannot reintroduce the split.
--
-- THE TRIGGER MOVES IN BOTH DIRECTIONS
--   A vendor who switches their category to 'landlord' becomes one; a landlord
--   who switches away stops being one. A role that only ever ratchets in one
--   direction is its own kind of stuck.
--
-- WHAT IT WILL NOT DO
--   It never touches admin, super_admin, student or rider. Only the
--   vendor/landlord pair, which is the pair that describes the same kind of
--   account differently.
--
-- ROLLBACK
--   drop trigger if exists profiles_sync_landlord_role on public.profiles;
--   drop function if exists public.sync_landlord_role();
-- ============================================================================

create or replace function public.sync_landlord_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Only the vendor/landlord pair is in scope. Staff and students keep the
  -- role they were given whatever their vendor_category says.
  if new.role not in ('vendor', 'landlord') then
    return new;
  end if;

  if new.vendor_category = 'landlord' and new.role <> 'landlord' then
    new.role := 'landlord';
  elsif new.role = 'landlord'
        and new.vendor_category is not null
        and new.vendor_category <> 'landlord' then
    new.role := 'vendor';
  end if;

  return new;
end;
$fn$;

drop trigger if exists profiles_sync_landlord_role on public.profiles;
create trigger profiles_sync_landlord_role
  before insert or update of role, vendor_category on public.profiles
  for each row execute function public.sync_landlord_role();

-- Repair the accounts already stranded. The trigger handles everything after
-- this; this is the ones it was written too late for.
update public.profiles
   set role = 'landlord', updated_at = now()
 where role = 'vendor'
   and vendor_category = 'landlord';
