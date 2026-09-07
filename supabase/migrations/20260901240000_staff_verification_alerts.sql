-- ============================================================================
-- staff_verification_alerts   tell the reviewers a review is waiting.
--
-- THE GAP
--   A vendor or landlord finishes onboarding, `submit_verification()` moves
--   them to 'pending', and that is the end of it. The submission writes a row
--   in `private.audit_log`   which nobody reads without a SQL client   and
--   nothing else. Whether anyone ever looks depends on an admin happening to
--   open /admin/vendors and happening to notice a badge that changed colour.
--
--   Meanwhile `public.notifications` already exists, already has a
--   'verification' kind, is already in the realtime publication, and already
--   has a bell rendering it in the admin header. It has simply never had a
--   producer for this event. That is what this adds.
--
-- FAN-OUT, BECAUSE NOTIFICATIONS ARE PER-PERSON
--   `notifications.user_id` is a single account   the table has no concept of
--   "the staff group". So a submission writes ONE ROW PER STAFF MEMBER. That
--   is the honest shape: each admin marks their own copy read, and one of them
--   clearing their inbox does not hide the queue from the rest.
--
--   Staff are found by role, `role` OR `roles`   since multi-role accounts
--   (20260830090000) an admin who also runs a shop wears one hat at a time,
--   and being mid-switch is not a reason to stop being told.
--
-- ON THE TRANSITION, NOT ON THE ROW
--   Fires only when `verification_status` BECOMES 'pending'. A vendor editing
--   their address updates the row and is not asking for anything; re-submitting
--   while already pending is a no-op inside submit_verification() and so never
--   reaches here twice. One request, one alert.
--
--   AFTER, not BEFORE: guard_vendor_profile_cols reverts this very column when
--   the write did not come through a sanctioned call, so a BEFORE trigger would
--   announce submissions that never happened.
--
-- THE LINK GOES WHERE THE WORK IS
--   `notifications.href` is a suffix under the dashboard base, which for staff
--   is /admin. A landlord's documents are reviewed on their own page, a
--   vendor's in the queue, so the href is chosen per category rather than
--   dumping everyone at one list to be searched for by name.
--
-- FAILURE TO ALERT MUST NEVER FAIL THE SUBMISSION
--   Same rule 20260823100000 set for every other producer: a missing alert is
--   an annoyance, a rolled-back submission strands somebody mid-onboarding.
--   The whole body is wrapped and an exception becomes a warning.
--
-- ROLLBACK
--   drop trigger if exists vendor_profiles_notify_staff on public.vendor_profiles;
--   drop function if exists private.notify_verification_submitted();
--   drop function if exists private.notify_staff(text, text, text, text, uuid, text);
-- ============================================================================

-- ── 1. Tell everyone whose job this is ──────────────────────────────────────
-- Deliberately generic: "something needs staff attention" is not unique to
-- verification, and the next producer (a dispute, a withdrawal) should not have
-- to rediscover who the staff are.
create or replace function private.notify_staff(
  p_kind        text,
  p_title       text,
  p_body        text,
  p_href        text default null,
  p_entity_id   uuid default null,
  p_entity_type text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_staff record;
  v_sent  integer := 0;
begin
  for v_staff in
    select id
      from public.profiles
     where (role = any (array['admin', 'super_admin'])
            or roles && array['admin', 'super_admin'])
       and archived_at is null
  loop
    -- private.notify already skips the actor notifying themselves and swallows
    -- its own failures, so one unreachable recipient cannot stop the fan-out.
    -- p_action is cast because a bare NULL carries no type and private.notify
    -- is reached positionally.
    perform private.notify(
      v_staff.id, p_kind, p_title, p_body, p_href, null::text, p_entity_id, p_entity_type
    );
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$fn$;

comment on function private.notify_staff(text, text, text, text, uuid, text) is
  'Fan a notification out to every admin/super_admin. One row per person, because notifications.user_id is a single account and there is no staff group.';

-- ── 2. A business asks to be reviewed ───────────────────────────────────────
create or replace function private.notify_verification_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_name text;
  v_what text;
  v_href text;
begin
  -- Only the moment it becomes a request. TG_OP is checked rather than assumed
  -- because the trigger covers INSERT too   a row created straight into
  -- 'pending' is still somebody waiting.
  if new.verification_status is distinct from 'pending' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.verification_status is not distinct from 'pending' then
    return new;
  end if;

  v_name := coalesce(nullif(trim(new.business_name), ''), 'A business');

  if new.category = 'landlord' then
    v_what := 'landlord';
    -- Straight to the page that holds their hostels and their documents.
    v_href := 'landlord/' || new.slug;
  else
    v_what := coalesce(new.category, 'business');
    v_href := 'vendors';
  end if;

  perform private.notify_staff(
    'verification',
    'Verification request',
    v_name || ' (' || v_what || ') submitted documents for review.',
    v_href,
    new.id,
    'vendor_profile'
  );

  return new;
exception
  when others then
    raise warning 'verification alert failed for % : %', new.id, sqlerrm;
    return new;
end;
$fn$;

drop trigger if exists vendor_profiles_notify_staff on public.vendor_profiles;
create trigger vendor_profiles_notify_staff
  after insert or update of verification_status on public.vendor_profiles
  for each row execute function private.notify_verification_submitted();

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_staff integer;
begin
  if to_regprocedure('private.notify_staff(text, text, text, text, uuid, text)') is null then
    raise exception 'notify_staff missing';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'vendor_profiles_notify_staff' and not tgisinternal
  ) then
    raise exception 'the verification alert trigger is not attached';
  end if;

  -- An alert nobody receives is not an alert. This is a NOTICE rather than a
  -- failure because a fresh database legitimately has no staff seeded yet.
  select count(*) into v_staff
    from public.profiles
   where (role = any (array['admin', 'super_admin'])
          or roles && array['admin', 'super_admin'])
     and archived_at is null;

  if v_staff = 0 then
    raise notice 'no admin/super_admin profiles   verification alerts will reach nobody until one is seeded';
  else
    raise notice 'verification alerts will reach % staff account(s)', v_staff;
  end if;
end $$;
