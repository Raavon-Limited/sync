-- ============================================================================
-- agents
--
-- The people who go and look.
--
-- WHAT WAS ALREADY HERE
--   `hostel_verification_visits` has existed since 0006: an ambassador is put
--   against a hostel, turns up, uploads photos and a video, and staff decide
--   whether the listing is real. The lifecycle is right and the admin queue for
--   it works.
--
--   Three things were missing, and they are the reason it has never been used
--   in anger: there was no such ROLE (an ambassador was a student with a column
--   pointing at them), no way to become one, and no way to send somebody to
--   look at a VENDOR - only at a hostel. A shop that takes money for food needs
--   its address confirmed at least as much as a room does.
--
-- SO THE TABLE IS GENERALISED RATHER THAN DUPLICATED
--   Renamed to `verification_visits` and taught about vendors. One queue, one
--   lifecycle, one set of policies. A second parallel table would have been two
--   admin screens, two notification paths and two definitions of "submitted",
--   which drift the first time one of them is changed.
--
-- INVITE ONLY, AND THAT IS THE POINT
--   An agent is trusted with somebody's address and shows up at their door.
--   Nobody self-serves into this role: the same shape as a staff invite - a
--   token mailed to an address, redeemed once, and the person sets their own
--   password on the way in. `claim_role` is deliberately not widened.
--
-- THE OWNER IS TOLD WHO IS COMING
--   A stranger arriving to photograph your property is alarming unless you were
--   expecting them. The trigger below notifies the landlord or the vendor the
--   moment an agent is assigned, by name, and notifies the agent too - so the
--   assignment appears on both dashboards without either side polling.
--
-- ROLLBACK
--   alter table public.verification_visits rename to hostel_verification_visits;
--   (then drop the added columns, the invites table and the functions below)
-- ============================================================================

-- === 1. The role is legal ===================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'student', 'vendor', 'landlord', 'rider',
    'event_manager', 'creator',
    'agent',
    'admin', 'super_admin'
  ));

-- === 2. Visits, for any kind of place =======================================
alter table if exists public.hostel_verification_visits
  rename to verification_visits;

alter table public.verification_visits
  -- Nullable now: a vendor visit has no hostel.
  alter column hostel_id drop not null,
  add column if not exists vendor_id     uuid references public.vendor_profiles (id) on delete cascade,
  -- WHO THE AGENT IS MEETING. For a hostel that is usually the student who
  -- asked to view it   the agent and the viewer arrive together, which is
  -- safer for both and means one trip instead of two.
  add column if not exists meet_user_id  uuid references public.profiles (id) on delete set null,
  add column if not exists assigned_by   uuid references public.profiles (id) on delete set null,
  add column if not exists assigned_at   timestamptz,
  -- Free text from whoever assigned it: which gate, who to ask for, what to
  -- photograph. The single most useful field on the row and it did not exist.
  add column if not exists brief         text;

comment on table public.verification_visits is
  'An agent going to look at a place - a hostel or a vendor''s address - and what they found. Was hostel_verification_visits; generalised in 20260905120000.';

comment on column public.verification_visits.ambassador_id is
  'The agent assigned. Named ambassador_id since 0006 and left alone: renaming a column that four policies and two screens read is churn, not clarity.';

-- Exactly one subject. A visit to nothing, or to both at once, is not a visit
-- anybody can be sent on   and this is the constraint the app would otherwise
-- have to remember in four places.
alter table public.verification_visits
  drop constraint if exists verification_visits_one_subject;
alter table public.verification_visits
  add constraint verification_visits_one_subject
  check ((hostel_id is not null) <> (vendor_id is not null));

create index if not exists verification_visits_agent_idx
  on public.verification_visits (ambassador_id, status, scheduled_for);
create index if not exists verification_visits_vendor_idx
  on public.verification_visits (vendor_id, created_at desc)
  where vendor_id is not null;

-- === 3. Invites =============================================================
create table if not exists public.agent_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  -- Where they will work. Not a permission   an agent is not scoped by it   but
  -- it is what the assigning admin filters on, and telling somebody the campus
  -- before they accept is basic courtesy.
  campus_id   uuid references public.campuses (id) on delete set null,
  token       text not null unique
                default replace(gen_random_uuid()::text, '-', '')
                     || replace(gen_random_uuid()::text, '-', ''),
  invited_by  uuid not null references public.profiles (id) on delete cascade,
  -- THREE DAYS, not the ten minutes a console invite gets. Console access is
  -- the whole platform and a stray link is catastrophic; an agent invite grants
  -- the ability to be sent somewhere and nothing else, and the recipient is a
  -- field worker who may not open email until the evening.
  expires_at  timestamptz not null default now() + interval '3 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- One live invite per address, for the same reason as staff: two valid tokens
-- for one mailbox and no way to say which was cancelled.
create unique index if not exists agent_invites_pending_idx
  on public.agent_invites (lower(email))
  where accepted_at is null and revoked_at is null;

comment on table public.agent_invites is
  'Pending agent invitations. The token is the proof of mailbox control, delivered out of band by email; the app never selects that column except at creation.';

alter table public.agent_invites enable row level security;

-- Staff read them (the console lists who is outstanding). Nobody writes from a
-- client: creation and redemption are the definer functions below, which is
-- what keeps the token out of reach.
drop policy if exists "agent_invites_staff_read" on public.agent_invites;
create policy "agent_invites_staff_read" on public.agent_invites
  for select to authenticated using (public.is_staff());

revoke all on public.agent_invites from anon;
grant select on public.agent_invites to authenticated;

-- Returns the token exactly once, to the staff member who created it.
create or replace function public.create_agent_invite(p_email text, p_campus uuid default null)
returns table (invite_id uuid, invite_token text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_staff() then
    raise exception 'Only staff can invite an agent' using errcode = '42501';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'That is not an email address' using errcode = '22023';
  end if;

  -- Supersede any outstanding invite for this address rather than failing on
  -- the unique index. The old token stops working, which is what somebody
  -- clicking "invite again" means.
  update public.agent_invites
     set revoked_at = now()
   where lower(email) = v_email and accepted_at is null and revoked_at is null;

  return query
  insert into public.agent_invites (email, campus_id, invited_by)
  values (v_email, p_campus, v_uid)
  returning agent_invites.id, agent_invites.token;
end;
$fn$;

revoke all on function public.create_agent_invite(text, uuid) from public, anon;
grant execute on function public.create_agent_invite(text, uuid) to authenticated, service_role;

create or replace function public.revoke_agent_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not public.is_staff() then
    raise exception 'Only staff can revoke an invite' using errcode = '42501';
  end if;
  update public.agent_invites set revoked_at = now()
   where id = p_id and accepted_at is null;
end;
$fn$;

revoke all on function public.revoke_agent_invite(uuid) from public, anon;
grant execute on function public.revoke_agent_invite(uuid) to authenticated, service_role;

-- Redeemed by the account that owns the address, exactly as a staff invite is.
create or replace function public.accept_agent_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_invite public.agent_invites%rowtype;
  v_email  text;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select * into v_invite from public.agent_invites where token = p_token;
  if not found then
    raise exception 'This invite link is not valid' using errcode = 'P0002';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'This invite has already been used' using errcode = 'P0001';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'This invite was cancelled' using errcode = 'P0001';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'This invite has expired. Ask for a new one.' using errcode = 'P0001';
  end if;

  -- The invite proves control of a MAILBOX, so the account redeeming it has to
  -- be the one that owns that mailbox and has confirmed it.
  select lower(u.email) into v_email
    from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;

  if v_email is null or v_email is distinct from lower(v_invite.email) then
    raise exception 'This invite was sent to %, so it has to be accepted by that account.',
      v_invite.email using errcode = '42501';
  end if;

  -- Staff are never demoted by accepting one   an admin who also does visits
  -- keeps the console. The role is ADDED to what they hold either way.
  update public.profiles
     set role  = case when role in ('admin', 'super_admin') then role else 'agent' end,
         roles = (select array(
                    select distinct unnest(coalesce(roles, array[]::text[]) || array['agent'])
                  )),
         campus_id = coalesce(campus_id, v_invite.campus_id)
   where id = v_uid;

  update public.agent_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_invite.id;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'agent', 'agent.invite_accepted', 'profile', v_uid::text,
          '{}'::jsonb, jsonb_build_object('invited_by', v_invite.invited_by));

  return 'ok';
end;
$fn$;

revoke all on function public.accept_agent_invite(text) from public, anon;
grant execute on function public.accept_agent_invite(text) to authenticated, service_role;

-- === 4. Assigning a visit ===================================================
-- One function rather than an insert policy: assigning is four decisions at
-- once (who, where, when, and what they are being told), it has to notify two
-- people, and every one of those has to happen together or not at all.
create or replace function public.assign_verification_visit(
  p_agent    uuid,
  p_hostel   uuid default null,
  p_vendor   uuid default null,
  p_when     timestamptz default null,
  p_meet     uuid default null,
  p_brief    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := (select auth.uid());
  v_id      uuid;
  v_agent   text;
  v_place   text;
  v_owner   uuid;
  v_when    text;
begin
  if not public.is_staff() then
    raise exception 'Only staff can assign a visit' using errcode = '42501';
  end if;

  if (p_hostel is null) = (p_vendor is null) then
    raise exception 'Assign a visit to a hostel or to a vendor, not to both'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles
     where id = p_agent
       and ('agent' = any (coalesce(roles, array[]::text[])) or role = 'agent')
  ) then
    raise exception 'That account is not an agent' using errcode = '22023';
  end if;

  insert into public.verification_visits
    (hostel_id, vendor_id, ambassador_id, meet_user_id, assigned_by, assigned_at,
     brief, scheduled_for, status)
  values
    (p_hostel, p_vendor, p_agent, p_meet, v_uid, now(),
     nullif(trim(coalesce(p_brief, '')), ''), p_when,
     case when p_when is null then 'Not Visited' else 'Visit Scheduled' end)
  returning id into v_id;

  -- Who is coming, where, and when   the three things the owner needs.
  select coalesce(nullif(trim(full_name), ''), 'A Sync agent') into v_agent
    from public.profiles where id = p_agent;

  if p_hostel is not null then
    select h.name, h.landlord_id into v_place, v_owner
      from public.hostels h where h.id = p_hostel;
  else
    select vp.business_name, vp.id into v_place, v_owner
      from public.vendor_profiles vp where vp.id = p_vendor;
  end if;

  v_when := case
              when p_when is null then 'They will contact you to agree a time.'
              else 'Expected ' || to_char(p_when at time zone 'Africa/Lagos',
                                          'FMDay FMDD FMMonth, HH12:MIam') || '.'
            end;

  -- THE OWNER, BY NAME. A stranger with a camera at your gate is alarming
  -- unless you were told to expect them, and this is the telling.
  perform private.notify(
    v_owner,
    'verification',
    'A Sync agent is visiting ' || coalesce(v_place, 'your listing'),
    v_agent || ' has been assigned to verify it. ' || v_when,
    'settings',
    null,
    v_id,
    'verification_visit'
  );

  -- And the agent, so it lands on their dashboard without them refreshing it.
  perform private.notify(
    p_agent,
    'verification',
    'New visit: ' || coalesce(v_place, 'a listing'),
    'You have been assigned a verification visit. ' || v_when,
    'visits',
    null,
    v_id,
    'verification_visit'
  );

  -- The student who asked to view the room, when there is one. They are turning
  -- up at the same address and are entitled to know who else will be there.
  if p_meet is not null then
    perform private.notify(
      p_meet,
      'verification',
      'Your viewing has a Sync agent',
      v_agent || ' will be at ' || coalesce(v_place, 'the viewing') || ' with you. ' || v_when,
      'bookings',
      null,
      v_id,
      'verification_visit'
    );
  end if;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
  values (v_uid, 'staff', 'visit.assigned', 'verification_visit', v_id::text,
          jsonb_build_object('agent', p_agent, 'hostel', p_hostel, 'vendor', p_vendor));

  return v_id;
end;
$fn$;

revoke all on function public.assign_verification_visit(uuid, uuid, uuid, timestamptz, uuid, text)
  from public, anon;
grant execute on function public.assign_verification_visit(uuid, uuid, uuid, timestamptz, uuid, text)
  to authenticated, service_role;

-- === 5. What an agent may do with their own visit ===========================
-- Submitting is the only write an agent has: photos, a video, notes, and the
-- status moving to Under Review. They cannot decide their own visit   that is
-- the whole separation of duties this table exists for.
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

  update public.verification_visits
     set photos       = coalesce(p_photos, photos),
         video_url    = coalesce(p_video, video_url),
         notes        = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
         status       = 'Under Review',
         submitted_at = now(),
         updated_at   = now()
   where id = p_visit;

  return 'Under Review';
end;
$fn$;

revoke all on function public.submit_verification_visit(uuid, text[], text, text)
  from public, anon;
grant execute on function public.submit_verification_visit(uuid, text[], text, text)
  to authenticated, service_role;

-- === 6. Reading ============================================================
alter table public.verification_visits enable row level security;

-- The agent sees their own work.
drop policy if exists "visits_agent_read" on public.verification_visits;
create policy "visits_agent_read" on public.verification_visits
  for select to authenticated
  using (ambassador_id = (select auth.uid()));

-- The owner sees visits to their own place, which is what makes "who is coming
-- to my property" answerable on their own dashboard rather than only in a
-- notification they may have swiped away.
drop policy if exists "visits_owner_read" on public.verification_visits;
create policy "visits_owner_read" on public.verification_visits
  for select to authenticated
  using (
    vendor_id = (select auth.uid())
    or exists (
      select 1 from public.hostels h
       where h.id = verification_visits.hostel_id
         and h.landlord_id = (select auth.uid())
    )
    or meet_user_id = (select auth.uid())
  );

drop policy if exists "visits_staff_read" on public.verification_visits;
create policy "visits_staff_read" on public.verification_visits
  for select to authenticated
  using (public.is_staff());

grant select on public.verification_visits to authenticated;
