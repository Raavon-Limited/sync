-- ============================================================================
-- agent_evidence
--
-- What an agent files, and where the notification about it points.
--
-- 1. A PICTURE OF THE AGENT AT THE PROPERTY
--    Photographs of a building prove a building exists. They do not prove the
--    person who sent them was ever there - a listing's own photos, forwarded,
--    look exactly like a visit. `selfie_url` is the one piece of evidence that
--    is about the AGENT rather than the place, which is why it gets its own
--    column instead of being the fourth item in `photos`: a reviewer has to be
--    able to ask "is there one?" without opening every image.
--
-- 2. AN INSPECTION REPORT WAS NOTES AND NOTHING ELSE
--    `file_inspection_report` took `p_notes` and released the agent's fee. A
--    student who paid ₦5,000 for somebody to go and look got a paragraph, and
--    Sync had no way to tell a real viewing from a sentence typed on a sofa.
--    Inspections now carry the same evidence a verification visit does.
--
-- 3. THE NOTIFICATION POINTED AT A ROUTE THAT DID NOT EXIST
--    Every agent notification set href 'visits', which the bell resolves as
--    `${basePath}/${href}` - so `/agent/visits`, and the agent dashboard lived
--    at `/agent`. Every one of them 404'd. The app now has `/agent/visits` and
--    `/agent/requests` as real pages, so 'visits' resolves; the inspection
--    notifications move to 'requests', which is where that work now lives.
--
--    Rows already written keep href 'visits'. That is fine and is why the route
--    was created rather than the value rewritten: an old notification lands on
--    a real page instead of a 404.
--
-- ROLLBACK
--   alter table public.verification_visits drop column if exists selfie_url;
--   alter table public.hostel_inspections
--     drop column if exists report_photos,
--     drop column if exists report_video_url,
--     drop column if exists report_selfie_url;
--   -- and restore submit_verification_visit / file_inspection_report from
--   -- 20260909120000.
-- ============================================================================

-- ── 1. Columns ──────────────────────────────────────────────────────────────
alter table public.verification_visits
  add column if not exists selfie_url text;

comment on column public.verification_visits.selfie_url is
  'The agent, at the property. Proves the sender went; `photos` only proves the building exists.';

alter table public.hostel_inspections
  add column if not exists report_photos    text[] not null default '{}',
  add column if not exists report_video_url text,
  add column if not exists report_selfie_url text;

comment on column public.hostel_inspections.report_photos is
  'What the agent photographed at the viewing. Filing used to be notes alone, which nothing could check.';

-- ── 2. Filing a verification visit ──────────────────────────────────────────
-- Same body as 20260909120000 plus the selfie. The photo requirement, the
-- ownership check, the already-decided guard and the audit row are unchanged.
create or replace function public.submit_verification_visit(
  p_visit  uuid,
  p_photos text[] default null,
  p_video  text default null,
  p_notes  text default null,
  p_selfie text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_row    public.verification_visits%rowtype;
  v_photos integer;
  v_selfie text;
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

  v_selfie := coalesce(nullif(trim(coalesce(p_selfie, '')), ''), v_row.selfie_url);

  -- NOT ENFORCED YET, deliberately. Visits assigned before this migration have
  -- no selfie and their agents must still be able to file. The column is
  -- recorded and surfaced to reviewers now; making it required is a decision
  -- about people already halfway through a job, so it is a separate one.
  v_photos := coalesce(array_length(coalesce(p_photos, v_row.photos), 1), 0);

  update public.verification_visits
     set photos       = coalesce(p_photos, photos),
         video_url    = coalesce(p_video, video_url),
         selfie_url   = v_selfie,
         notes        = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
         status       = 'Under Review',
         submitted_at = now(),
         updated_at   = now()
   where id = p_visit;

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
      'selfie', (v_selfie is not null),
      'resubmitted', (v_row.submitted_at is not null)
    )
  );

  return 'Under Review';
end;
$fn$;

revoke all on function public.submit_verification_visit(uuid, text[], text, text, text)
  from public, anon;
grant execute on function public.submit_verification_visit(uuid, text[], text, text, text)
  to authenticated, service_role;

-- The 4-argument version from 20260905120000 would otherwise still resolve for
-- any caller that has not been updated, silently dropping the selfie.
drop function if exists public.submit_verification_visit(uuid, text[], text, text);

-- ── 3. Filing an inspection report ──────────────────────────────────────────
-- Same body as 20260909120000 plus the evidence. The idempotent
-- `coalesce(report_filed_at, now())` and the release-window rule are untouched:
-- an agent editing their notes must not delay their own money.
create or replace function public.file_inspection_report(
  p_inspection uuid,
  p_notes      text default null,
  p_photos     text[] default null,
  p_video      text default null,
  p_selfie     text default null
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

  if v_i.ambassador_id is distinct from v_uid and not public.is_staff() then
    raise exception 'That inspection is not yours' using errcode = '42501';
  end if;

  if v_i.status <> 'scheduled' then
    raise exception 'That inspection is not scheduled' using errcode = 'P0001';
  end if;

  v_due := now() + make_interval(hours => v_hours);

  update public.hostel_inspections
     set report_filed_at   = coalesce(report_filed_at, now()),
         report_notes      = coalesce(p_notes, report_notes),
         report_photos     = coalesce(p_photos, report_photos),
         report_video_url  = coalesce(nullif(trim(coalesce(p_video, '')), ''), report_video_url),
         report_selfie_url = coalesce(nullif(trim(coalesce(p_selfie, '')), ''), report_selfie_url),
         updated_at        = now()
   where id = p_inspection;

  update public.escrow_holds
     set release_after = coalesce(release_after, v_due),
         updated_at    = now()
   where inspection_id = p_inspection and status = 'held';

  insert into private.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    v_uid,
    case when v_i.ambassador_id is distinct from v_uid then 'staff' else 'agent' end,
    'inspection.report_filed', 'hostel_inspection', p_inspection::text,
    jsonb_build_object(
      'agent',  v_i.ambassador_id,
      'hostel', v_i.hostel_id,
      'photos', coalesce(array_length(coalesce(p_photos, v_i.report_photos), 1), 0),
      'selfie', (coalesce(nullif(trim(coalesce(p_selfie, '')), ''), v_i.report_selfie_url) is not null),
      'refiled', (v_i.report_filed_at is not null),
      'notes',  (nullif(trim(coalesce(p_notes, '')), '') is not null)
    )
  );

  return v_due;
end;
$fn$;

revoke all on function public.file_inspection_report(uuid, text, text[], text, text)
  from public, anon;
grant execute on function public.file_inspection_report(uuid, text, text[], text, text)
  to authenticated, service_role;

drop function if exists public.file_inspection_report(uuid, text);

-- ── 4. Point the inspection notifications at the right page ─────────────────
-- Only the href changes. Everything else is 20260909150000 verbatim.
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

  select * into v_hold from public.escrow_holds
   where inspection_id = p_inspection for update;
  if found and v_hold.status = 'held' then
    update public.escrow_holds
       set payee_id = v_uid, updated_at = now()
     where id = v_hold.id;
  end if;

  select h.name into v_place from public.hostels h where h.id = v_i.hostel_id;

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

  if not public.is_staff() and v_was is distinct from v_uid then
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
     set ambassador_id = null, updated_at = now()
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
    -- 'requests', not 'visits': this work lives on /agent/requests now.
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
declare
  v_src text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'verification_visits'
       and column_name = 'selfie_url'
  ) then
    raise exception 'verification_visits.selfie_url missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'hostel_inspections'
       and column_name = 'report_photos'
  ) then
    raise exception 'hostel_inspections.report_photos missing';
  end if;

  -- The old arities must be GONE, not merely shadowed: an un-updated caller
  -- resolving to one of them would drop the evidence and report success.
  if to_regprocedure('public.submit_verification_visit(uuid, text[], text, text)') is not null then
    raise exception 'the 4-arg submit_verification_visit still exists';
  end if;
  if to_regprocedure('public.file_inspection_report(uuid, text)') is not null then
    raise exception 'the 2-arg file_inspection_report still exists';
  end if;

  select prosrc into v_src from pg_proc where proname = 'file_inspection_report' limit 1;
  if position('report_photos' in v_src) = 0 then
    raise exception 'file_inspection_report does not record evidence - old version installed';
  end if;
end $$;
