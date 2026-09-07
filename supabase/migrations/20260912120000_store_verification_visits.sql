-- ============================================================================
-- store_verification_visits   a shop gets looked at, and the looking is
-- triggered by opening the shop rather than by somebody remembering.
--
-- THE FLOW THIS COMPLETES
--   sign up -> onboarding -> create a store -> AN AGENT GOES AND LOOKS.
--   The first three steps have worked for weeks. The fourth never fired on its
--   own: `assign_verification_visit` existed and could already take a vendor,
--   but the only way to reach it was a staff member noticing that a store had
--   appeared. Nobody was watching that list, so no vendor address has ever been
--   physically checked.
--
-- WHY A STOREFRONT COLUMN AND NOT JUST vendor_id
--   `vendor_id` is the BRAND (vendor_profiles.id = the owner's account). A
--   brand has many branches, each at its own address, each with its own geo and
--   its own trading hours   that is the entire point of the storefronts table.
--   Sending an agent to `vendor_id` tells them WHO to visit and not WHERE, and
--   a business with a Tanke branch and a Safari branch has two addresses and
--   one row to describe both. The agent's brief was carrying the address as
--   free text, which is to say it was carrying it nowhere.
--
--   So the subject of a visit becomes one of three, not one of two. vendor_id
--   is kept and not migrated away: 20260905120000 uses it for the whole-brand
--   check (documents, identity, the business as an entity), which is a real and
--   different question from "is there a shop at this address".
--
-- WHY THE TRIGGER, RATHER THAN A BUTTON IN THE CONSOLE
--   A store that nobody was sent to look at is indistinguishable, on every
--   screen, from a store whose visit has not happened yet. The queue is the
--   only place that difference is visible, so the row has to exist from the
--   moment the store does. An unassigned 'Not Visited' row IS the request.
--
--   This is deliberately asymmetric with hostels, where "no row at all" means
--   unvisited and `/admin/verify-visits` derives the list by subtraction. That
--   works only because somebody is already reading the hostels table for other
--   reasons. Nobody reads storefronts looking for work, and a queue you have to
--   compute is a queue that silently empties.
--
-- WHY THE STORE CARRIES ITS OWN VERIFIED STATE
--   `vendor_profiles.verification_status` answers "are these people real",
--   decided from documents. `storefronts.verified_at` answers "is there really
--   a shop here", decided from photographs. A verified business can open a
--   fourth branch tomorrow at an address no-one has seen, and collapsing the
--   two would mark that branch verified on the strength of a visit to a
--   different street.
--
-- ROLLBACK
--   drop trigger if exists storefronts_request_visit on public.storefronts;
--   drop function if exists private.request_store_verification_visit();
--   drop function if exists public.decide_store_visit(uuid, text, text);
--   drop function if exists private.owns_storefront(uuid);
--   alter table public.verification_visits drop column if exists storefront_id;
--   alter table public.storefronts
--     drop column if exists verified_at, drop column if exists verified_by;
--   -- then restore assign_verification_visit from 20260905120000,
--   -- flag_visit_fraud from 20260910090000, reassign_verification_visit from
--   -- 20260907090000 and guard_storefront_privileged_cols from 20260822130000.
--
-- ALSO FIXED HERE, found while widening reassign_verification_visit and called
-- out so it is not mistaken for part of the store work: standing an agent down
-- never told that agent. See section 4b.
-- ============================================================================

-- === 1. A visit can name a branch ===========================================
alter table public.verification_visits
  add column if not exists storefront_id uuid
    references public.storefronts (id) on delete cascade;

comment on column public.verification_visits.storefront_id is
  'The BRANCH being visited, which is where the agent actually goes. vendor_id remains the whole-brand check; the two are different questions and a visit answers exactly one of them.';

-- Exactly one subject, now out of three. Same reasoning as 20260905120000: a
-- visit to nothing, or to two things at once, is not a visit anybody can be
-- sent on, and this is the constraint the app would otherwise have to remember
-- in five places instead of four.
alter table public.verification_visits
  drop constraint if exists verification_visits_one_subject;
alter table public.verification_visits
  add constraint verification_visits_one_subject check (
    (hostel_id     is not null)::integer
  + (vendor_id     is not null)::integer
  + (storefront_id is not null)::integer
  = 1
  );

create index if not exists verification_visits_storefront_idx
  on public.verification_visits (storefront_id, created_at desc)
  where storefront_id is not null;

-- The staff queue reads "what is waiting" far more often than it reads any one
-- row, and until now that was a sequential scan over every visit ever decided.
create index if not exists verification_visits_open_idx
  on public.verification_visits (status, created_at desc)
  where status in ('Not Visited', 'Visit Scheduled', 'Under Review');

-- === 2. The branch's own verified state =====================================
alter table public.storefronts
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles (id) on delete set null;

comment on column public.storefronts.verified_at is
  'Set only by decide_store_visit, on the strength of an agent standing at this address. Distinct from vendor_profiles.verification_status, which is about the business rather than the place.';

-- FROZEN AGAINST THE OWNER, on the same terms as vendor_profiles.
-- guard_storefront_privileged_cols already restores rather than raises (see
-- 20260822130000), so an over-broad PATCH from the store form degrades to a
-- no-op instead of erroring   which matters here because the store form does
-- send the whole row back.
--
-- NOTE THE WIDENED CONDITION. The existing guard only defends a store from
-- somebody who is NOT its owner, because everything it froze was about who owns
-- the branch. Verification is the opposite shape: the owner is exactly the
-- person with a motive to set it, so this clause fires for every client-side
-- caller including them. Service role is untouched and remains the only writer,
-- which is what decide_store_visit runs as.
create or replace function public.guard_storefront_privileged_cols()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if current_user in ('authenticated', 'anon')
     and (select auth.uid()) is distinct from old.vendor_id then
    -- Not the owner: staff may edit trading details, nothing structural.
    new.vendor_id   := old.vendor_id;
    new.is_primary  := old.is_primary;
    new.slug        := old.slug;
    new.archived_at := old.archived_at;
  end if;

  -- A shop cannot certify that it exists. No client-side role may move these,
  -- owner included.
  if current_user in ('authenticated', 'anon') then
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists storefronts_guard_cols on public.storefronts;
create trigger storefronts_guard_cols
  before update on public.storefronts
  for each row execute function public.guard_storefront_privileged_cols();

-- === 3. Opening a store asks for a visit ====================================
-- SECURITY DEFINER because it has to be. `verification_visits` has RLS on and
-- no insert policy at all   deliberately, since assignment is a definer
-- function   so this trigger running as the vendor would be denied its own
-- write and the store would be created with no request behind it.
create or replace function private.request_store_verification_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_visit uuid;
  v_brand text;
  v_where text;
begin
  select coalesce(nullif(trim(vp.business_name), ''), 'A business')
    into v_brand
    from public.vendor_profiles vp
   where vp.id = new.vendor_id;

  -- THE ADDRESS, ON THE ROW, FROM THE START. The brief is the field an agent
  -- actually reads before setting out, and a brief that says only the shop's
  -- name has sent somebody to the wrong side of Malete before. Staff can still
  -- overwrite it when they assign.
  v_where := coalesce(nullif(trim(new.address), ''), nullif(trim(new.area), ''));

  insert into public.verification_visits (storefront_id, status, brief)
  values (
    new.id,
    -- Nobody has been sent yet. This is the request, not the appointment.
    'Not Visited',
    'Confirm ' || coalesce(v_brand, 'this business') || ' is trading at '
      || coalesce(v_where, 'the address on the store record') || '.'
  )
  returning id into v_visit;

  perform private.notify_staff(
    'verification',
    'A new store needs a visit',
    coalesce(v_brand, 'A business') || ' opened "' || new.name || '"'
      || case when v_where is null then '' else ' at ' || v_where end
      || '. Nobody has been assigned yet.',
    'verify-visits',
    v_visit,
    'verification_visit'
  );

  return new;
exception
  when others then
    -- SAME RULE AS private.notify: the alert must never take down the write
    -- that caused it. A vendor who cannot create a store because the staff
    -- queue hiccuped is a far worse failure than a store with no visit row,
    -- and the latter is recoverable by hand from the console.
    raise warning 'store visit request failed for % : %', new.id, sqlerrm;
    return new;
end;
$fn$;

drop trigger if exists storefronts_request_visit on public.storefronts;
create trigger storefronts_request_visit
  after insert on public.storefronts
  for each row execute function private.request_store_verification_visit();

comment on function private.request_store_verification_visit() is
  'Every new branch enters the verification queue the moment it exists. AFTER INSERT only   restoring an archived store must not queue a second visit.';

-- === 4. Assigning, to any of the three ======================================
-- THE OLD SIGNATURE MUST GO, not merely be replaced. A seventh parameter with a
-- default leaves both versions callable with six arguments, and every existing
-- call then fails as ambiguous rather than resolving to the new one. Same trap
-- 20260901260000 hit with set_verification_status.
--
-- THIS STILL ONLY INSERTS, and deliberately. A store queued by the trigger
-- above already HAS a row, and putting an agent on it is
-- `reassign_verification_visit`   which exists for exactly that and carries the
-- stand-down notifications with it. Teaching this function to update as well
-- would give the queue two ways to do one thing, and the one that inserts would
-- quietly produce a second visit to the same address, telling the owner twice.
-- 20260907090000 made that argument already; nothing about stores changes it.
drop function if exists public.assign_verification_visit(uuid, uuid, uuid, timestamptz, uuid, text);

create or replace function public.assign_verification_visit(
  p_agent      uuid,
  p_hostel     uuid default null,
  p_vendor     uuid default null,
  p_when       timestamptz default null,
  p_meet       uuid default null,
  p_brief      text default null,
  p_storefront uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid      uuid := (select auth.uid());
  v_id       uuid;
  v_agent    text;
  v_place    text;
  v_owner    uuid;
  v_when     text;
  v_subjects integer;
  -- The hat the owner's alert belongs to, and the dashboard its href resolves
  -- against. 20260911150000 added the column for exactly this: `href` is a
  -- SUFFIX resolved against whichever dashboard is open, so an unstamped
  -- 'stores' link clicked from /admin builds /admin/stores, which is not a
  -- page. A landlord who is also staff hit that with 'requests' already.
  v_href     text;
  v_role     text;
begin
  if not public.is_staff() then
    raise exception 'Only staff can assign a visit' using errcode = '42501';
  end if;

  v_subjects := (p_hostel is not null)::integer
              + (p_vendor is not null)::integer
              + (p_storefront is not null)::integer;

  if v_subjects <> 1 then
    raise exception 'Assign a visit to a hostel, a store or a business   exactly one'
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
    (hostel_id, vendor_id, storefront_id, ambassador_id, meet_user_id,
     assigned_by, assigned_at, brief, scheduled_for, status)
  values
    (p_hostel, p_vendor, p_storefront, p_agent, p_meet,
     v_uid, now(), nullif(trim(coalesce(p_brief, '')), ''), p_when,
     case when p_when is null then 'Not Visited' else 'Visit Scheduled' end)
  returning id into v_id;

  -- Who is coming, where, and when   the three things the owner needs.
  select coalesce(nullif(trim(full_name), ''), 'A Sync agent') into v_agent
    from public.profiles where id = p_agent;

  if p_hostel is not null then
    select h.name, h.landlord_id into v_place, v_owner
      from public.hostels h where h.id = p_hostel;
    v_href := 'settings';
    v_role := 'landlord';
  elsif p_storefront is not null then
    -- The BRANCH name, qualified by the brand, because "Tanke branch" on its
    -- own is not a thing the owner recognises out of context.
    select coalesce(nullif(trim(vp.business_name), '') || ' - ', '') || sf.name,
           sf.vendor_id
      into v_place, v_owner
      from public.storefronts sf
      join public.vendor_profiles vp on vp.id = sf.vendor_id
     where sf.id = p_storefront;
    v_href := 'stores';
    v_role := 'vendor';
  else
    select vp.business_name, vp.id into v_place, v_owner
      from public.vendor_profiles vp where vp.id = p_vendor;
    v_href := 'settings';
    v_role := 'vendor';
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
    v_href,
    null,
    v_id,
    'verification_visit',
    v_role
  );

  perform private.notify(
    p_agent,
    'verification',
    'New visit: ' || coalesce(v_place, 'a listing'),
    'You have been assigned a verification visit. ' || v_when,
    'visits',
    null,
    v_id,
    'verification_visit',
    -- 'visits' only exists under /agent. Unstamped, this is the alert that
    -- pointed at /agent/visits from a dashboard with no such route.
    'agent'
  );

  if p_meet is not null then
    perform private.notify(
      p_meet,
      'verification',
      'Your viewing has a Sync agent',
      v_agent || ' will be at ' || coalesce(v_place, 'the viewing') || ' with you. ' || v_when,
      'bookings',
      null,
      v_id,
      'verification_visit',
      'student'
    );
  end if;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
  values (v_uid, 'staff', 'visit.assigned', 'verification_visit', v_id::text,
          jsonb_build_object('agent', p_agent, 'hostel', p_hostel,
                             'vendor', p_vendor, 'storefront', p_storefront));

  return v_id;
end;
$fn$;

revoke all on function public.assign_verification_visit(uuid, uuid, uuid, timestamptz, uuid, text, uuid)
  from public, anon;
grant execute on function public.assign_verification_visit(uuid, uuid, uuid, timestamptz, uuid, text, uuid)
  to authenticated, service_role;

-- === 4b. Reassignment has to know about the third subject too ===============
-- `reassign_verification_visit` is the function that actually puts an agent on
-- a store visit, because the trigger above created the row before any agent
-- existed   so it is on the PRIMARY path for this feature, not a side road.
--
-- It branches "hostel, else vendor" exactly as flag_visit_fraud did. A store
-- visit is neither, so it read a null vendor_id, resolved no owner and no
-- place, and then: the owner notification was skipped entirely (v_owner null),
-- and both agent notifications read "New visit: a listing". The one message
-- whose entire purpose is telling somebody WHICH address to go to would have
-- named no address at all.
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
  v_href  text;
  v_role  text;
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
    v_href := 'settings';
    v_role := 'landlord';
  elsif v_row.storefront_id is not null then
    select coalesce(nullif(trim(vp.business_name), '') || ' - ', '') || sf.name,
           sf.vendor_id
      into v_place, v_owner
      from public.storefronts sf
      join public.vendor_profiles vp on vp.id = sf.vendor_id
     where sf.id = v_row.storefront_id;
    v_href := 'stores';
    v_role := 'vendor';
  else
    select vp.business_name, vp.id into v_place, v_owner
      from public.vendor_profiles vp where vp.id = v_row.vendor_id;
    v_href := 'settings';
    v_role := 'vendor';
  end if;

  -- Standing the current agent down, with nobody put in their place.
  if p_agent is null then
    -- Back to the queue, and honestly: no agent, no time.
    update public.verification_visits
       set ambassador_id = null,
           scheduled_for = null,
           status        = 'Not Visited',
           updated_at    = now()
     where id = p_visit;

    -- FIXED HERE, and not part of the store work   found while widening this
    -- function. 20260907090000's own header says the stood-down agent must be
    -- told "otherwise they turn up at a stranger's gate believing they are
    -- expected", and then only the swap branch below told them. Standing an
    -- agent down (the "Stand down" button on the queue, which calls this with a
    -- null agent) notified the OWNER that the visit was being rearranged and
    -- left the agent still believing they were going. That is precisely the
    -- situation the notifications exist to prevent, reachable from a button.
    perform private.notify(
      v_row.ambassador_id,
      'verification',
      'Visit cancelled: ' || coalesce(v_place, 'a listing'),
      'You are no longer going to this one. It has gone back to the queue.',
      'visits',
      null,
      p_visit,
      'verification_visit',
      'agent'
    );

    if v_owner is not null then
      perform private.notify(
        v_owner,
        'verification',
        'The visit to ' || coalesce(v_place, 'your listing') || ' is being rearranged',
        'The agent who was coming is no longer available. We will confirm a new time.',
        v_href,
        null,
        p_visit,
        'verification_visit',
        v_role
      );
    end if;

    insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
    values (v_uid, 'staff', 'visit.unassigned', 'verification_visit', p_visit::text,
            jsonb_build_object('was', v_row.ambassador_id));

    return p_visit;
  end if;

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
    'verification_visit',
    'agent'
  );

  -- The agent being stood down, so they do not turn up at a stranger's gate
  -- believing they are expected.
  if v_row.ambassador_id is not null then
    perform private.notify(
      v_row.ambassador_id,
      'verification',
      'Visit reassigned: ' || coalesce(v_place, 'a listing'),
      'You are no longer going to this one. It has been given to somebody else.',
      'visits',
      null,
      p_visit,
      'verification_visit',
      'agent'
    );
  end if;

  if v_owner is not null then
    perform private.notify(
      v_owner,
      'verification',
      'A different agent is visiting ' || coalesce(v_place, 'your listing'),
      coalesce(v_new, 'A Sync agent') || ' is coming instead of '
        || coalesce(v_old, 'the agent originally assigned') || '. ' || v_when,
      v_href,
      null,
      p_visit,
      'verification_visit',
      v_role
    );
  end if;

  if v_row.meet_user_id is not null then
    perform private.notify(
      v_row.meet_user_id,
      'verification',
      'A different agent is coming to your viewing',
      coalesce(v_new, 'A Sync agent') || ' will be at ' || coalesce(v_place, 'the viewing')
        || ' with you. ' || v_when,
      'bookings',
      null,
      p_visit,
      'verification_visit',
      'student'
    );
  end if;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'staff', 'visit.reassigned', 'verification_visit', p_visit::text,
          jsonb_build_object('agent', v_row.ambassador_id),
          jsonb_build_object('agent', p_agent));

  return p_visit;
end;
$fn$;

revoke all on function public.reassign_verification_visit(uuid, uuid) from public, anon;
grant execute on function public.reassign_verification_visit(uuid, uuid) to authenticated, service_role;

-- === 5. Deciding a store visit ==============================================
-- The hostel equivalent lives in the app (`decideHostelVisit`, service role,
-- assertStaffArea). This one is in the database instead, and deliberately: the
-- visit row and `storefronts.verified_at` have to move together or a store is
-- verified with no evidence behind it, and a server action cannot offer a
-- transaction across two tables. The hostel path should follow eventually; it
-- is not being changed here because nothing about stores requires it.
create or replace function public.decide_store_visit(
  p_visit    uuid,
  p_decision text,
  p_notes    text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := (select auth.uid());
  v_row   public.verification_visits%rowtype;
  v_owner uuid;
  v_place text;
begin
  if not public.is_staff() then
    raise exception 'Only Sync staff can decide a verification visit' using errcode = '42501';
  end if;

  if p_decision not in ('Verified', 'Rejected') then
    raise exception 'A visit is Verified or Rejected. Fraud goes through flag_visit_fraud.'
      using errcode = '22023';
  end if;

  select * into v_row from public.verification_visits where id = p_visit for update;
  if not found then
    raise exception 'no such visit' using errcode = 'P0002';
  end if;
  if v_row.storefront_id is null then
    raise exception 'That visit is not to a store' using errcode = '22023';
  end if;
  if v_row.status in ('Verified', 'Rejected', 'Fraud') then
    raise exception 'That visit has already been decided' using errcode = 'P0001';
  end if;

  -- EVIDENCE BEFORE A DECISION, for the same reason decideHostelVisit checks
  -- it: a verified badge is the one claim on this platform that has to mean
  -- somebody stood at the address. 'Under Review' is only reachable through
  -- submit_verification_visit, which already refuses a submission with no
  -- photo   so this is one status check rather than a second evidence rule
  -- that could drift from the first.
  --
  -- REJECTION IS GATED TOO. Rejecting a store nobody visited tells a vendor
  -- their shop failed a check that never happened. A visit that should not
  -- have been scheduled is reassigned, not rejected.
  if v_row.status <> 'Under Review' then
    raise exception 'The agent has not filed their report yet, so there is nothing to decide on'
      using errcode = 'P0001';
  end if;

  update public.verification_visits
     set status     = p_decision,
         decided_by = v_uid,
         decided_at = now(),
         notes      = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
         updated_at = now()
   where id = p_visit;

  update public.storefronts
     set verified_at = case when p_decision = 'Verified' then now() else null end,
         verified_by = case when p_decision = 'Verified' then v_uid else null end,
         updated_at  = now()
   where id = v_row.storefront_id
  returning vendor_id, name into v_owner, v_place;

  perform private.notify(
    v_owner,
    'verification',
    case when p_decision = 'Verified'
         then coalesce(v_place, 'Your store') || ' is verified'
         else 'We could not verify ' || coalesce(v_place, 'your store') end,
    case when p_decision = 'Verified'
         then 'An agent confirmed you are trading at this address.'
         else coalesce(nullif(trim(coalesce(p_notes, '')), ''),
                       'An agent could not confirm this address. Check the details and contact support.')
    end,
    'stores',
    null,
    p_visit,
    'verification_visit',
    -- 'stores' is a suffix under /vendor. Unstamped, a vendor who also holds
    -- staff would click this from /admin and land on /admin/stores.
    'vendor'
  );

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'staff', 'visit.decided', 'verification_visit', p_visit::text,
          jsonb_build_object('status', v_row.status),
          jsonb_build_object('status', p_decision, 'storefront', v_row.storefront_id));

  return p_decision;
end;
$fn$;

revoke all on function public.decide_store_visit(uuid, text, text) from public, anon;
grant execute on function public.decide_store_visit(uuid, text, text) to authenticated, service_role;

comment on function public.decide_store_visit(uuid, text, text) is
  'The ONLY path to a verified storefront. Staff only, audited, refuses to decide a visit the agent has not filed evidence on.';

-- === 6. Fraud has to know about the third subject ===========================
-- 20260910090000 branches on "hostel, else vendor". A store visit is neither,
-- so it fell into the vendor branch, read a null vendor_id, and blocked nobody
-- while reporting success   the account it was meant to stop would have gone
-- straight back into the queue.
-- RETURNS uuid, unchanged from 20260910090000. Postgres will not let `create or
-- replace` alter a return type (42P13), and there is no reason to want to: the
-- only caller checks the error and ignores the value.
create or replace function public.flag_visit_fraud(p_visit uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_v      public.verification_visits%rowtype;
  v_owner  uuid;
  v_place  text;
  v_role   text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_staff() then
    raise exception 'Only staff can flag a visit' using errcode = '42501';
  end if;

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

  if v_v.hostel_id is not null then
    -- The listing stays, unverified. 20260908150000 already hides an unverified
    -- hostel from students; deleting it would take the evidence with it.
    update public.hostels set verified = false, updated_at = now()
     where id = v_v.hostel_id;
    select h.landlord_id, h.name into v_owner, v_place
      from public.hostels h where h.id = v_v.hostel_id;
    v_role := 'landlord';

  elsif v_v.storefront_id is not null then
    -- The branch loses its badge and the BRAND is blocked, because a fake
    -- address is a fact about the people, not about the shopfront.
    update public.storefronts
       set verified_at = null, verified_by = null, updated_at = now()
     where id = v_v.storefront_id
    returning vendor_id, name into v_owner, v_place;
    v_role := 'vendor';

  else
    v_owner := v_v.vendor_id;
    select vp.business_name into v_place
      from public.vendor_profiles vp where vp.id = v_v.vendor_id;
    v_role := 'vendor';
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
      'verification_visit',
      v_role
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

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
  values (v_uid, 'staff', 'visit.fraud', 'verification_visit', p_visit::text,
          jsonb_build_object('reason', v_reason, 'owner', v_owner));

  return p_visit;
end;
$fn$;

revoke all on function public.flag_visit_fraud(uuid, text) from public, anon;
grant execute on function public.flag_visit_fraud(uuid, text) to authenticated, service_role;

-- === 7. Who may read a store visit ==========================================
-- INVARIANT 1 (docs/WORKFLOW.md section 4): a policy expression runs as the
-- CALLER, so everything it touches must be reachable by every role the policy
-- applies to. `storefronts` is publicly readable only WHILE NOT ARCHIVED, so a
-- policy that joined it directly would hide an archived store's visit history
-- from the very owner who archived it. Hence a definer wrapper, exactly as
-- `is_assigned_agent` exists for the hostels policy.
create or replace function private.owns_storefront(p_storefront uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $fn$
  select exists (
    select 1 from public.storefronts sf
     where sf.id = p_storefront
       and sf.vendor_id = (select auth.uid())
  );
$fn$;

revoke all on function private.owns_storefront(uuid) from public, anon;
grant execute on function private.owns_storefront(uuid) to authenticated, service_role;

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
    or (verification_visits.storefront_id is not null
        and private.owns_storefront(verification_visits.storefront_id))
    or meet_user_id = (select auth.uid())
  );

-- === 8. Verify ==============================================================
-- Asserting on catalogue state rather than by doing: no role switching inside a
-- migration (docs/WORKFLOW.md section 3)   SET LOCAL ROLE without a clean
-- restore breaks the CLI's own bookkeeping INSERT.
do $fn$
declare
  v_txt text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'verification_visits'
       and column_name = 'storefront_id'
  ) then
    raise exception 'verification_visits.storefront_id missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'storefronts'
       and column_name = 'verified_at'
  ) then
    raise exception 'storefronts.verified_at missing';
  end if;

  -- The three-way subject constraint, not the old two-way one.
  select pg_get_constraintdef(oid) into v_txt
    from pg_constraint
   where conname = 'verification_visits_one_subject'
     and conrelid = 'public.verification_visits'::regclass;
  if v_txt is null or v_txt not like '%storefront_id%' then
    raise exception 'one_subject constraint does not know about storefronts: %',
      coalesce(v_txt, '<missing>');
  end if;

  if to_regprocedure('private.request_store_verification_visit()') is null then
    raise exception 'request_store_verification_visit missing';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.storefronts'::regclass
       and tgname  = 'storefronts_request_visit'
       and not tgisinternal
  ) then
    raise exception 'storefronts_request_visit trigger missing';
  end if;

  -- The six-argument assign MUST be gone, or every existing six-argument call
  -- is ambiguous rather than resolving to the widened version.
  if to_regprocedure('public.assign_verification_visit(uuid, uuid, uuid, timestamptz, uuid, text)') is not null then
    raise exception 'the old 6-arg assign_verification_visit still exists   calls will be ambiguous';
  end if;
  if to_regprocedure('public.assign_verification_visit(uuid, uuid, uuid, timestamptz, uuid, text, uuid)') is null then
    raise exception 'the widened assign_verification_visit is missing';
  end if;

  if to_regprocedure('public.decide_store_visit(uuid, text, text)') is null then
    raise exception 'decide_store_visit missing';
  end if;

  -- Reassignment is the PRIMARY path for a store visit   the trigger makes the
  -- row before any agent exists, so every store assignment goes through here
  -- rather than through assign_verification_visit. If this branch is missing,
  -- the agent is told to visit "a listing" with no address on it.
  select prosrc into v_txt from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reassign_verification_visit';
  if v_txt is null or v_txt not like '%storefront_id is not null%' then
    raise exception 'reassign_verification_visit does not resolve a store subject';
  end if;
  -- The stand-down notification this migration restores. Asserted because it
  -- was absent once already and nothing failed when it was.
  if v_txt not like '%It has gone back to the queue.%' then
    raise exception 'reassign_verification_visit does not tell a stood-down agent';
  end if;
  -- Role stamping, per 20260911150000. An unstamped 'stores' or 'visits' href
  -- resolves against whatever dashboard is open, which is how an alert builds
  -- /admin/stores for somebody who holds both hats.
  if v_txt not like '%v_role%' then
    raise exception 'reassign_verification_visit does not stamp a notification role';
  end if;

  select prosrc into v_txt from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'assign_verification_visit';
  if v_txt is null or v_txt not like '%v_role%' then
    raise exception 'assign_verification_visit does not stamp a notification role';
  end if;

  -- private.notify must be the single 9-argument version. 20260911180000 had to
  -- clean up exactly this: two overloads made every 8-argument call ambiguous
  -- and took down the bookings trigger with it.
  if (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' and p.proname = 'notify') <> 1 then
    raise exception 'private.notify is overloaded again   calls here will be ambiguous';
  end if;

  -- The guard has to freeze the new columns, or the owner can verify their own
  -- shop with a PATCH. This has been the shape of two separate escalations in
  -- this codebase already (see 20260910210000), so it is asserted on the source
  -- rather than trusted.
  select prosrc into v_txt from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'guard_storefront_privileged_cols';
  if v_txt is null or v_txt not like '%new.verified_at := old.verified_at%' then
    raise exception 'guard_storefront_privileged_cols does not freeze verified_at';
  end if;

  -- Fraud must reach a storefront owner. The bug this replaces blocked nobody
  -- while reporting success.
  select prosrc into v_txt from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'flag_visit_fraud';
  if v_txt is null or v_txt not like '%storefront_id is not null%' then
    raise exception 'flag_visit_fraud does not handle a store visit';
  end if;

  -- anon has no business reading who is being sent where.
  if has_table_privilege('anon', 'public.verification_visits', 'SELECT') then
    raise exception 'anon can read verification_visits';
  end if;
end;
$fn$;
