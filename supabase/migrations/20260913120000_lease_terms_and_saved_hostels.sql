-- ============================================================================
-- lease_terms_and_saved_hostels
--
-- THREE THINGS, ALL OF THEM "THE UI ALREADY OFFERS THIS AND THE SCHEMA CANNOT
-- HOLD IT".
--
-- 1. A HOSTEL CANNOT BE SAVED.
--    `favorites.entity_type` has permitted ('vendor','listing','event',
--    'service','hotspot') since 20260817090200. Not 'hostel'. So the heart on a
--    hostel could never have written a row, /user/saved could never have
--    resolved one, and the dashboard's "SAVED HOSTELS" section quietly rendered
--    the PUBLIC CATALOGUE instead with a hardcoded count of 12 beside it. The
--    fake was covering for a constraint, not for missing UI.
--
-- 2. THE LANDLORD'S RENTAL TERM IS COLLECTED AND THROWN AWAY.
--    The property form has a Select named `term` offering "Per session" and
--    "Per year". There is no `term` column on `hostels`, `upsertHostel` never
--    sent one, and `landlord-queries.ts` hardcoded `term: 'per session'` when
--    reading back - so every landlord who chose "Per year" was shown "Per
--    session" the next time they opened the form, and nothing downstream could
--    tell the two apart.
--
-- 3. `end_date` IS NEVER WRITTEN BY ANYTHING.
--    `createBooking` accepts an `endDate` no caller passes, and no other code
--    touches the column - so it is null on every booking ever made, which is
--    why every screen renders "ENDS" followed by nothing. A tenancy with no end
--    is also a room that never comes back on the market.
--
-- WHAT A SESSION IS
--   Two semesters of about three months each, plus the one-to-two month break
--   between them: EIGHT months. A year is twelve. Both live in `app_settings`
--   rather than in the function body, because an academic calendar is exactly
--   the kind of number that changes by decree and should not need a migration -
--   same reasoning as `hold_interval()` and `rent_charge_pct`.
--
-- THE END DATE IS A TRIGGER, NOT A LINE IN `pay_booking_from_wallet`.
--   move_in is set by the payment function today, but it is also settable when
--   a booking is created, and a future flow may set it somewhere else again. A
--   trigger means the end date is derived wherever the move-in date comes from,
--   including for rows that already exist. It only ever FILLS A NULL, so it can
--   never silently rewrite a date somebody agreed.
--
-- CLEARING SAVED HOSTELS ON MOVE-IN IS DELIBERATE AND IRREVERSIBLE.
--   Confirmed at the student's own "I have moved in", not at payment: the
--   72-hour refund window is still open when the rent lands, and a student who
--   cancels inside it needs their shortlist back. Once they confirm, the window
--   is closed, the search is over, and the saved list is clutter. Only HOSTEL
--   favourites go - their saved vendors, events and services are untouched.
--
-- ROLLBACK
--   drop trigger if exists bookings_set_end_date on public.bookings;
--   drop trigger if exists bookings_clear_saved_hostels on public.bookings;
--   drop function if exists private.set_booking_end_date();
--   drop function if exists private.clear_saved_hostels_on_move_in();
--   drop function if exists private.lease_months(text);
--   alter table public.hostels drop column if exists term;
--   (and restore the favorites entity_type check without 'hostel')
-- ============================================================================

-- ── 1. A hostel is a thing you can save ─────────────────────────────────────
alter table public.favorites drop constraint if exists favorites_entity_type_check;
alter table public.favorites add constraint favorites_entity_type_check
  check (entity_type in ('vendor', 'listing', 'event', 'service', 'hotspot', 'hostel'));

-- ── 2. The landlord's term, kept this time ──────────────────────────────────
alter table public.hostels
  add column if not exists term text not null default 'per session'
    check (term in ('per session', 'per year'));

comment on column public.hostels.term is
  'What price_per_session_kobo buys: one session (8 months) or one year. Chosen by the landlord on the property form.';

-- ── 3. How long a lease runs ────────────────────────────────────────────────
insert into public.app_settings (key, value) values
  ('session_months', '8'::jsonb),
  ('year_months',    '12'::jsonb)
on conflict (key) do nothing;

create or replace function private.lease_months(p_term text)
returns integer
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when p_term = 'per year' then private.setting_int('year_months', 12)
    -- 'per session' and anything unrecognised. A term nobody has heard of must
    -- not produce a null end date - the shorter of the two is the safe default,
    -- because it puts the room back on the market sooner rather than never.
    else private.setting_int('session_months', 8)
  end;
$fn$;

revoke all on function private.lease_months(text) from public, anon, authenticated;

comment on function private.lease_months is
  'Months in one lease of this term. A session is two ~3-month semesters plus the break between them; both values are app_settings.';

-- ── 4. Derive the end date wherever move_in comes from ──────────────────────
create or replace function private.set_booking_end_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_term text;
begin
  -- FILL A NULL, NEVER OVERWRITE. An end date that has been agreed - by a
  -- future flow, by support, by a landlord - outranks anything derived here.
  if new.move_in is null or new.end_date is not null then
    return new;
  end if;

  select h.term into v_term from public.hostels h where h.id = new.hostel_id;
  new.end_date := (new.move_in + make_interval(months => private.lease_months(v_term)))::date;
  return new;
end;
$fn$;

-- Alphabetically after `bookings_guard_privileged` and before
-- `bookings_sync_hold`, which is the order this table already relies on.
drop trigger if exists bookings_set_end_date on public.bookings;
create trigger bookings_set_end_date
  before insert or update on public.bookings
  for each row execute function private.set_booking_end_date();

-- ── 5. The search is over once they are in ──────────────────────────────────
create or replace function private.clear_saved_hostels_on_move_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Only on the transition, so a later update to a confirmed booking does not
  -- re-run this against a shortlist they have since started rebuilding.
  if new.move_in_confirmed_at is null or old.move_in_confirmed_at is not null then
    return new;
  end if;

  -- HOSTELS ONLY. Their saved vendors, events, services and hotspots have
  -- nothing to do with having found somewhere to live.
  delete from public.favorites
   where user_id = new.student_id
     and entity_type = 'hostel';

  return new;
end;
$fn$;

drop trigger if exists bookings_clear_saved_hostels on public.bookings;
create trigger bookings_clear_saved_hostels
  after update on public.bookings
  for each row execute function private.clear_saved_hostels_on_move_in();

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every booking ever made has a null end_date. The ones with a move-in date can
-- be derived now; the rest get theirs when they are paid for.
update public.bookings b
   set end_date = (b.move_in + make_interval(months => private.lease_months(h.term)))::date
  from public.hostels h
 where h.id = b.hostel_id
   and b.move_in is not null
   and b.end_date is null;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $verify$
declare
  v_end date;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'hostels' and column_name = 'term'
  ) then
    raise exception 'hostels.term missing';
  end if;

  -- The constraint that made saving a hostel impossible.
  begin
    perform 1 from public.favorites limit 0;
    if not exists (
      select 1 from pg_constraint
       where conname = 'favorites_entity_type_check'
         and pg_get_constraintdef(oid) like '%hostel%'
    ) then
      raise exception 'favorites still cannot hold a hostel';
    end if;
  end;

  -- Eight months, not twelve. Asserted because this is the number the whole
  -- feature turns on and it is the one somebody will "tidy up" to a year.
  if private.lease_months('per session') <> 8 then
    raise exception 'a session is not 8 months (got %)', private.lease_months('per session');
  end if;
  if private.lease_months('per year') <> 12 then
    raise exception 'a year is not 12 months (got %)', private.lease_months('per year');
  end if;
  -- An unknown term must still produce a date.
  if private.lease_months('per fortnight') is null then
    raise exception 'an unrecognised term produced a null lease length';
  end if;

  -- The derivation itself, rather than the constant.
  select ('2026-09-11'::date + make_interval(months => private.lease_months('per session')))::date
    into v_end;
  if v_end <> '2027-05-11'::date then
    raise exception 'a session from 11 Sept 2026 should end 11 May 2027, got %', v_end;
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'bookings_set_end_date' and not tgisinternal
  ) then
    raise exception 'bookings_set_end_date trigger missing';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'bookings_clear_saved_hostels' and not tgisinternal
  ) then
    raise exception 'bookings_clear_saved_hostels trigger missing';
  end if;

  -- The backfill should have left nothing behind.
  if exists (select 1 from public.bookings where move_in is not null and end_date is null) then
    raise exception 'a booking with a move-in date still has no end date';
  end if;
end;
$verify$;
