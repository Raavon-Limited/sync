-- ============================================================================
-- booking_conduct_and_soft_holds
--
-- Makes a room hold expire the way the product actually describes it, and stops
-- one student parking three hostels indefinitely without punishing anyone for
-- shopping around.
--
-- WHAT WAS ALREADY RIGHT, and is left alone: `hold_interval()` is 24 hours,
-- `max_holds_per_student()` is 3, `enforce_max_holds` caps concurrency and
-- `hostel_room_state` reads a lapsed hold as free at READ time. None of that
-- changes here.
--
-- THREE THINGS ARE ADDED.
--
-- 1. ACTIVITY EXTENDS A HOLD, UP TO A CEILING.
--    A live negotiation should not have the room pulled out from under it, so a
--    message in the booking's thread pushes the deadline 24h from that message.
--    But "any chat activity extends it" with no ceiling makes a hold
--    unexpirable - one "hi" a day parks a room forever, which is the exact
--    behaviour the 3-hostel cap exists to prevent. So the deadline can never
--    exceed `max_hold_interval()` (72h) from the moment the landlord accepted.
--    Talk as long as you like; the room still comes back on the third day.
--
-- 2. LAPSES ARE COUNTED, AND A SECOND ROUND IS A FLAG.
--    Letting three holds lapse is forgivable - plans change, parents are slow.
--    Doing it twice over is a pattern. On the second full round the student is
--    soft-flagged: staff are told, the student is NOT, and they are
--    deprioritised for 7 days. They are never blocked from requesting, because
--    a blocked student just makes another account.
--
-- 3. A DEPRIORITISED STUDENT'S REQUEST IS A *SOFT* HOLD.
--    This is the part that does the work. Their booking is real and they can
--    still pay it, but it does not take the room off the market: the room stays
--    live for everybody else, and whoever acts first gets it. So the cost of
--    playing around is losing races, not losing access - and a genuine student
--    who simply had a bad month is inconvenienced rather than locked out.
--
-- WHY CONDUCT IS ITS OWN TABLE AND NOT COLUMNS ON `profiles`
--    The flag is deliberately invisible to the person flagged. `profiles` is
--    readable by its owner, so a column there would be visible the moment they
--    opened their own row - and freezing it against writes (as
--    guard_profile_privileged_cols must do for `role` and `roles`) would stop
--    them editing it, not seeing it. A separate table with no student-facing
--    policy cannot leak what it does not expose.
-- ============================================================================

-- ── 1. Conduct ──────────────────────────────────────────────────────────────

create table if not exists public.booking_conduct (
  student_id           uuid primary key references public.profiles (id) on delete cascade,
  -- Every hold this student has let run out. Monotonic; never decremented.
  lapses               integer not null default 0 check (lapses >= 0),
  -- Set when `lapses` crosses two full rounds. Kept even after the
  -- deprioritisation window closes, because it is the history a reviewer reads.
  flagged_at           timestamptz,
  deprioritised_until  timestamptz,
  updated_at           timestamptz not null default now()
);

comment on table public.booking_conduct is
  'Per-student booking behaviour. NOT readable by the student: the flag is deliberately silent, and this table exists rather than columns on profiles precisely so it cannot be read from their own row.';

alter table public.booking_conduct enable row level security;

-- Staff only. No student-facing policy at all, by design - see the table
-- comment. Every write happens inside SECURITY DEFINER functions below, which
-- bypass RLS, so the absence of an insert/update policy costs nothing.
drop policy if exists "booking_conduct_staff_read" on public.booking_conduct;
create policy "booking_conduct_staff_read" on public.booking_conduct
  for select using (public.is_staff());

/** How many lapses before the flag. Two full rounds of the concurrency cap. */
create or replace function public.lapse_flag_threshold()
returns integer language sql immutable as $$
  select public.max_holds_per_student() * 2
$$;

/** How long a flagged student is deprioritised. */
create or replace function public.deprioritise_interval()
returns interval language sql immutable as $$ select interval '7 days' $$;

/** The ceiling on a hold, however much the parties talk. */
create or replace function public.max_hold_interval()
returns interval language sql immutable as $$ select interval '72 hours' $$;

/**
 * Is this student currently deprioritised?
 *
 * SECURITY DEFINER so it can be asked from a trigger running as the student
 * without granting them any read on the table itself.
 */
create or replace function public.is_deprioritised(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.booking_conduct c
     where c.student_id = p_student
       and c.deprioritised_until is not null
       and c.deprioritised_until > now()
  );
$fn$;

revoke all on function public.is_deprioritised(uuid) from public, anon;
grant execute on function public.is_deprioritised(uuid) to authenticated, service_role;

-- ── 2. Soft holds ───────────────────────────────────────────────────────────

alter table public.bookings
  add column if not exists soft_hold      boolean not null default false,
  add column if not exists last_activity_at timestamptz;

comment on column public.bookings.soft_hold is
  'This booking does NOT take the room off the market. Set at insert for a deprioritised student; the room stays available and whoever acts first wins.';
comment on column public.bookings.last_activity_at is
  'Last message in this booking''s thread. Pushes reserved_until out, but never past locked_at + max_hold_interval().';

/**
 * A deprioritised student's hold is soft. Decided once, at insert, and then
 * left alone: a hold that silently hardened when a window closed would change
 * the rules under a booking already in flight.
 */
create or replace function public.set_soft_hold()
returns trigger language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    new.soft_hold := public.is_deprioritised(new.student_id);
  elsif current_user in ('authenticated', 'anon') then
    -- NOT re-evaluated on update, and not writable by the client either.
    --
    -- Re-evaluating would change the rules under a booking already in flight -
    -- a hold that hardened the moment a 7-day window closed, or softened the
    -- moment it opened, is a room changing hands for reasons neither party can
    -- see. It is decided once, at insert.
    --
    -- Freezing it against the client is the other half: `soft_hold = false` is
    -- worth a room, so a student who could PATCH it would hand themselves back
    -- the blocking power the flag just took away. Staff and the SECURITY
    -- DEFINER functions above run as neither role and can still lift it.
    new.soft_hold := old.soft_hold;
  end if;
  return new;
end;
$fn$;

-- Named _a_ so it runs BEFORE bookings_sync_hold and bookings_z_max_holds
-- (BEFORE triggers fire in alphabetical order) - both of them read soft_hold.
drop trigger if exists bookings_a_soft_hold on public.bookings;
create trigger bookings_a_soft_hold
  before insert or update on public.bookings
  for each row execute function public.set_soft_hold();

-- THE INDEX IS WHAT ACTUALLY RESERVES A ROOM, so this is where soft holds earn
-- their name. Excluding them means two students can hold the same room when one
-- of those holds is soft - which is the entire point.
drop index if exists public.bookings_one_hold_per_room_idx;
create unique index bookings_one_hold_per_room_idx
  on public.bookings (room_id)
  where status in ('awaiting_payment', 'confirmed') and not soft_hold;

-- ── 3. The hold deadline, with a ceiling ────────────────────────────────────

create or replace function public.sync_booking_hold()
returns trigger language plpgsql as $$
declare
  v_base timestamptz;
begin
  if new.status = 'awaiting_payment' then
    if new.locked_at is null then
      new.locked_at := now();
    end if;

    -- The latest thing that counts as the student still being present: the
    -- lock itself, a booked viewing, or the last message in the thread.
    v_base := greatest(
      new.locked_at,
      coalesce(new.last_activity_at, new.locked_at),
      coalesce(
        (select max(i.scheduled_for)
           from public.hostel_inspections i
          where i.booking_id = new.id
            and i.status in ('scheduled', 'completed')),
        new.locked_at
      )
    );

    -- ...but never past the ceiling. Without this `least`, activity extends the
    -- deadline without bound and the room is never released.
    new.reserved_until := least(
      v_base + public.hold_interval(),
      new.locked_at + public.max_hold_interval()
    );
  else
    -- Not a hold: clear it so a stale deadline can't keep blocking the room.
    new.reserved_until := null;
  end if;
  return new;
end;
$$;

/**
 * A message in a booking thread is the student still being there.
 *
 * Only touches `updated_at`; sync_booking_hold does the arithmetic, so the rule
 * lives in exactly one place - the same shape as sync_hold_from_inspection.
 */
create or replace function public.sync_hold_from_message()
returns trigger language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_booking uuid;
begin
  select c.subject_id into v_booking
    from public.conversations c
   where c.id = new.conversation_id
     and c.subject_type = 'booking';

  if v_booking is null then
    return new;
  end if;

  -- A system message is the platform talking, not the parties. Letting it
  -- extend the hold would mean our own progress notes kept the room parked.
  if new.kind = 'system' then
    return new;
  end if;

  update public.bookings
     set last_activity_at = now(),
         updated_at       = now()
   where id = v_booking
     and status = 'awaiting_payment';

  return new;
end;
$fn$;

drop trigger if exists messages_sync_hold on public.messages;
create trigger messages_sync_hold
  after insert on public.messages
  for each row execute function public.sync_hold_from_message();

-- ── 4. Room state must ignore soft holds ────────────────────────────────────
-- A soft hold does not reserve, so the view must not say `reserved`. Without
-- this the listing would show a room as taken while the index happily allowed
-- somebody else to take it - the display and the write path disagreeing, which
-- is the bug class this whole file exists to close.
create or replace view public.hostel_room_state as
select
  r.id        as room_id,
  r.hostel_id,
  r.label,
  coalesce(r.price_per_session_kobo, h.price_per_session_kobo) as price_kobo,
  case
    when not r.is_listed then 'unlisted'
    when exists (select 1 from public.bookings b
                  where b.room_id = r.id
                    and b.status = 'confirmed'
                    and not b.soft_hold) then 'booked'
    when exists (select 1 from public.bookings b
                  where b.room_id = r.id
                    and b.status = 'awaiting_payment'
                    and b.reserved_until > now()
                    and not b.soft_hold) then 'reserved'
    else 'free'
  end as state
from public.hostel_rooms r
join public.hostels h on h.id = r.hostel_id;

-- ── 5. Expiry counts lapses and raises the flag ─────────────────────────────

create or replace function public.expire_stale_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_expired integer;
  v_row     record;
begin
  -- Expire, and keep the owners so the same statement tells us who lapsed.
  with expired as (
    update public.bookings
       set status = 'expired', reserved_until = null, updated_at = now()
     where status = 'awaiting_payment'
       and reserved_until <= now()
    returning student_id
  ),
  counted as (
    select student_id, count(*)::integer as n
      from expired
     group by student_id
  ),
  bumped as (
    insert into public.booking_conduct as c (student_id, lapses, updated_at)
    select student_id, n, now() from counted
    on conflict (student_id) do update
      set lapses     = c.lapses + excluded.lapses,
          updated_at = now()
    returning c.student_id, c.lapses, c.flagged_at
  )
  select coalesce(sum(n), 0)::integer into v_expired from counted;

  -- Flag anyone who has now crossed the threshold and is not already flagged.
  -- Separate pass rather than inside the CTE: notifying is a side effect, and
  -- a data-modifying CTE cannot be relied on to run it once per row.
  for v_row in
    select student_id, lapses
      from public.booking_conduct
     where lapses >= public.lapse_flag_threshold()
       and flagged_at is null
  loop
    update public.booking_conduct
       set flagged_at          = now(),
           deprioritised_until = now() + public.deprioritise_interval(),
           updated_at          = now()
     where student_id = v_row.student_id;

    -- STAFF ONLY. The student is not told, by design: the whole value of a
    -- soft flag is that somebody gaming the board does not learn to game it
    -- differently. See the header.
    perform private.notify_staff(
      'booking_conduct_flagged',
      'Student flagged for repeated lapsed holds',
      format('%s room holds have now expired without payment. Deprioritised for 7 days - their requests no longer take rooms off the market.', v_row.lapses),
      '/admin/users',
      v_row.student_id,
      'profile'
    );
  end loop;

  return v_expired;
end;
$fn$;

revoke all on function public.expire_stale_holds() from public, anon, authenticated;
grant execute on function public.expire_stale_holds() to service_role;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_qual text;
  v_src  text;
begin
  -- The ceiling is the load-bearing half of "activity extends the hold". A
  -- rewrite that drops it restores the unexpirable-hold bug silently.
  select prosrc into v_src from pg_proc where proname = 'sync_booking_hold' limit 1;
  if v_src is null or position('max_hold_interval' in v_src) = 0 then
    raise exception 'sync_booking_hold has no ceiling - holds can be extended forever';
  end if;

  -- A soft hold that still occupies the per-room index reserves the room, which
  -- is exactly what it must not do.
  select pg_get_expr(indpred, indrelid) into v_qual
    from pg_index
   where indexrelid = 'public.bookings_one_hold_per_room_idx'::regclass;
  if v_qual is null or position('soft_hold' in v_qual) = 0 then
    raise exception 'the per-room hold index does not exclude soft holds';
  end if;

  -- Students must never be able to read their own flag.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'booking_conduct'
       and qual is not null
       and qual not like '%is_staff%'
  ) then
    raise exception 'booking_conduct has a non-staff policy - the flag would be visible to the flagged';
  end if;
end $$;
