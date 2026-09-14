-- ============================================================================
-- complete_ended_tenancies
--
-- WHY: NOTHING HAS EVER SET A BOOKING TO 'completed'.
--   The status is in the check constraint, the stage rail draws it as the final
--   step, `CLOSED_HOSTEL` treats it as past, and no line of SQL or application
--   code anywhere writes it. Every tenancy Sync has ever taken is still
--   `confirmed`, and would have stayed that way for ever.
--
-- AND THAT IS NOT A COSMETIC PROBLEM.
--   `hostel_room_state` reports a room as 'booked' while a CONFIRMED booking
--   exists on it, with no date test at all - unlike a hold, which the same view
--   re-checks against `reserved_until` at read time. So a room whose tenancy
--   ended in May stays off the market in September, and the landlord has no
--   button anywhere that would free it. The hold sweep (`expire_stale_holds`)
--   fixed exactly this shape of bug for unpaid holds; paid tenancies had the
--   same hole and nobody had reached it yet, because Sync has not been running
--   long enough for a lease to end.
--
-- GRACE COUNTS, AND IT IS WHY THIS READS `coalesce`.
--   A landlord who granted an extension has said the student may stay past
--   `end_date`. Completing on `end_date` alone would take the room back out
--   from under a tenant the landlord deliberately allowed to remain - which is
--   the one thing the grace feature exists to prevent.
--
-- IT SWEEPS, IT DOES NOT SETTLE.
--   Completing ends the tenancy and frees the room. It moves no money: the rent
--   released a week after move-in, months before this runs. If a deposit model
--   ever arrives, its return belongs in its own function - not bolted onto a
--   sweep that runs unattended every hour.
--
-- DRIVEN FROM THE SAME HOURLY CRON as the hold expiry and the escrow release.
-- Daily would do - a lease ends on a date, not at a minute - but a second
-- schedule is a second thing to notice has stopped.
-- ============================================================================

create or replace function public.complete_ended_tenancies(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row   record;
  v_count integer := 0;
begin
  for v_row in
    select b.id, b.student_id, b.hostel_id, b.end_date, b.grace_until, h.landlord_id, h.name
      from public.bookings b
      join public.hostels h on h.id = b.hostel_id
     where b.status = 'confirmed'
       -- Grace wins when it has been granted. See the header.
       and coalesce(b.grace_until, b.end_date) < current_date
     order by coalesce(b.grace_until, b.end_date)
     limit greatest(1, p_limit)
  loop
    update public.bookings
       set status     = 'completed',
           updated_at = now()
     where id = v_row.id;

    -- Told to both sides. For the student it is the end of a tenancy; for the
    -- landlord it is a room that is now bookable again, which is the thing they
    -- would otherwise have to notice for themselves.
    perform private.notify(
      v_row.student_id, 'booking', 'Your stay has ended',
      'Your tenancy at ' || coalesce(v_row.name, 'your hostel') ||
      ' ended on ' || to_char(coalesce(v_row.grace_until, v_row.end_date), 'FMDD FMMonth YYYY') ||
      '. Thanks for staying with us.',
      'bookings', null, v_row.id, 'booking', 'student'
    );

    perform private.notify(
      v_row.landlord_id, 'booking', 'A room is free again',
      coalesce(v_row.name, 'Your hostel') ||
      ' has a tenancy that has now ended, and the room is back on the market.',
      'tenants', null, v_row.id, 'booking', 'landlord'
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

revoke all on function public.complete_ended_tenancies(integer) from public, anon, authenticated;

grant execute on function public.complete_ended_tenancies(integer) to service_role;

comment on function public.complete_ended_tenancies is
  'Ends confirmed tenancies whose end_date (or granted grace) has passed, freeing the room. Service role only; driven hourly from /api/cron/complete-tenancies.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $verify$
declare
  v_src text;
begin
  if to_regprocedure('public.complete_ended_tenancies(integer)') is null then
    raise exception 'complete_ended_tenancies missing';
  end if;

  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'complete_ended_tenancies';

  -- Grace must be honoured. Without the coalesce this takes the room back from
  -- a tenant the landlord explicitly allowed to stay, and the grace feature
  -- becomes a lie that costs somebody their room.
  if position('coalesce(b.grace_until, b.end_date)' in v_src) = 0 then
    raise exception 'complete_ended_tenancies ignores granted grace';
  end if;

  -- It must never touch a tenancy that is still running.
  if position('< current_date' in v_src) = 0 then
    raise exception 'complete_ended_tenancies has lost its date predicate';
  end if;

  -- And only confirmed ones: sweeping an awaiting_payment row would silently
  -- turn an unpaid hold into a completed stay.
  if position('b.status = ''confirmed''' in v_src) = 0 then
    raise exception 'complete_ended_tenancies is not scoped to confirmed bookings';
  end if;

  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public'
       and routine_name = 'complete_ended_tenancies'
       and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'complete_ended_tenancies is callable by a client role';
  end if;

  -- A dry check that it runs and reports a number. Nothing should match today.
  if public.complete_ended_tenancies(1) is null then
    raise exception 'complete_ended_tenancies returned null instead of a count';
  end if;
end;
$verify$;
