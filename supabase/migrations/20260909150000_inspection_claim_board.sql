-- ============================================================================
-- inspection_claim_board
--
-- Student inspections stop being handed out and start being taken.
--
-- WHY THE ASSIGNMENT MODEL WAS THE WRONG ONE
--   `assign_inspection_agent` needs a staff member to be awake, to know which
--   agent is near Safari on a Tuesday, and to notice when the one they picked
--   never turned up. None of those are things a dispatcher in an office knows
--   better than the agents themselves. An open board answers all three by
--   asking the people who already have the answer.
--
-- THIS MIRRORS THE RIDER BOARD, DELIBERATELY
--   20260901270000 solved exactly this shape for deliveries: a redacted board,
--   a claim whose race is settled by a partial unique index, and a loser who
--   gets a clean error rather than half an assignment. Same problem, same
--   solution, same vocabulary - an agent who also rides meets one idea.
--
-- ONE SHOT PER AGENT, ENFORCED BY THE ROW THAT RECORDS THE ATTEMPT
--   `unique (inspection_id, agent_id)` is the whole of "the agent who missed it
--   does not get to apply again". The forfeited row is not cleaned up: it stays,
--   and it is what makes a second claim by that agent a constraint violation.
--   The history IS the block. Nothing has to remember to exclude them, and no
--   query can forget to.
--
-- WHAT THE BOARD DOES NOT SAY
--   Not the student's name, not their phone, not the street address. The board
--   is visible to every working agent on the campus and those details belong to
--   a student who has agreed to meet ONE of them. `claim_inspection` is what
--   unseals them, to the one person who is now going. This is the same
--   redaction `open_delivery_board` applies to a dropoff address, for the same
--   reason.
--
-- MISSING THE TIME RELEASES IT, AND THE SWEEP IS NOT THE ONLY PATH
--   `sweep_expired_inspection_claims` is for the ordinary case - nobody
--   noticed, the hour passed. Staff can also release one by hand the moment a
--   student rings to say nobody came, without waiting for a cron tick.
--
-- THE MONEY MOVES WITH THE WORK, ALWAYS
--   `escrow_holds.payee_id` is set on claim and cleared on release, in the same
--   transaction as `ambassador_id`, for the reason 20260906210000 gives: the
--   row that says who is going and the row that says who gets paid must never
--   disagree. A forfeited inspection must not still be pointing its fee at the
--   agent who did not turn up.
--
-- ROLLBACK
--   drop function if exists public.sweep_expired_inspection_claims(integer);
--   drop function if exists public.release_inspection_claim(uuid, text);
--   drop function if exists public.claim_inspection(uuid);
--   drop function if exists public.open_inspection_board(integer);
--   drop table if exists public.inspection_claims;
--   delete from public.app_settings where key = 'inspection_claim_grace_minutes';
--   -- and restore assign_inspection_agent from 20260909120000.
-- ============================================================================

-- ── 1. How late is too late ─────────────────────────────────────────────────
-- Generous on purpose. A student is late, a bike breaks, a gate is locked. An
-- hour past the agreed time is somebody who is not coming, not somebody stuck
-- in traffic.
insert into public.app_settings (key, value) values
  ('inspection_claim_grace_minutes', '60'::jsonb)
on conflict (key) do nothing;

-- ── 2. Who has had a go ─────────────────────────────────────────────────────
create table if not exists public.inspection_claims (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references public.hostel_inspections (id) on delete cascade,
  agent_id       uuid not null references public.profiles (id) on delete cascade,
  status         text not null default 'claimed'
                   check (status in ('claimed', 'completed', 'forfeited')),
  claimed_at     timestamptz not null default now(),
  released_at    timestamptz,
  release_reason text,
  -- ONE ATTEMPT PER AGENT, FOR EVER. See the header: this is the rule, not an
  -- optimisation. A forfeited row makes a re-claim a unique violation.
  unique (inspection_id, agent_id)
);

-- The race. Two agents tapping at once: the second insert violates this and is
-- told somebody beat them, in the database, before either transaction has
-- touched hostel_inspections.
create unique index if not exists inspection_claims_one_active_idx
  on public.inspection_claims (inspection_id)
  where status = 'claimed';

create index if not exists inspection_claims_agent_idx
  on public.inspection_claims (agent_id, claimed_at desc);

comment on table public.inspection_claims is
  'Every attempt at an inspection, kept for ever. A forfeited row is what stops that agent claiming the same job twice.';

alter table public.inspection_claims enable row level security;

-- An agent sees their own attempts; staff see all of them. Nobody writes
-- through the Data API - the functions below are the only way in.
drop policy if exists "inspection_claims_own_read" on public.inspection_claims;
create policy "inspection_claims_own_read" on public.inspection_claims
  for select to authenticated
  using (agent_id = (select auth.uid()) or public.is_staff());

grant select on public.inspection_claims to authenticated;

-- ── 3. The open board ───────────────────────────────────────────────────────
-- REDACTED BY DESIGN. See the header.
create or replace function public.open_inspection_board(p_limit integer default 50)
returns table (
  inspection_id uuid,
  hostel_id     uuid,
  hostel_name   text,
  area          text,
  scheduled_for timestamptz,
  fee_kobo      bigint,
  claimed_before boolean
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

  -- Not an agent, or not one who may work right now. An empty board rather
  -- than an exception: the screen renders the same either way and the reason
  -- belongs in the banner above it.
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
           i.fee_kobo::bigint,
           false
      from public.hostel_inspections i
      join public.hostels h on h.id = i.hostel_id
     where i.status = 'scheduled'
       and i.ambassador_id is null
       -- Nothing already in the past: an agent cannot take a job whose time has
       -- been and gone, and offering it wastes the only thing a board is for.
       and i.scheduled_for > now()
       -- THE ONE-SHOT RULE, on the read side too. The claim would be refused by
       -- the unique constraint anyway; showing a job somebody cannot take is a
       -- button that exists to fail.
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

comment on function public.open_inspection_board is
  'Unclaimed inspections an agent may take, redacted: no student and no street address until claimed. Empty for anyone who is not a working agent, and never shows a job this agent has already had.';

-- ── 4. Taking one ───────────────────────────────────────────────────────────
create or replace function public.claim_inspection(p_inspection uuid)
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

  if v_i.scheduled_for <= now() then
    raise exception 'That viewing time has already passed' using errcode = 'P0001';
  end if;

  -- The race AND the one-shot rule, both settled here. Two different unique
  -- constraints, one error each, and the message says which happened because
  -- they mean completely different things to the agent reading it.
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

  update public.hostel_inspections
     set ambassador_id = v_uid, updated_at = now()
   where id = p_inspection;

  -- The fee follows the work, in the same transaction. See the header.
  select * into v_hold from public.escrow_holds
   where inspection_id = p_inspection for update;
  if found and v_hold.status = 'held' then
    update public.escrow_holds
       set payee_id = v_uid, updated_at = now()
     where id = v_hold.id;
  end if;

  select h.name into v_place from public.hostels h where h.id = v_i.hostel_id;

  -- THE STUDENT, BY NAME. They paid for a stranger to meet them somewhere; the
  -- least they are owed is the stranger's name before he arrives.
  perform private.notify(
    v_i.student_id,
    'verification',
    'An agent is taking your viewing',
    v_agent || ' will meet you at ' || coalesce(v_place, 'the hostel') || '.',
    'bookings',
    null,
    p_inspection,
    'hostel_inspection'
  );

  insert into private.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    v_uid, 'agent', 'inspection.claimed', 'hostel_inspection', p_inspection::text,
    jsonb_build_object('agent', v_uid, 'hostel', v_i.hostel_id)
  );

  return p_inspection;
end;
$fn$;

revoke all on function public.claim_inspection(uuid) from public, anon;
grant execute on function public.claim_inspection(uuid) to authenticated, service_role;

comment on function public.claim_inspection is
  'Take an unclaimed inspection. Concurrent claims are settled by inspection_claims_one_active_idx; a second attempt by the same agent is refused for ever by the (inspection_id, agent_id) unique.';

-- ── 5. Letting it go, or losing it ──────────────────────────────────────────
-- One function for both the sweep and a staff release, so "what happens when an
-- agent loses a job" is defined once.
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

  -- Staff, or the agent handing it back themselves. An agent who knows at noon
  -- they cannot make four o'clock should be able to say so - that is a better
  -- outcome for the student than a no-show, and they lose the job either way.
  if not public.is_staff() and v_was is distinct from v_uid then
    raise exception 'That inspection is not yours' using errcode = '42501';
  end if;

  if v_was is null then
    -- Already back on the board. Not an error: two staff clicking at once, or a
    -- sweep racing a manual release, should both end with it released.
    return p_inspection;
  end if;

  if v_i.report_filed_at is not null then
    raise exception 'That inspection has already been reported on' using errcode = 'P0001';
  end if;

  update public.inspection_claims
     set status = 'forfeited', released_at = now(), release_reason = p_reason
   where inspection_id = p_inspection and agent_id = v_was and status = 'claimed';

  update public.hostel_inspections
     set ambassador_id = null, updated_at = now()
   where id = p_inspection;

  -- The fee stops pointing at them the moment the work does.
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
    'visits',
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

-- ── 6. The sweep ────────────────────────────────────────────────────────────
-- Bounded like release_matured_escrow: a limit, so one bad night cannot turn
-- into a transaction that runs for an hour.
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
       and i.scheduled_for + make_interval(mins => v_grace) < now()
     order by i.scheduled_for
     limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    perform public.release_inspection_claim(v_id, 'missed the agreed time');
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$fn$;

revoke all on function public.sweep_expired_inspection_claims(integer) from public, anon;
grant execute on function public.sweep_expired_inspection_claims(integer) to service_role;

comment on function public.sweep_expired_inspection_claims is
  'Releases inspections whose agent never filed, past the grace period, back onto the board. Call from cron. service_role only.';

-- ── 7. Staff assignment records a claim too ─────────────────────────────────
-- Otherwise the two routes disagree about who has had a go: an agent assigned
-- by hand, who then no-showed, could be handed the same job again by the board.
-- Same body as 20260909120000 with the claim row added.
create or replace function public.assign_inspection_agent(
  p_inspection uuid,
  p_agent      uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_i    public.hostel_inspections%rowtype;
  v_hold public.escrow_holds%rowtype;
  v_uid  uuid := (select auth.uid());
begin
  if not public.is_staff() then
    raise exception 'Only staff can assign an inspection' using errcode = '42501';
  end if;

  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  if v_i.status not in ('pending_payment', 'scheduled') then
    raise exception 'That inspection is already finished' using errcode = 'P0001';
  end if;

  if p_agent is not null and not exists (
    select 1 from public.profiles
     where id = p_agent
       and ('agent' = any (coalesce(roles, array[]::text[])) or role = 'agent')
  ) then
    raise exception 'That account is not an agent' using errcode = '22023';
  end if;

  if p_agent is not null and p_agent = v_i.student_id then
    raise exception 'An agent cannot inspect for themselves' using errcode = '22023';
  end if;

  select * into v_hold from public.escrow_holds
   where inspection_id = p_inspection for update;

  if found and v_hold.status <> 'held' then
    raise exception 'That inspection has already been settled' using errcode = 'P0001';
  end if;

  -- The outgoing agent forfeits, exactly as a sweep would leave them.
  if v_i.ambassador_id is not null and v_i.ambassador_id is distinct from p_agent then
    update public.inspection_claims
       set status = 'forfeited', released_at = now(),
           release_reason = 'reassigned by staff'
     where inspection_id = p_inspection
       and agent_id = v_i.ambassador_id
       and status = 'claimed';

    insert into private.audit_log
      (actor_id, actor_role, action, entity_type, entity_id, before)
    values (
      v_uid, 'staff', 'inspection.unassigned', 'hostel_inspection', p_inspection::text,
      jsonb_build_object('agent', v_i.ambassador_id, 'hostel', v_i.hostel_id)
    );
  end if;

  update public.hostel_inspections
     set ambassador_id = p_agent, updated_at = now()
   where id = p_inspection;

  if found then
    update public.escrow_holds
       set payee_id = p_agent, updated_at = now()
     where id = v_hold.id;
  end if;

  if p_agent is not null and p_agent is distinct from v_i.ambassador_id then
    -- ON CONFLICT, not a plain insert: staff overriding onto an agent who once
    -- forfeited this job is a deliberate act by a person who can see the
    -- history. The board's one-shot rule is for agents choosing for themselves;
    -- it is not a punishment staff must be unable to lift.
    insert into public.inspection_claims (inspection_id, agent_id, status)
    values (p_inspection, p_agent, 'claimed')
    on conflict (inspection_id, agent_id)
      do update set status = 'claimed', claimed_at = now(),
                    released_at = null, release_reason = null;

    insert into private.audit_log
      (actor_id, actor_role, action, entity_type, entity_id, after)
    values (
      v_uid, 'staff', 'inspection.assigned', 'hostel_inspection', p_inspection::text,
      jsonb_build_object('agent', p_agent, 'hostel', v_i.hostel_id)
    );
  end if;

  return p_inspection;
end;
$fn$;

revoke all on function public.assign_inspection_agent(uuid, uuid) from public, anon;
grant execute on function public.assign_inspection_agent(uuid, uuid) to authenticated, service_role;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_src text;
begin
  if to_regclass('public.inspection_claims') is null then
    raise exception 'inspection_claims missing';
  end if;
  if to_regprocedure('public.open_inspection_board(integer)') is null then
    raise exception 'open_inspection_board missing';
  end if;
  if to_regprocedure('public.claim_inspection(uuid)') is null then
    raise exception 'claim_inspection missing';
  end if;
  if to_regprocedure('public.release_inspection_claim(uuid, text)') is null then
    raise exception 'release_inspection_claim missing';
  end if;
  if to_regprocedure('public.sweep_expired_inspection_claims(integer)') is null then
    raise exception 'sweep_expired_inspection_claims missing';
  end if;

  -- The one-shot rule is the feature. If this index is absent the board will
  -- happily hand a job back to the agent who dropped it.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'inspection_claims'
       and indexdef like '%UNIQUE%' and indexdef like '%inspection_id, agent_id%'
  ) then
    raise exception 'inspection_claims is missing its (inspection_id, agent_id) unique';
  end if;

  select prosrc into v_src from pg_proc where proname = 'assign_inspection_agent' limit 1;
  if position('inspection_claims' in v_src) = 0 then
    raise exception 'assign_inspection_agent does not record a claim - the old version is installed';
  end if;
end $$;
