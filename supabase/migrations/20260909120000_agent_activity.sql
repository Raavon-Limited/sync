-- ============================================================================
-- agent_activity
--
-- "What are they up to?" - answerable per agent, from rows.
--
-- WHAT WAS ALREADY BEING RECORDED, AND WHAT WAS NOT
--   `accept_agent_invite`, `assign_verification_visit` and
--   `reassign_verification_visit` all write to private.audit_log already. So the
--   log knew when an agent joined and every time staff pointed one at a place -
--   and nothing at all about what the agent then DID. The two functions that
--   are the agent's actual work, `submit_verification_visit` and
--   `file_inspection_report`, wrote no audit row, which meant an admin could see
--   an agent had been sent somewhere and never see whether they went.
--
--   That is the wrong half to be missing. Assignment is staff's own action and
--   staff remember it; the visit is the part nobody watched.
--
-- WHY THE AGENT GOES IN THE PAYLOAD
--   audit_log is deliberately generic - actor/action/entity, no per-feature
--   columns - so agent attribution rides in the jsonb and is indexed by
--   expression, exactly as `storefront_id` does for storefront_activity
--   (20260822140000). Adding an agent_id column would make a shared audit table
--   care about one role.
--
-- THE FEED IS BOTH VOICES, DELIBERATELY
--   `agent_activity` returns rows where the agent was the ACTOR (they submitted,
--   they filed, they accepted their invite) and rows where they were the
--   SUBJECT (staff assigned them, staff moved a visit off them). An oversight
--   screen that showed only the first cannot explain a quiet week - an agent
--   with nothing assigned looks identical to one ignoring their work.
--
-- STAFF ONLY, AND SAID TWICE
--   SECURITY DEFINER turns RLS off, so the staff check is restated inside the
--   function body. An agent cannot read their own feed through this: it is
--   oversight OF them, and the same reasoning storefront_activity applies to
--   branch staff applies here.
--
-- ROLLBACK
--   drop function if exists public.agent_activity(uuid, integer);
--   drop index if exists private.audit_log_agent_idx;
--   -- and restore submit_verification_visit from 20260905120000,
--   -- file_inspection_report from 20260906180000, and
--   -- assign_inspection_agent from 20260906210000.
-- ============================================================================

-- ── 1. The index the feed probes ────────────────────────────────────────────
create index if not exists audit_log_agent_idx
  on private.audit_log ((coalesce(after ->> 'agent', before ->> 'agent')), occurred_at desc);

-- ── 2. The agent submitted their evidence ───────────────────────────────────
-- Unchanged from 20260905120000 apart from the audit row at the end. Every
-- guard, the lock, the photo requirement and the status transition are the
-- same statements in the same order.
create or replace function public.submit_verification_visit(
  p_visit  uuid,
  p_photos text[] default null,
  p_video  text default null,
  p_notes  text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_row public.verification_visits%rowtype;
  v_photos integer;
begin
  select * into v_row from public.verification_visits where id = p_visit for update;
  if not found then
    raise exception 'No such visit' using errcode = 'P0002';
  end if;
  if v_row.ambassador_id is distinct from v_uid then
    raise exception 'That visit is not yours' using errcode = '42501';
  end if;
  if v_row.status in ('Verified', 'Rejected') then
    raise exception 'That visit has already been decided' using errcode = 'P0001';
  end if;
  if coalesce(array_length(coalesce(p_photos, v_row.photos), 1), 0) = 0 then
    raise exception 'Add at least one photo before submitting' using errcode = 'P0001';
  end if;

  v_photos := coalesce(array_length(coalesce(p_photos, v_row.photos), 1), 0);

  update public.verification_visits
     set photos       = coalesce(p_photos, photos),
         video_url    = coalesce(p_video, video_url),
         notes        = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
         status       = 'Under Review',
         submitted_at = now(),
         updated_at   = now()
   where id = p_visit;

  -- A RESUBMISSION IS ITS OWN ROW, not an overwrite. An agent who submits, is
  -- sent back, and submits again has done two things, and the second one is
  -- only meaningful next to the first.
  insert into private.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    v_uid, 'agent', 'visit.submitted', 'verification_visit', p_visit::text,
    jsonb_build_object(
      'agent',  v_uid,
      'hostel', v_row.hostel_id,
      'vendor', v_row.vendor_id,
      'photos', v_photos,
      'video',  (coalesce(p_video, v_row.video_url) is not null),
      'resubmitted', (v_row.submitted_at is not null)
    )
  );

  return 'Under Review';
end;
$fn$;

revoke all on function public.submit_verification_visit(uuid, text[], text, text)
  from public, anon;
grant execute on function public.submit_verification_visit(uuid, text[], text, text)
  to authenticated, service_role;

-- ── 3. The agent filed their inspection report ──────────────────────────────
-- Unchanged from 20260906180000 apart from the audit row. The idempotent
-- `coalesce(report_filed_at, now())` and the release-window rule are untouched.
create or replace function public.file_inspection_report(
  p_inspection uuid,
  p_notes      text default null
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
  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  -- The agent on the visit, or staff cleaning up after one.
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
         updated_at      = now()
   where id = p_inspection;

  -- Filing twice must not push the release out again   an agent editing their
  -- notes should not delay their own money, nor extend the student's window.
  update public.escrow_holds
     set release_after = coalesce(release_after, v_due),
         updated_at    = now()
   where inspection_id = p_inspection and status = 'held';

  insert into private.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    v_uid,
    -- Staff filing on an agent's behalf is a different event from the agent
    -- filing, and the feed has to be able to tell them apart.
    case when v_i.ambassador_id is distinct from v_uid then 'staff' else 'agent' end,
    'inspection.report_filed', 'hostel_inspection', p_inspection::text,
    jsonb_build_object(
      -- The AGENT on the row, not the caller: a report staff filed still belongs
      -- to that agent's record.
      'agent',  v_i.ambassador_id,
      'hostel', v_i.hostel_id,
      'refiled', (v_i.report_filed_at is not null),
      'notes',  (nullif(trim(coalesce(p_notes, '')), '') is not null)
    )
  );

  return v_due;
end;
$fn$;

revoke all on function public.file_inspection_report(uuid, text) from public, anon;
grant execute on function public.file_inspection_report(uuid, text) to authenticated, service_role;

-- ── 4. Staff pointed an agent at a student's viewing ────────────────────────
-- Unchanged from 20260906210000 apart from the audit row. Every guard, the two
-- row locks and the escrow payee move are the same statements in the same
-- order. Assignment is staff's action, so `actor_role` is staff and the AGENT
-- goes in the payload   which is what puts it on the agent's own feed.
create or replace function public.assign_inspection_agent(
  p_inspection uuid,
  -- null unassigns: back to the queue, money untouched.
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

  -- Same check assign_verification_visit makes. An account that is not an agent
  -- cannot be sent to a student's door, and cannot be made the payee of an
  -- agent's fee.
  if p_agent is not null and not exists (
    select 1 from public.profiles
     where id = p_agent
       and ('agent' = any (coalesce(roles, array[]::text[])) or role = 'agent')
  ) then
    raise exception 'That account is not an agent' using errcode = '22023';
  end if;

  -- An agent must not inspect on behalf of a student who is themselves   the
  -- fee would be paid from and to the same person, and the report would be
  -- self-attested.
  if p_agent is not null and p_agent = v_i.student_id then
    raise exception 'An agent cannot inspect for themselves' using errcode = '22023';
  end if;

  select * into v_hold from public.escrow_holds
   where inspection_id = p_inspection for update;

  -- Settled money is not reassignable. Before the hold exists (an inspection
  -- still awaiting payment) there is nothing to guard   assignment is free.
  if found and v_hold.status <> 'held' then
    raise exception 'That inspection has already been settled' using errcode = 'P0001';
  end if;

  update public.hostel_inspections
     set ambassador_id = p_agent, updated_at = now()
   where id = p_inspection;

  -- The same transaction, so the row that says who is going and the row that
  -- says who gets paid can never disagree.
  if found then
    update public.escrow_holds
       set payee_id = p_agent, updated_at = now()
     where id = v_hold.id;
  end if;

  -- TWO ROWS ON A REASSIGNMENT, one per agent, so it appears on both feeds:
  -- the agent who lost it needs the record as much as the one who gained it.
  if v_i.ambassador_id is not null and v_i.ambassador_id is distinct from p_agent then
    insert into private.audit_log
      (actor_id, actor_role, action, entity_type, entity_id, before)
    values (
      v_uid, 'staff', 'inspection.unassigned', 'hostel_inspection', p_inspection::text,
      jsonb_build_object('agent', v_i.ambassador_id, 'hostel', v_i.hostel_id)
    );
  end if;

  if p_agent is not null and p_agent is distinct from v_i.ambassador_id then
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

-- ── 5. The feed ─────────────────────────────────────────────────────────────
create or replace function public.agent_activity(
  p_agent uuid,
  p_limit integer default 100
)
returns table (
  occurred_at timestamptz,
  actor_id    uuid,
  actor_name  text,
  actor_role  text,
  action      text,
  entity_type text,
  entity_id   text,
  /** True when the agent did it; false when it was done to them. */
  by_agent    boolean,
  summary     jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.is_staff() then
    raise exception 'Only staff can read an agent activity log' using errcode = '42501';
  end if;

  return query
  select
    al.occurred_at,
    al.actor_id,
    p.full_name,
    al.actor_role,
    al.action,
    al.entity_type,
    al.entity_id,
    (al.actor_id = p_agent),
    -- Not the raw row images. The feed is what a screen renders, and audit_log
    -- before/after carry whole rows across the app.
    jsonb_strip_nulls(jsonb_build_object(
      'hostel',      coalesce(al.after ->> 'hostel', al.before ->> 'hostel'),
      'vendor',      coalesce(al.after ->> 'vendor', al.before ->> 'vendor'),
      'photos',      al.after ->> 'photos',
      'video',       al.after ->> 'video',
      'notes',       al.after ->> 'notes',
      'resubmitted', al.after ->> 'resubmitted',
      'refiled',     al.after ->> 'refiled',
      'reason',      coalesce(al.after ->> 'reason', al.before ->> 'reason'),
      -- So a reassignment can say which direction it went for THIS agent.
      'moved_from',  al.after ->> 'from',
      'moved_to',    al.after ->> 'to'
    ))
  from private.audit_log al
  left join public.profiles p on p.id = al.actor_id
  where p_agent is not null
    and (
      -- They did it.
      al.actor_id = p_agent
      -- Or it was done to them.
      or coalesce(al.after ->> 'agent', al.before ->> 'agent') = p_agent::text
      -- OLDER ROWS SPELL IT DIFFERENTLY, and they still count.
      -- `reassign_verification_visit` (20260907090000) predates the 'agent'
      -- convention: it writes {'was': id} on an unassign and {'from': id, 'to':
      -- id} on a move. audit_log is append-only, so those rows cannot be
      -- rewritten into the newer shape - the reader has to know both. Without
      -- this, an agent who had every visit taken off them showed a completely
      -- empty log, which is the exact case somebody would open this screen to
      -- investigate.
      or al.after ->> 'was'  = p_agent::text
      or al.after ->> 'from' = p_agent::text
      or al.after ->> 'to'   = p_agent::text
    )
  order by al.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$fn$;

revoke all on function public.agent_activity(uuid, integer) from public, anon;
grant execute on function public.agent_activity(uuid, integer) to authenticated, service_role;

comment on function public.agent_activity is
  'One agent''s record: what they did, and what staff did to their queue. Staff only - this is oversight of the agent, not a feed for them.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_src text;
begin
  if to_regprocedure('public.agent_activity(uuid, integer)') is null then
    raise exception 'agent_activity missing';
  end if;

  select prosrc into v_src from pg_proc where proname = 'submit_verification_visit' limit 1;
  if position('audit_log' in v_src) = 0 then
    raise exception 'submit_verification_visit does not audit - the old version is installed';
  end if;

  select prosrc into v_src from pg_proc where proname = 'file_inspection_report' limit 1;
  if position('audit_log' in v_src) = 0 then
    raise exception 'file_inspection_report does not audit - the old version is installed';
  end if;
end $$;
