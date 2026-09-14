-- ============================================================================
-- booking_notification_copy
--
-- The notification a student gets when their room is accepted read:
--
--   Booking awaiting payment
--   Crescent villa 2 is now awaiting payment.
--
-- That is the database's word for the row, printed at a person. It does not say
-- the landlord said YES, it does not say a room is being held, and it does not
-- mention the 24 hours - which is the only fact in the whole transition that
-- can cost them the room. "Awaiting payment" even reads passively, as though
-- something is being processed on their behalf, when it means "you have a day
-- to act".
--
-- The generic `'Booking ' || replace(status, '_', ' ')` was fine while nothing
-- could reach these statuses. Now that a landlord can accept, the two ends of
-- that transition are the most important messages in the product and they are
-- worth writing out.
--
-- EACH SIDE GETS ITS OWN SENTENCE. The old code sent both parties the same
-- text with a different subject noun. "Pay to keep it" and "they have 24 hours
-- to pay" are not the same message, and reading the other person's version is
-- how a landlord ends up thinking they owe money.
--
-- ROLES ARE STAMPED, which is what 20260911150000 added the column for. A
-- landlord alert marked 'landlord' cannot surface on the student dashboard of
-- somebody who holds both, and its `href` (a suffix resolved against whatever
-- dashboard is open) can no longer build /admin/bookings for a staff account
-- that also lets rooms.
-- ============================================================================

create or replace function private.notify_booking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_landlord uuid;
  v_hostel   text;
  v_place    text;
begin
  select h.landlord_id, h.name into v_landlord, v_hostel
    from public.hostels h where h.id = new.hostel_id;

  v_place := coalesce(v_hostel, 'your hostel');

  -- A brand new request is news for the LANDLORD, not the student who sent it.
  if tg_op = 'INSERT' then
    perform private.notify(
      v_landlord, 'booking', 'New booking request',
      'A student requested ' || v_place || '. Accept it to hold a room for them.',
      'requests', null, new.id, 'booking', 'landlord'
    );
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- ── The student's side ────────────────────────────────────────────────────
  if new.status = 'awaiting_payment' then
    perform private.notify(
      new.student_id, 'booking', 'Your room is held',
      'The landlord accepted your request for ' || v_place ||
      '. Pay within 24 hours to confirm it, or book a viewing and the hold moves to your viewing date.',
      'bookings', null, new.id, 'booking', 'student'
    );
  elsif new.status = 'confirmed' then
    perform private.notify(
      new.student_id, 'booking', 'Your room is confirmed',
      v_place || ' is yours. The landlord has been told.',
      'bookings', null, new.id, 'booking', 'student'
    );
  elsif new.status = 'cancelled' then
    perform private.notify(
      new.student_id, 'booking', 'Request declined',
      'The landlord could not take your request for ' || v_place || '. Nothing was charged.',
      'bookings', null, new.id, 'booking', 'student'
    );
  elsif new.status = 'expired' then
    -- Said plainly. This is the one a student is most likely to feel wronged
    -- by, and the honest version is better than discovering it as an empty list.
    perform private.notify(
      new.student_id, 'booking', 'Your hold ran out',
      'The 24 hours on ' || v_place || ' passed without payment, so the room went back on the market.',
      'bookings', null, new.id, 'booking', 'student'
    );
  else
    perform private.notify(
      new.student_id, 'booking', 'Booking ' || replace(new.status, '_', ' '),
      v_place || ' is now ' || replace(new.status, '_', ' ') || '.',
      'bookings', null, new.id, 'booking', 'student'
    );
  end if;

  -- ── The landlord's side ───────────────────────────────────────────────────
  if new.status = 'awaiting_payment' then
    perform private.notify(
      v_landlord, 'booking', 'Room held for a student',
      'You accepted a request for ' || v_place || '. They have 24 hours to pay before it goes back on the market.',
      'requests', null, new.id, 'booking', 'landlord'
    );
  elsif new.status = 'confirmed' then
    perform private.notify(
      v_landlord, 'booking', 'A room was paid for',
      v_place || ' has a confirmed tenant.',
      'tenants', null, new.id, 'booking', 'landlord'
    );
  elsif new.status = 'expired' then
    perform private.notify(
      v_landlord, 'booking', 'A hold ran out',
      'Nobody paid within 24 hours, so the room at ' || v_place || ' is back on the market.',
      'requests', null, new.id, 'booking', 'landlord'
    );
  else
    perform private.notify(
      v_landlord, 'booking', 'Booking ' || replace(new.status, '_', ' '),
      coalesce(v_hostel, 'A booking') || ' is now ' || replace(new.status, '_', ' ') || '.',
      'requests', null, new.id, 'booking', 'landlord'
    );
  end if;

  return new;
end;
$fn$;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'notify_booking_status' limit 1;

  if v_src is null then
    raise exception 'notify_booking_status is missing';
  end if;

  -- The deadline is the point of the acceptance alert. A rewrite that drops it
  -- puts us back to "Booking awaiting payment".
  if position('24 hours' in v_src) = 0 then
    raise exception 'the acceptance notification no longer mentions the deadline';
  end if;

  -- Roles must be stamped or these keep surfacing under the wrong hat.
  if position('''landlord''' in v_src) = 0 or position('''student''' in v_src) = 0 then
    raise exception 'booking notifications are not role-stamped';
  end if;
end $$;
