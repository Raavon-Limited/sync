-- ============================================================================
-- visit_fraud_and_alerts
--
-- Two things a reviewer could not do, and one thing nobody was told.
--
-- 1. NOBODY WAS TOLD WHEN AN AGENT FILED.
--    `submit_verification_visit` moved a visit to Under Review and notified
--    nobody at all. The whole point of the status is that it is now somebody
--    else's turn, and the only way to discover it was to open /admin/verify-
--    visits and look. Evidence sat unreviewed for exactly as long as it took a
--    staff member to get curious.
--
-- 2. THERE WAS NO WAY TO SAY "THIS IS FRAUD".
--    A reviewer had Verify and Reject. Reject is an ordinary, recoverable
--    decision - the landlord fixes the listing and re-submits, which is
--    precisely what `submit_verification` allows. A photograph of a building
--    that does not exist is not that, and calling it Rejected leaves the person
--    free to try again with a different address on Monday.
--
--    THE BLOCK ALREADY EXISTED and nothing set it. 20260901260000 added
--    `vendor_profiles.verification_blocked_at` for exactly this - "a rejection
--    that is PERMANENT (fraud). While set, submit_verification refuses." It has
--    been an unreachable feature ever since. Marking a visit as fraud is what
--    reaches it.
--
-- WHY THE VISIT GETS ITS OWN STATUS RATHER THAN REUSING 'Rejected'
--    A reviewer looking at the queue next month has to be able to tell the two
--    apart, and a filter on "Rejected" that silently includes fraud is how a
--    blocked landlord gets quietly re-invited. It is a fifth status.
--
-- THE LANDLORD IS BLOCKED, THE HOSTEL IS NOT DELETED
--    Archiving the listing would take the evidence with it. The hostel stays,
--    unverified and invisible to students (20260908150000 already hides
--    unverified listings), and the block sits on the account so the next
--    submission is refused rather than reviewed.
--
-- ROLLBACK
--   drop function if exists public.flag_visit_fraud(uuid, text);
--   alter table public.verification_visits drop constraint if exists
--     hostel_verification_visits_status_check;
--   alter table public.verification_visits add constraint
--     hostel_verification_visits_status_check check (status in
--       ('Not Visited','Visit Scheduled','Under Review','Verified','Rejected'));
--   -- and restore submit_verification_visit from 20260909180000.
-- ============================================================================

-- ── 1. A fifth status ───────────────────────────────────────────────────────
-- The constraint carries its original name from 0006, before the table was
-- renamed; dropped by that name and recreated under the current one.
alter table public.verification_visits
  drop constraint if exists hostel_verification_visits_status_check;
alter table public.verification_visits
  drop constraint if exists verification_visits_status_check;

alter table public.verification_visits
  add constraint verification_visits_status_check check (
    status in ('Not Visited', 'Visit Scheduled', 'Under Review',
               'Verified', 'Rejected', 'Fraud')
  );

comment on column public.verification_visits.status is
  'Fraud is NOT a kind of Rejected. Rejected is recoverable and the landlord may re-submit; Fraud blocks the account permanently via vendor_profiles.verification_blocked_at.';

-- ── 2. Filing tells somebody ────────────────────────────────────────────────
-- Same body as 20260909180000 with the staff alert added.
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
  v_agent  text;
  v_place  text;
begin
  select * into v_row from public.verification_visits where id = p_visit for update;
  if not found then
    raise exception 'No such visit' using errcode = 'P0002';
  end if;
  if v_row.ambassador_id is distinct from v_uid then
    raise exception 'That visit is not yours' using errcode = '42501';
  end if;
  if v_row.status in ('Verified', 'Rejected', 'Fraud') then
    raise exception 'That visit has already been decided' using errcode = 'P0001';
  end if;
  if coalesce(array_length(coalesce(p_photos, v_row.photos), 1), 0) = 0 then
    raise exception 'Add at least one photo before submitting' using errcode = 'P0001';
  end if;

  v_selfie := coalesce(nullif(trim(coalesce(p_selfie, '')), ''), v_row.selfie_url);
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

  select coalesce(nullif(trim(full_name), ''), 'An agent') into v_agent
    from public.profiles where id = v_uid;

  if v_row.hostel_id is not null then
    select h.name into v_place from public.hostels h where h.id = v_row.hostel_id;
  else
    select vp.business_name into v_place
      from public.vendor_profiles vp where vp.id = v_row.vendor_id;
  end if;

  -- THE QUEUE IS NOT A PLACE PEOPLE SIT AND WATCH. Evidence that nobody is
  -- told about is evidence nobody looks at, and the agent is waiting on the
  -- decision to be paid and to be sent somewhere else.
  perform private.notify_staff(
    'verification',
    'A visit is ready to review',
    v_agent || ' has filed on ' || coalesce(v_place, 'a listing') || '. ' ||
      v_photos || ' photo' || case when v_photos = 1 then '' else 's' end ||
      case when v_selfie is not null then ', with a photo of them there' else '' end || '.',
    'verify-visits',
    p_visit,
    'verification_visit'
  );

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

-- ── 3. Marking one as fraud ─────────────────────────────────────────────────
-- The visit, the listing and the account move together or not at all. A visit
-- flagged as fraud beside a landlord who can still submit tomorrow is the bug
-- this function exists to make impossible.
create or replace function public.flag_visit_fraud(
  p_visit  uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid      uuid := (select auth.uid());
  v_v        public.verification_visits%rowtype;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_owner    uuid;
  v_place    text;
begin
  if not public.is_staff() then
    raise exception 'Only staff can mark a visit as fraud' using errcode = '42501';
  end if;

  -- A PERMANENT BLOCK NEEDS A STATED REASON. It is read back on the account
  -- screen and it is what somebody appealing is answered with.
  if v_reason is null then
    raise exception 'Say why this is fraud   the reason is shown on the blocked account'
      using errcode = '22023';
  end if;

  select * into v_v from public.verification_visits where id = p_visit for update;
  if not found then
    raise exception 'no such visit' using errcode = 'P0002';
  end if;

  if v_v.status in ('Verified', 'Rejected', 'Fraud') then
    raise exception 'That visit has already been decided' using errcode = 'P0001';
  end if;

  update public.verification_visits
     set status     = 'Fraud',
         decided_by = v_uid,
         decided_at = now(),
         notes      = coalesce(nullif(trim(coalesce(v_v.notes, '')), ''), v_reason),
         updated_at = now()
   where id = p_visit;

  -- The listing stays, unverified. 20260908150000 already hides an unverified
  -- hostel from students; deleting it would take the evidence with it.
  if v_v.hostel_id is not null then
    update public.hostels set verified = false, updated_at = now()
     where id = v_v.hostel_id;
    select h.landlord_id, h.name into v_owner, v_place
      from public.hostels h where h.id = v_v.hostel_id;
  else
    v_owner := v_v.vendor_id;
    select vp.business_name into v_place
      from public.vendor_profiles vp where vp.id = v_v.vendor_id;
  end if;

  -- THE BLOCK THAT ALREADY EXISTED. submit_verification refuses while this is
  -- set, which is the whole difference between this and a rejection.
  if v_owner is not null then
    update public.vendor_profiles
       set verification_status         = 'rejected',
           verification_blocked_at     = coalesce(verification_blocked_at, now()),
           verification_blocked_reason = coalesce(verification_blocked_reason, v_reason),
           updated_at                  = now()
     where id = v_owner;

    perform private.notify(
      v_owner,
      'verification',
      'Your listing was rejected',
      'We could not verify ' || coalesce(v_place, 'your listing') ||
        '. Contact support if you believe this is wrong.',
      'settings',
      null,
      p_visit,
      'verification_visit'
    );
  end if;

  perform private.notify_staff(
    'verification',
    'A visit was marked as fraud',
    coalesce(v_place, 'A listing') || ' was flagged and the account is blocked from re-submitting.',
    'verify-visits',
    p_visit,
    'verification_visit'
  );

  insert into private.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    v_uid, 'staff', 'visit.fraud', 'verification_visit', p_visit::text,
    jsonb_build_object('hostel', v_v.hostel_id, 'vendor', v_v.vendor_id,
                       'agent', v_v.ambassador_id, 'owner', v_owner,
                       'reason', v_reason)
  );

  return p_visit;
end;
$fn$;

revoke all on function public.flag_visit_fraud(uuid, text) from public, anon;
grant execute on function public.flag_visit_fraud(uuid, text) to authenticated, service_role;

comment on function public.flag_visit_fraud is
  'Marks a visit as fraud and permanently blocks the account behind it. Not a kind of rejection: submit_verification refuses while verification_blocked_at is set.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_src text;
begin
  if to_regprocedure('public.flag_visit_fraud(uuid, text)') is null then
    raise exception 'flag_visit_fraud missing';
  end if;

  -- The status must actually accept the new value, or the function above fails
  -- at the first use rather than here.
  begin
    perform 1 from public.verification_visits where status = 'Fraud';
  exception when others then
    raise exception 'verification_visits.status does not accept Fraud';
  end;

  select prosrc into v_src from pg_proc where proname = 'submit_verification_visit' limit 1;
  if position('notify_staff' in v_src) = 0 then
    raise exception 'submit_verification_visit does not alert staff - old version installed';
  end if;
end $$;
