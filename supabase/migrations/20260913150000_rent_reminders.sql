-- ============================================================================
-- rent_reminders
--
-- WHY
--   "Send payment reminder" on the tenant sheet set a boolean in React state
--   and popped a toast reading "Reminder sent to <name>". Nothing was sent.
--   The tenant was never told anything, and the landlord had been given a
--   receipt for it - which is worse than no button, because they now believe
--   they have chased somebody who has heard nothing.
--
--   It was also enabled on a tenant whose rent was already PAID, which is the
--   one state where a reminder is not just useless but insulting.
--
-- WHEN A REMINDER IS WARRANTED, DECIDED HERE AND NOT BY THE BUTTON
--   The screen disables the button in the states below, and this refuses them
--   too. A disabled button is a courtesy; the rule is that a landlord cannot
--   nag a tenant who has paid, and a courtesy is not a rule.
--
--     unpaid    - accepted and not yet paid for. The hold is running out.
--     expiring  - the lease ends within `rent_reminder_window_days` (30), or
--                 has already ended. This is the renewal conversation.
--
--   Anything else raises. A paid tenancy with months to run has nothing to be
--   reminded about.
--
-- ONE A DAY, ENFORCED IN THE DATABASE
--   Reminders are the obvious thing to press repeatedly when somebody has not
--   answered. `notification_claims` (20260912120000) already exists to make a
--   send happen exactly once, keyed on a string the caller chooses - here the
--   booking plus the date, so tomorrow is a new claim and today is not.
--
-- THE LANDLORD NEVER LEARNS ANYTHING NEW
--   This returns void, and the caller is told only that it went. It does not
--   disclose whether the student read it, when they last logged in, or their
--   contact details - none of which are the landlord's to have.
-- ============================================================================

insert into public.app_settings (key, value) values
  ('rent_reminder_window_days', '30'::jsonb)
on conflict (key) do nothing;

create or replace function public.send_rent_reminder(p_booking uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_b       public.bookings%rowtype;
  v_owner   uuid;
  v_hostel  text;
  v_window  integer := private.setting_int('rent_reminder_window_days', 30);
  v_reason  text;
  v_claimed boolean;
begin
  select * into v_b from public.bookings where id = p_booking;
  if not found then
    raise exception 'no such booking' using errcode = 'P0002';
  end if;

  -- The caller must own the property. Not "must be a landlord" - must be THIS
  -- landlord, or any landlord could message any student on Sync.
  select h.landlord_id, h.name into v_owner, v_hostel
    from public.hostels h where h.id = v_b.hostel_id;

  if v_owner is distinct from (select auth.uid()) then
    raise exception 'That booking is not on one of your properties' using errcode = '42501';
  end if;

  -- Which conversation is this?
  if v_b.paid_at is null and v_b.status in ('requested', 'awaiting_payment') then
    v_reason := 'unpaid';
  elsif v_b.end_date is not null
        and v_b.end_date <= (current_date + make_interval(days => v_window)) then
    v_reason := 'expiring';
  else
    raise exception 'There is nothing to remind this tenant about - their rent is paid and the lease is not near its end.'
      using errcode = 'P0001';
  end if;

  -- One per booking per day. The claim IS the rate limit; a count-and-compare
  -- would let two rapid presses both decide they were first.
  select public.claim_notification(
    'rent-reminder:' || p_booking::text || ':' || current_date::text, 'in_app'
  ) into v_claimed;

  if not v_claimed then
    raise exception 'You have already reminded this tenant today.' using errcode = 'P0001';
  end if;

  if v_reason = 'unpaid' then
    perform private.notify(
      v_b.student_id, 'booking', 'A reminder about your rent',
      'Your landlord is waiting on payment for ' || coalesce(v_hostel, 'your room') ||
      '. Pay from your bookings to confirm the room before the hold runs out.',
      'bookings', null, v_b.id, 'booking', 'student'
    );
  else
    perform private.notify(
      v_b.student_id, 'booking', 'Your lease is ending soon',
      'Your stay at ' || coalesce(v_hostel, 'your hostel') ||
      ' ends on ' || to_char(v_b.end_date, 'FMDD FMMonth YYYY') ||
      '. Your landlord would like to know whether you are renewing.',
      'bookings', null, v_b.id, 'booking', 'student'
    );
  end if;

  return v_reason;
end;
$fn$;

revoke all on function public.send_rent_reminder(uuid) from public, anon;
grant execute on function public.send_rent_reminder(uuid) to authenticated, service_role;

comment on function public.send_rent_reminder is
  'Landlord nudges a tenant about unpaid rent or an ending lease. Refuses on a paid, mid-term tenancy, and once per booking per day.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $verify$
declare
  v_src text;
begin
  if to_regprocedure('public.send_rent_reminder(uuid)') is null then
    raise exception 'send_rent_reminder missing';
  end if;

  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'send_rent_reminder';

  -- The ownership check is the whole security of this function: without it any
  -- landlord could notify any student about any booking.
  if position('not on one of your properties' in v_src) = 0 then
    raise exception 'send_rent_reminder no longer checks that the caller owns the hostel';
  end if;

  -- And the refusal that makes the button honest.
  if position('nothing to remind this tenant about' in v_src) = 0 then
    raise exception 'send_rent_reminder no longer refuses a paid, mid-term tenancy';
  end if;

  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public'
       and routine_name = 'send_rent_reminder'
       and grantee = 'anon'
  ) then
    raise exception 'send_rent_reminder is callable by anon';
  end if;
end;
$verify$;
