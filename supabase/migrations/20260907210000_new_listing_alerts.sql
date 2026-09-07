-- ============================================================================
-- new_listing_alerts
--
-- A landlord adds a hostel and nobody at Sync is told. `private.notify_staff`
-- has existed since 20260901240000 and fans a notification out to every
-- admin/super_admin; `notify_verification_submitted` uses it for
-- `vendor_profiles`. No producer ever covered `hostels`.
--
-- So the queue on /admin/verify-visits only ever filled up if somebody
-- remembered to go and look at it. The listing is invisible to students until a
-- Sync agent has stood in the building, which means an unnoticed listing is a
-- landlord waiting on a review nobody knows to do.
--
-- THE NOTIFICATION POINTS AT THE VISITS SCREEN, NOT AT THE LISTING
--   Because the action is "send somebody to look at this", and that is the only
--   screen where it can be done. A link to a read-only listing page would be a
--   notification that tells you something happened and gives you nowhere to act
--   on it.
--
-- INSERT ONLY, AND NOT ON EVERY EDIT
--   A landlord correcting a price should not re-alert the whole console. The
--   thing staff need to know once is that a NEW listing exists and has never
--   been visited.
--
--   Re-verification after a material edit is a real question and deliberately
--   not answered here: it needs a rule about which columns matter (a price does
--   not, an address does), and inventing that rule inside a trigger is how it
--   ends up undocumented. Worth deciding before launch.
--
-- WHY AFTER AND NOT BEFORE
--   `notify_staff` writes rows referencing the hostel id, so the hostel has to
--   exist. And an AFTER trigger that fails cannot take the insert down with it
--   the landlord's listing must not be lost because a notification failed.
--
-- ROLLBACK
--   drop trigger if exists hostels_notify_staff on public.hostels;
--   drop function if exists private.notify_new_listing();
-- ============================================================================

create or replace function private.notify_new_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_landlord text;
begin
  select coalesce(nullif(trim(p.full_name), ''), 'A landlord')
    into v_landlord
    from public.profiles p
   where p.id = new.landlord_id;

  perform private.notify_staff(
    'verification',
    'New listing to verify: ' || coalesce(new.name, 'Unnamed hostel'),
    coalesce(v_landlord, 'A landlord') || ' listed a ' ||
      coalesce(new.room_type, 'property') || ' in ' || coalesce(new.area, 'an unnamed area') ||
      '. It stays hidden from students until an agent has visited it.',
    -- Where the work is done: schedule an agent, then decide on their evidence.
    'verify_visits',
    new.id,
    'hostel'
  );

  return null;  -- AFTER trigger; the return value is ignored.
end;
$fn$;

drop trigger if exists hostels_notify_staff on public.hostels;
create trigger hostels_notify_staff
  after insert on public.hostels
  for each row execute function private.notify_new_listing();

comment on function private.notify_new_listing is
  'Tells every admin a new hostel needs an agent visit. INSERT only: an edit must not re-alert the console. Re-verification after a material edit is undecided   see the migration header.';
