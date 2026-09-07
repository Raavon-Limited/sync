-- ============================================================================
-- inspection_meeting_and_outcome
--
-- Corrects 20260909180000, which modelled a student inspection as if it were a
-- verification visit. It is not, and the difference is the whole shape of the
-- feature.
--
-- A VERIFICATION VISIT: the agent goes ALONE, and photographs are the only
-- thing that can tell a reviewer what was there. Evidence is the point.
--
-- A STUDENT INSPECTION: the agent and the student walk through the house
-- TOGETHER. The student is the witness. Photographs of a building prove nothing
-- to somebody who just stood in it, and a selfie at the property is ceremony on
-- a job an agent may do five times in an afternoon. 20260909180000 added
-- `report_photos`, `report_video_url` and `report_selfie_url` to
-- hostel_inspections on that mistaken reading; they are dropped here. Nothing
-- has been written to them   they were added and corrected on the same day.
--
-- The proof that the viewing happened was already in the schema and I missed
-- it: `settle_inspection` lets the STUDENT confirm their own visit as
-- 'completed'. That is the evidence. Two people who met both say so.
--
-- WHAT WAS ACTUALLY MISSING
--
--   1. WHERE THEY MEET. Neither side knew. `availability_note` is when the
--      student is free, not where to find them, and the hostel address is no
--      help when the arrangement is "meet me at the gate and I will walk you
--      over". The AGENT sets it, on claiming: they know the area, which gate is
--      usable, and whether the place is findable by a stranger.
--
--   2. THE STUDENT'S CONFIRMATION, in the product. The RPC allowed it and no
--      screen called it, so every fee waited the full 24-hour auto-release and
--      an agent who never turned up was paid anyway unless staff intervened.
--
--   3. A WAY TO SAY NOBODY CAME. Deliberately NOT self-settling: 20260906180000
--      is explicit that neither party may declare the other a no-show, and that
--      rule is right. Disputing CLEARS `release_after` instead   a null is
--      never swept by release_matured_escrow (20260906180000 relies on exactly
--      that for an unfiled inspection), so the money simply waits for a human
--      rather than being moved by an accusation.
--
-- ROLLBACK
--   alter table public.hostel_inspections
--     drop column if exists meeting_point, drop column if exists outcome,
--     drop column if exists disputed_at,   drop column if exists dispute_reason,
--     add column report_photos text[] not null default '{}',
--     add column report_video_url text, add column report_selfie_url text;
--   drop function if exists public.dispute_inspection(uuid, text);
--   drop function if exists public.set_inspection_meeting_point(uuid, text);
--   -- and restore claim_inspection / file_inspection_report from 20260909180000.
-- ============================================================================

-- ── 1. Columns ──────────────────────────────────────────────────────────────
alter table public.hostel_inspections
  add column if not exists meeting_point  text,
  -- The agent's account of the meeting. NOT the settlement: settle_inspection
  -- still owns the money, and staff still own a no-show decision.
  add column if not exists outcome        text
    check (outcome is null or outcome in ('viewed', 'student_no_show')),
  add column if not exists disputed_at    timestamptz,
  add column if not exists dispute_reason text;

comment on column public.hostel_inspections.meeting_point is
  'Where the agent will meet the student. Set by the agent on claiming, because they know which gate is usable. Null means at the property.';

comment on column public.hostel_inspections.disputed_at is
  'The student says the viewing did not happen. Clears release_after so the fee waits for staff; it does not settle anything on its own.';

-- The evidence fields from 20260909180000. See the header: wrong model.
alter table public.hostel_inspections
  drop column if exists report_photos,
  drop column if exists report_video_url,
  drop column if exists report_selfie_url;

-- ── 2. Setting the meeting point ────────────────────────────────────────────
create or replace function public.set_inspection_meeting_point(
  p_inspection uuid,
  p_point      text
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := (select auth.uid());
  v_i     public.hostel_inspections%rowtype;
  v_point text := nullif(btrim(coalesce(p_point, '')), '');
  v_agent text;
  v_place text;
begin
  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  if v_i.ambassador_id is distinct from v_uid and not public.is_staff() then
    raise exception 'That inspection is not yours' using errcode = '42501';
  end if;

  if v_i.status <> 'scheduled' then
    raise exception 'That inspection is not scheduled' using errcode = 'P0001';
  end if;

  update public.hostel_inspections
     set meeting_point = v_point, updated_at = now()
   where id = p_inspection;

  select coalesce(nullif(trim(full_name), ''), 'Your agent') into v_agent
    from public.profiles where id = v_i.ambassador_id;
  select h.name into v_place from public.hostels h where h.id = v_i.hostel_id;

  -- CHANGING IT RE-NOTIFIES. A student who has already set off needs to hear
  -- that the meeting point moved more than they needed the first message.
  perform private.notify(
    v_i.student_id,
    'verification',
    'Where to meet your agent',
    v_agent || ' will meet you at ' ||
      coalesce(v_point, coalesce(v_place, 'the hostel')) || '.',
    'bookings',
    null,
    p_inspection,
    'hostel_inspection'
  );

  return v_point;
end;
$fn$;

revoke all on function public.set_inspection_meeting_point(uuid, text) from public, anon;
grant execute on function public.set_inspection_meeting_point(uuid, text)
  to authenticated, service_role;

-- ── 3. Claiming, with the meeting point in the same breath ──────────────────
-- Everything except the p_meeting argument and the notification text is
-- 20260909180000 verbatim.
create or replace function public.claim_inspection(
  p_inspection uuid,
  p_meeting    text default null
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
     set ambassador_id = v_uid,
         meeting_point = coalesce(v_point, meeting_point),
         updated_at    = now()
   where id = p_inspection;

  select * into v_hold from public.escrow_holds
   where inspection_id = p_inspection for update;
  if found and v_hold.status = 'held' then
    update public.escrow_holds
       set payee_id = v_uid, updated_at = now()
     where id = v_hold.id;
  end if;

  select h.name into v_place from public.hostels h where h.id = v_i.hostel_id;

  -- WHERE, not just who. The old message named the agent and the hostel, which
  -- is no use to a student who has been told to wait at a junction.
  perform private.notify(
    v_i.student_id,
    'verification',
    'An agent is taking your viewing',
    v_agent || ' will meet you at ' ||
      coalesce(v_point, coalesce(v_place, 'the hostel')) || '.',
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

revoke all on function public.claim_inspection(uuid, text) from public, anon;
grant execute on function public.claim_inspection(uuid, text) to authenticated, service_role;

-- The 1-arg version would otherwise still resolve and silently drop the
-- meeting point.
drop function if exists public.claim_inspection(uuid);

-- ── 4. Filing: what happened, not what it looked like ───────────────────────
create or replace function public.file_inspection_report(
  p_inspection uuid,
  p_notes      text default null,
  p_outcome    text default 'viewed'
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_i     public.hostel_inspections%rowtype;
  v_uid   uuid := (select auth.uid());
  v_hours integer := private.setting_int('inspection_release_hours', 24);
  v_due   timestamptz;
begin
  if p_outcome not in ('viewed', 'student_no_show') then
    raise exception 'unknown outcome %', p_outcome using errcode = '22023';
  end if;

  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  if v_i.ambassador_id is distinct from v_uid and not public.is_staff() then
    raise exception 'That inspection is not yours' using errcode = '42501';
  end if;

  if v_i.status <> 'scheduled' then
    raise exception 'That inspection is not scheduled' using errcode = 'P0001';
  end if;

  v_due := now() + make_interval(hours => v_hours);

  update public.hostel_inspections
     set report_filed_at = coalesce(report_filed_at, now()),
         report_notes    = coalesce(p_notes, report_notes),
         outcome         = p_outcome,
         updated_at      = now()
   where id = p_inspection;

  -- A REPORTED NO-SHOW DOES NOT START THE CLOCK. Filing releases the fee after
  -- 24 hours, and an agent must not be able to collect by reporting that the
  -- other party failed to appear. `settle_inspection('student_no_show')` is
  -- staff's call and checks the free-reschedule allowance first.
  if p_outcome = 'viewed' then
    update public.escrow_holds
       set release_after = coalesce(release_after, v_due),
           updated_at    = now()
     where inspection_id = p_inspection and status = 'held';
  else
    perform private.notify_staff(
      'verification',
      'A student did not turn up',
      coalesce(nullif(trim(v_i.full_name), ''), 'A student') ||
        ' was reported as a no-show for a paid viewing. Settle it either way.',
      'verify-visits',
      p_inspection,
      'hostel_inspection'
    );
  end if;

  -- The student is told what was filed about them, either way. A no-show
  -- report that reaches them only when their money is gone is an ambush.
  perform private.notify(
    v_i.student_id,
    'verification',
    case when p_outcome = 'viewed' then 'Your viewing is filed' else 'You were marked as absent' end,
    case
      when p_outcome = 'viewed'
        then 'Confirm it happened and your agent is paid straight away. If it did not, say so   the fee is held until you do.'
      else 'Your agent reported that you did not turn up. If that is wrong, say so on your booking.'
    end,
    'bookings',
    null,
    p_inspection,
    'hostel_inspection'
  );

  insert into private.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    v_uid,
    case when v_i.ambassador_id is distinct from v_uid then 'staff' else 'agent' end,
    'inspection.report_filed', 'hostel_inspection', p_inspection::text,
    jsonb_build_object(
      'agent',   v_i.ambassador_id,
      'hostel',  v_i.hostel_id,
      'reason',  p_outcome,
      'refiled', (v_i.report_filed_at is not null),
      'notes',   (nullif(trim(coalesce(p_notes, '')), '') is not null)
    )
  );

  return v_due;
end;
$fn$;

revoke all on function public.file_inspection_report(uuid, text, text) from public, anon;
grant execute on function public.file_inspection_report(uuid, text, text)
  to authenticated, service_role;

-- The 5-arg evidence version from 20260909180000.
drop function if exists public.file_inspection_report(uuid, text, text[], text, text);

-- ── 5. "Nobody came" ────────────────────────────────────────────────────────
-- It does not settle. It stops the clock and fetches a human.
create or replace function public.dispute_inspection(
  p_inspection uuid,
  p_reason     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_i   public.hostel_inspections%rowtype;
begin
  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  -- The student's own, and nobody else's. An agent disputing their own visit
  -- is not a thing, and staff have settle_inspection.
  if v_i.student_id is distinct from v_uid then
    raise exception 'That viewing is not yours' using errcode = '42501';
  end if;

  if v_i.status <> 'scheduled' then
    raise exception 'That viewing is already settled' using errcode = 'P0001';
  end if;

  update public.hostel_inspections
     set disputed_at    = coalesce(disputed_at, now()),
         dispute_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), dispute_reason),
         updated_at     = now()
   where id = p_inspection;

  -- THE CLOCK STOPS HERE. A null release_after is never picked up by
  -- release_matured_escrow, so the fee waits for staff instead of paying an
  -- agent the student says never arrived. Nothing is taken from anyone.
  update public.escrow_holds
     set release_after = null, updated_at = now()
   where inspection_id = p_inspection and status = 'held';

  perform private.notify_staff(
    'verification',
    'A student says their agent did not come',
    coalesce(nullif(trim(v_i.full_name), ''), 'A student') ||
      ' disputed a paid viewing. The fee is held until somebody settles it.',
    'verify-visits',
    p_inspection,
    'hostel_inspection'
  );

  if v_i.ambassador_id is not null then
    perform private.notify(
      v_i.ambassador_id,
      'verification',
      'A viewing you took is disputed',
      'The student says it did not happen. Staff will look at it   your fee is on hold.',
      'requests',
      null,
      p_inspection,
      'hostel_inspection'
    );
  end if;

  insert into private.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    v_uid, 'student', 'inspection.disputed', 'hostel_inspection', p_inspection::text,
    jsonb_build_object('agent', v_i.ambassador_id, 'hostel', v_i.hostel_id,
                       'reason', p_reason)
  );

  return p_inspection;
end;
$fn$;

revoke all on function public.dispute_inspection(uuid, text) from public, anon;
grant execute on function public.dispute_inspection(uuid, text) to authenticated, service_role;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'hostel_inspections'
       and column_name = 'meeting_point'
  ) then
    raise exception 'hostel_inspections.meeting_point missing';
  end if;

  -- The wrong-model columns must be GONE, not merely unused.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'hostel_inspections'
       and column_name in ('report_photos', 'report_video_url', 'report_selfie_url')
  ) then
    raise exception 'the inspection evidence columns are still present';
  end if;

  if to_regprocedure('public.dispute_inspection(uuid, text)') is null then
    raise exception 'dispute_inspection missing';
  end if;
  if to_regprocedure('public.set_inspection_meeting_point(uuid, text)') is null then
    raise exception 'set_inspection_meeting_point missing';
  end if;

  -- Old arities gone: an un-updated caller resolving to one of them would drop
  -- the meeting point or the outcome and report success.
  if to_regprocedure('public.claim_inspection(uuid)') is not null then
    raise exception 'the 1-arg claim_inspection still exists';
  end if;
  if to_regprocedure('public.file_inspection_report(uuid, text, text[], text, text)') is not null then
    raise exception 'the evidence file_inspection_report still exists';
  end if;
end $$;
