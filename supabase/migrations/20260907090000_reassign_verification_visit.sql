-- ============================================================================
-- reassign_verification_visit
--
-- `assign_verification_visit` INSERTS. That is the whole vocabulary the
-- verification queue has: you can create a visit with an agent on it, and after
-- that the agent is frozen. An agent who falls ill, leaves, or was sent to the
-- wrong side of town cannot be swapped, and a visit assigned by mistake cannot
-- be taken back   the only recovery is a second row for the same hostel, which
-- then shows up as two visits and tells the landlord twice.
--
-- WHY REASSIGNMENT STOPS AT 'Under Review'
--   Once an agent has SUBMITTED, the photos, the video and the notes on that
--   row are theirs   `submit_verification_visit` wrote them. Moving the agent
--   afterwards would attribute one person's evidence to another, which is
--   exactly the attribution the separation-of-duties in this table exists to
--   protect. If the evidence is bad, the visit is rejected and a new one
--   assigned; it is not quietly relabelled.
--
--   Decided visits (Verified / Rejected) are closed for the same reason, more
--   obviously.
--
-- UNASSIGNING CLEARS THE TIME AS WELL AS THE PERSON
--   The landlord was told "<name> is coming, expected Tuesday 2pm". If nobody
--   is coming, Tuesday 2pm is not true either, and a row reading
--   'Visit Scheduled' with a null agent is precisely the state the hard-coded
--   `ambassadorId: null` on the queue screen has been producing   a scheduled
--   visit nobody is going on.
--
-- EVERYBODY WHO WAS TOLD GETS TOLD AGAIN
--   The original assignment notifies the owner, the agent, and the student if
--   there is one. A change to it has to reach the same three, plus the agent
--   being STOOD DOWN   otherwise they turn up at a stranger's gate believing
--   they are expected, which is the single situation these notifications exist
--   to prevent.
--
-- ROLLBACK
--   drop function if exists public.reassign_verification_visit(uuid, uuid);
-- ============================================================================

create or replace function public.reassign_verification_visit(
  p_visit uuid,
  -- null stands the current agent down and returns the visit to the queue.
  p_agent uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := (select auth.uid());
  v_row   public.verification_visits%rowtype;
  v_place text;
  v_owner uuid;
  v_new   text;
  v_old   text;
  v_when  text;
begin
  if not public.is_staff() then
    raise exception 'Only staff can reassign a visit' using errcode = '42501';
  end if;

  select * into v_row from public.verification_visits where id = p_visit for update;
  if not found then
    raise exception 'No such visit' using errcode = 'P0002';
  end if;

  if v_row.status not in ('Not Visited', 'Visit Scheduled') then
    raise exception 'That visit has already been submitted or decided   reject it and assign a new one'
      using errcode = 'P0001';
  end if;

  if p_agent is not null and not exists (
    select 1 from public.profiles
     where id = p_agent
       and ('agent' = any (coalesce(roles, array[]::text[])) or role = 'agent')
  ) then
    raise exception 'That account is not an agent' using errcode = '22023';
  end if;

  -- Nothing to do, and doing it anyway would send three notifications saying
  -- the same person is still coming.
  if v_row.ambassador_id is not distinct from p_agent then
    return p_visit;
  end if;

  select coalesce(nullif(trim(full_name), ''), 'A Sync agent') into v_old
    from public.profiles where id = v_row.ambassador_id;

  if v_row.hostel_id is not null then
    select h.name, h.landlord_id into v_place, v_owner
      from public.hostels h where h.id = v_row.hostel_id;
  else
    select vp.business_name, vp.id into v_place, v_owner
      from public.vendor_profiles vp where vp.id = v_row.vendor_id;
  end if;

  -- ── Standing the old agent down ───────────────────────────────────────────
  if v_row.ambassador_id is not null then
    perform private.notify(
      v_row.ambassador_id,
      'verification',
      'Visit reassigned: ' || coalesce(v_place, 'a listing'),
      'You are no longer going to this one. It has been given to somebody else.',
      'visits',
      null,
      p_visit,
      'verification_visit'
    );
  end if;

  if p_agent is null then
    -- Back to the queue, and honestly: no agent, no time.
    update public.verification_visits
       set ambassador_id = null,
           scheduled_for = null,
           status        = 'Not Visited',
           updated_at    = now()
     where id = p_visit;

    if v_owner is not null then
      perform private.notify(
        v_owner,
        'verification',
        'The visit to ' || coalesce(v_place, 'your listing') || ' is being rearranged',
        'The agent who was coming is no longer available. We will confirm a new time.',
        'settings',
        null,
        p_visit,
        'verification_visit'
      );
    end if;

    insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
    values (v_uid, 'staff', 'visit.unassigned', 'verification_visit', p_visit::text,
            jsonb_build_object('was', v_row.ambassador_id));

    return p_visit;
  end if;

  -- ── Handing it to somebody else ───────────────────────────────────────────
  select coalesce(nullif(trim(full_name), ''), 'A Sync agent') into v_new
    from public.profiles where id = p_agent;

  update public.verification_visits
     set ambassador_id = p_agent,
         status        = case when v_row.scheduled_for is null
                              then 'Not Visited' else 'Visit Scheduled' end,
         updated_at    = now()
   where id = p_visit;

  v_when := case
              when v_row.scheduled_for is null then 'They will contact you to agree a time.'
              else 'Expected ' || to_char(v_row.scheduled_for at time zone 'Africa/Lagos',
                                          'FMDay FMDD FMMonth, HH12:MIam') || '.'
            end;

  perform private.notify(
    p_agent,
    'verification',
    'New visit: ' || coalesce(v_place, 'a listing'),
    'You have been assigned a verification visit. ' || v_when,
    'visits',
    null,
    p_visit,
    'verification_visit'
  );

  -- The owner is told the NAME changed, not merely that something did. They
  -- are going to open a gate for whoever this is.
  if v_owner is not null then
    perform private.notify(
      v_owner,
      'verification',
      'A different agent is visiting ' || coalesce(v_place, 'your listing'),
      v_new || ' is coming instead of ' || coalesce(v_old, 'the agent previously assigned')
        || '. ' || v_when,
      'settings',
      null,
      p_visit,
      'verification_visit'
    );
  end if;

  -- The student meeting them at the same address, when there is one.
  if v_row.meet_user_id is not null then
    perform private.notify(
      v_row.meet_user_id,
      'verification',
      'A different agent will be at your viewing',
      v_new || ' will be at ' || coalesce(v_place, 'the viewing') || ' with you. ' || v_when,
      'bookings',
      null,
      p_visit,
      'verification_visit'
    );
  end if;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
  values (v_uid, 'staff', 'visit.reassigned', 'verification_visit', p_visit::text,
          jsonb_build_object('from', v_row.ambassador_id, 'to', p_agent));

  return p_visit;
end;
$fn$;

revoke all on function public.reassign_verification_visit(uuid, uuid) from public, anon;
grant execute on function public.reassign_verification_visit(uuid, uuid) to authenticated, service_role;

comment on function public.reassign_verification_visit is
  'Moves an open verification visit to a different agent, or with a null agent stands the current one down and returns it to the queue. Staff only. Refused once the visit has been submitted or decided, because the evidence on it belongs to the agent who filed it.';
