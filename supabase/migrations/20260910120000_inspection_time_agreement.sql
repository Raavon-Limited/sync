-- ============================================================================
-- inspection_time_agreement
--
-- Taking a viewing stops being the end of the negotiation and becomes the start
-- of one.
--
-- WHAT WAS WRONG WITH CLAIM-AND-GO
--   `claim_inspection` assigned the agent and told the student "X will meet you
--   at Y" as a statement of fact. Neither of them had agreed a time: the only
--   time on the row was `scheduled_for`, which the STUDENT picked when they
--   paid, before any agent existed and without knowing whether one was free
--   then. So the platform confirmed a meeting that nobody on either side had
--   said yes to, and the first anyone found out was when one of them stood at a
--   gate alone.
--
-- THE SHAPE NOW
--   agent takes it and PROPOSES a time  ->  student confirms  ->  it is on
--                                       \-> student declines  -> back on the board
--
--   The claim is real from the moment it is taken - the row leaves the board, so
--   two agents cannot both be proposing - but nothing is agreed until the
--   student says so.
--
-- A DECLINE IS NOT A NO-SHOW
--   It returns the request to the board and forfeits that agent's claim, which
--   means `inspection_claims`' (inspection_id, agent_id) unique stops them
--   taking it again. That is deliberate: the student has seen this agent's offer
--   and said no to it, so the next proposal should come from somebody else. It
--   costs the agent nothing else - no fee moves, and it is not recorded against
--   them as a missed visit.
--
-- WHY NOT A NEW STATUS
--   `status` is read by the sweep, the escrow trigger, settle_inspection, the
--   student's bookings list and three screens. Threading a sixth value through
--   all of them to express "claimed but not agreed" would touch every one. Two
--   nullable timestamps say the same thing and are invisible to everything that
--   does not ask.
--
-- ROLLBACK
--   alter table public.hostel_inspections
--     drop column if exists proposed_for, drop column if exists student_confirmed_at;
--   drop function if exists public.confirm_inspection_time(uuid);
--   drop function if exists public.decline_inspection_time(uuid, text);
--   -- and restore claim_inspection / open_inspection_board /
--   -- sweep_expired_inspection_claims from 20260910... and 20260909150000.
-- ============================================================================

alter table public.hostel_inspections
  add column if not exists proposed_for         timestamptz,
  add column if not exists student_confirmed_at timestamptz;

comment on column public.hostel_inspections.proposed_for is
  'The time the AGENT offered when they took the request. Not agreed until student_confirmed_at is set.';
comment on column public.hostel_inspections.student_confirmed_at is
  'The student accepted the agent''s proposed time. Until this is set the viewing is not arranged, whatever scheduled_for says.';

-- ── 1. The board ────────────────────────────────────────────────────────────
-- Two changes: the student's availability note comes with it (an agent cannot
-- propose a sensible time without knowing when they said they were free), and
-- a request whose ORIGINALLY preferred slot has passed is still on the board.
-- The old `scheduled_for > now()` guard quietly stranded every request nobody
-- happened to pick up in time, with the student's money already taken.
create or replace function public.open_inspection_board(p_limit integer default 50)
returns table (
  inspection_id     uuid,
  hostel_id         uuid,
  hostel_name       text,
  area              text,
  scheduled_for     timestamptz,
  availability_note text,
  fee_kobo          bigint,
  claimed_before    boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_ok  boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select ('agent' = any (coalesce(p.roles, array[]::text[])) or p.role = 'agent')
         and p.archived_at is null
         and p.suspended_at is null
    into v_ok
    from public.profiles p
   where p.id = v_uid;

  if not found or not coalesce(v_ok, false) then
    return;
  end if;

  return query
    select i.id,
           h.id,
           h.name,
           -- Area, not the street. The exact address is unsealed on claim.
           h.area,
           i.scheduled_for,
           i.availability_note,
           i.fee_kobo::bigint,
           false
      from public.hostel_inspections i
      join public.hostels h on h.id = i.hostel_id
     where i.status = 'scheduled'
       and i.ambassador_id is null
       -- The one-shot rule, on the read side too: showing a job somebody cannot
       -- take is a button that exists to fail.
       and not exists (
         select 1 from public.inspection_claims c
          where c.inspection_id = i.id and c.agent_id = v_uid
       )
     order by i.scheduled_for
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$fn$;

revoke all on function public.open_inspection_board(integer) from public, anon;
grant execute on function public.open_inspection_board(integer) to authenticated, service_role;

-- ── 2. Taking one is proposing a time ───────────────────────────────────────
create or replace function public.claim_inspection(
  p_inspection uuid,
  p_meeting    text        default null,
  p_proposed   timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := (select auth.uid());
  v_i     public.hostel_inspections%rowtype;
  v_hold  public.escrow_holds%rowtype;
  v_agent text;
  v_place text;
  v_point text := nullif(btrim(coalesce(p_meeting, '')), '');
  v_when  timestamptz;
  v_ok    boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select ('agent' = any (coalesce(p.roles, array[]::text[])) or p.role = 'agent')
         and p.archived_at is null
         and p.suspended_at is null,
         coalesce(nullif(trim(p.full_name), ''), 'A Sync agent')
    into v_ok, v_agent
    from public.profiles p
   where p.id = v_uid;

  if not found or not coalesce(v_ok, false) then
    raise exception 'Only a working agent can take an inspection' using errcode = '42501';
  end if;

  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  if v_i.ambassador_id is not null or v_i.status <> 'scheduled' then
    raise exception 'Somebody already took this one' using errcode = 'P0001';
  end if;

  -- The agent's own offer, falling back to what the student originally asked
  -- for. A proposal in the past is not a proposal.
  v_when := coalesce(p_proposed, v_i.scheduled_for);
  if v_when is null or v_when <= now() then
    raise exception 'Offer a time in the future' using errcode = '22023';
  end if;

  begin
    insert into public.inspection_claims (inspection_id, agent_id, status)
    values (p_inspection, v_uid, 'claimed');
  exception
    when unique_violation then
      if exists (
        select 1 from public.inspection_claims
         where inspection_id = p_inspection and agent_id = v_uid
      ) then
        raise exception 'You have already had this one. It is open to other agents now.'
          using errcode = 'P0001';
      end if;
      raise exception 'Somebody already took this one' using errcode = 'P0001';
  end;

  -- `scheduled_for` is NOT moved yet. It is what the student asked for, and it
  -- stays that until they accept the agent's offer   otherwise a decline would
  -- leave the request back on the board carrying a time nobody chose.
  update public.hostel_inspections
     set ambassador_id        = v_uid,
         proposed_for         = v_when,
         student_confirmed_at = null,
         meeting_point        = coalesce(v_point, meeting_point),
         updated_at           = now()
   where id = p_inspection;

  select * into v_hold from public.escrow_holds
   where inspection_id = p_inspection for update;
  if found and v_hold.status = 'held' then
    update public.escrow_holds
       set payee_id = v_uid, updated_at = now()
     where id = v_hold.id;
  end if;

  select h.name into v_place from public.hostels h where h.id = v_i.hostel_id;

  -- ASKS, RATHER THAN ANNOUNCES. The old message said an agent "will meet you",
  -- which was a claim about a meeting neither of them had agreed to.
  perform private.notify(
    v_i.student_id,
    'verification',
    'An agent offered a time for your viewing',
    v_agent || ' can show you ' || coalesce(v_place, 'the hostel') || ' on ' ||
      to_char(v_when at time zone 'Africa/Lagos', 'FMDay FMDD FMMonth, HH12:MIam') ||
      coalesce(' (' || v_point || ')', '') || '. Confirm if that works.',
    'bookings',
    null,
    p_inspection,
    'hostel_inspection'
  );

  insert into private.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    v_uid, 'agent', 'inspection.claimed', 'hostel_inspection', p_inspection::text,
    jsonb_build_object('agent', v_uid, 'hostel', v_i.hostel_id, 'proposed', v_when)
  );

  return p_inspection;
end;
$fn$;

revoke all on function public.claim_inspection(uuid, text, timestamptz) from public, anon;
grant execute on function public.claim_inspection(uuid, text, timestamptz)
  to authenticated, service_role;

-- The 2-arg version would still resolve and silently drop the proposed time.
drop function if exists public.claim_inspection(uuid, text);

-- ── 3. The student says yes ─────────────────────────────────────────────────
create or replace function public.confirm_inspection_time(p_inspection uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_i   public.hostel_inspections%rowtype;
  v_who text;
begin
  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  if v_i.student_id is distinct from v_uid then
    raise exception 'That viewing is not yours' using errcode = '42501';
  end if;
  if v_i.ambassador_id is null or v_i.proposed_for is null then
    raise exception 'No agent has offered a time yet' using errcode = 'P0001';
  end if;
  if v_i.status <> 'scheduled' then
    raise exception 'That viewing is already settled' using errcode = 'P0001';
  end if;

  -- NOW the agreed time becomes the time. Everything downstream   the sweep,
  -- the grace period, the agent's list   reads scheduled_for, and until this
  -- point it still held what the student originally asked for.
  update public.hostel_inspections
     set scheduled_for        = v_i.proposed_for,
         student_confirmed_at = coalesce(student_confirmed_at, now()),
         updated_at           = now()
   where id = p_inspection;

  select coalesce(nullif(trim(full_name), ''), 'The student') into v_who
    from public.profiles where id = v_uid;

  perform private.notify(
    v_i.ambassador_id,
    'verification',
    'Your viewing is confirmed',
    coalesce(nullif(trim(v_i.full_name), ''), v_who) || ' confirmed ' ||
      to_char(v_i.proposed_for at time zone 'Africa/Lagos', 'FMDay FMDD FMMonth, HH12:MIam') || '.',
    'requests',
    null,
    p_inspection,
    'hostel_inspection'
  );

  insert into private.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    v_uid, 'student', 'inspection.time_confirmed', 'hostel_inspection', p_inspection::text,
    jsonb_build_object('agent', v_i.ambassador_id, 'hostel', v_i.hostel_id,
                       'proposed', v_i.proposed_for)
  );

  return p_inspection;
end;
$fn$;

revoke all on function public.confirm_inspection_time(uuid) from public, anon;
grant execute on function public.confirm_inspection_time(uuid) to authenticated, service_role;

-- ── 4. The student says no, and it goes back ────────────────────────────────
create or replace function public.decline_inspection_time(
  p_inspection uuid,
  p_reason     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_i      public.hostel_inspections%rowtype;
  v_hold   public.escrow_holds%rowtype;
  v_was    uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  if v_i.student_id is distinct from v_uid then
    raise exception 'That viewing is not yours' using errcode = '42501';
  end if;
  if v_i.status <> 'scheduled' then
    raise exception 'That viewing is already settled' using errcode = 'P0001';
  end if;

  v_was := v_i.ambassador_id;
  if v_was is null then
    -- Already back on the board. Not an error   a student tapping twice and a
    -- sweep racing them should both end in the same place.
    return p_inspection;
  end if;

  if v_i.student_confirmed_at is not null then
    raise exception 'You already confirmed this time. Ask the agent to move it instead.'
      using errcode = 'P0001';
  end if;

  -- The claim is forfeited, which is what the (inspection_id, agent_id) unique
  -- reads as "this agent has had their turn". The student has seen this offer
  -- and said no; the next one should come from somebody else.
  update public.inspection_claims
     set status = 'forfeited', released_at = now(),
         release_reason = coalesce(v_reason, 'the student could not make that time')
   where inspection_id = p_inspection and agent_id = v_was and status = 'claimed';

  update public.hostel_inspections
     set ambassador_id = null,
         proposed_for  = null,
         meeting_point = null,
         updated_at    = now()
   where id = p_inspection;

  -- The fee stops pointing at them the moment the work does.
  select * into v_hold from public.escrow_holds
   where inspection_id = p_inspection for update;
  if found and v_hold.status = 'held' then
    update public.escrow_holds
       set payee_id = null, updated_at = now()
     where id = v_hold.id;
  end if;

  -- NO BLAME. Declining a time is not a missed visit, and the message says so:
  -- an agent who reads this as a strike will stop offering times.
  perform private.notify(
    v_was,
    'verification',
    'A student could not make your time',
    'That viewing is back on the board for another agent' ||
      coalesce(': ' || v_reason, '') || '. Nothing is recorded against you.',
    'requests',
    null,
    p_inspection,
    'hostel_inspection'
  );

  insert into private.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, before)
  values (
    v_uid, 'student', 'inspection.time_declined', 'hostel_inspection', p_inspection::text,
    jsonb_build_object('agent', v_was, 'hostel', v_i.hostel_id, 'reason', v_reason)
  );

  return p_inspection;
end;
$fn$;

revoke all on function public.decline_inspection_time(uuid, text) from public, anon;
grant execute on function public.decline_inspection_time(uuid, text) to authenticated, service_role;

-- ── 5. The sweep also frees a proposal nobody answered ──────────────────────
-- Otherwise an agent takes a request, the student never replies, and it sits
-- claimed for ever   off the board and never happening.
create or replace function public.sweep_expired_inspection_claims(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_grace integer := private.setting_int('inspection_claim_grace_minutes', 60);
  v_id    uuid;
  v_n     integer := 0;
begin
  for v_id in
    select i.id
      from public.hostel_inspections i
     where i.status = 'scheduled'
       and i.ambassador_id is not null
       and i.report_filed_at is null
       and (
         -- A confirmed viewing whose time came and went unfiled.
         (i.student_confirmed_at is not null
          and i.scheduled_for + make_interval(mins => v_grace) < now())
         -- Or an offer the student never answered, past the time it was for.
         or (i.student_confirmed_at is null
             and i.proposed_for is not null
             and i.proposed_for + make_interval(mins => v_grace) < now())
       )
     order by coalesce(i.proposed_for, i.scheduled_for)
     limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    perform public.release_inspection_claim(v_id, 'the agreed time passed with no report');
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$fn$;

revoke all on function public.sweep_expired_inspection_claims(integer) from public, anon;
grant execute on function public.sweep_expired_inspection_claims(integer) to service_role;

-- Releasing must clear the proposal too, or a request returns to the board
-- carrying a dead offer.
create or replace function public.release_inspection_claim(
  p_inspection uuid,
  p_reason     text default 'missed the agreed time'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid  uuid := (select auth.uid());
  v_i    public.hostel_inspections%rowtype;
  v_hold public.escrow_holds%rowtype;
  v_was  uuid;
begin
  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  v_was := v_i.ambassador_id;

  if not public.is_staff() and v_was is distinct from v_uid and v_uid is not null then
    raise exception 'That inspection is not yours' using errcode = '42501';
  end if;

  if v_was is null then
    return p_inspection;
  end if;

  if v_i.report_filed_at is not null then
    raise exception 'That inspection has already been reported on' using errcode = 'P0001';
  end if;

  update public.inspection_claims
     set status = 'forfeited', released_at = now(), release_reason = p_reason
   where inspection_id = p_inspection and agent_id = v_was and status = 'claimed';

  update public.hostel_inspections
     set ambassador_id        = null,
         proposed_for         = null,
         student_confirmed_at = null,
         meeting_point        = null,
         updated_at           = now()
   where id = p_inspection;

  select * into v_hold from public.escrow_holds
   where inspection_id = p_inspection for update;
  if found and v_hold.status = 'held' then
    update public.escrow_holds
       set payee_id = null, updated_at = now()
     where id = v_hold.id;
  end if;

  perform private.notify(
    v_was,
    'verification',
    'You lost an inspection',
    'It is open to other agents again: ' || p_reason || '. You cannot take this one back.',
    'requests',
    null,
    p_inspection,
    'hostel_inspection'
  );

  insert into private.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, before)
  values (
    v_uid,
    case when v_uid is null then 'system'
         when v_uid = v_was then 'agent'
         else 'staff' end,
    'inspection.forfeited', 'hostel_inspection', p_inspection::text,
    jsonb_build_object('agent', v_was, 'hostel', v_i.hostel_id, 'reason', p_reason)
  );

  return p_inspection;
end;
$fn$;

revoke all on function public.release_inspection_claim(uuid, text) from public, anon;
grant execute on function public.release_inspection_claim(uuid, text) to authenticated, service_role;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'hostel_inspections'
       and column_name = 'proposed_for'
  ) then
    raise exception 'hostel_inspections.proposed_for missing';
  end if;
  if to_regprocedure('public.confirm_inspection_time(uuid)') is null then
    raise exception 'confirm_inspection_time missing';
  end if;
  if to_regprocedure('public.decline_inspection_time(uuid, text)') is null then
    raise exception 'decline_inspection_time missing';
  end if;
  if to_regprocedure('public.claim_inspection(uuid, text)') is not null then
    raise exception 'the 2-arg claim_inspection still exists';
  end if;
end $$;
