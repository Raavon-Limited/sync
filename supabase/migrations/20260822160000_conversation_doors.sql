-- ============================================================================
-- conversation_doors
--
-- Three of the five conversation subject types the schema permits had no way to
-- create one. `subject_type` has allowed 'booking', 'service_request' and
-- 'hostel' since 20260817090400, and `conversations` grants no INSERT, so those
-- threads were declared and unreachable: a student could not message a landlord
-- about a room, or a vendor about a beauty appointment, at all.
--
-- This adds the missing doors, following open_order_conversation exactly:
--   1. reject anonymous callers
--   2. load the subject
--   3. RE-CHECK AUTHORISATION BY HAND - SECURITY DEFINER turned RLS off
--   4. return the existing thread if there is one (idempotent)
--   5. otherwise insert the conversation and its participants
--
-- IDEMPOTENCY SCOPE IS NOT THE SAME FOR ALL OF THEM
--   A booking, a service request and a delivery each have exactly two parties,
--   so the subject alone identifies the thread. A HOSTEL does not - many
--   students enquire about the same property, exactly like listings - so
--   open_hostel_conversation scopes its lookup to the caller. Copying the
--   two-party form there would hand one student another's message history, the
--   same trap open_listing_conversation was written to avoid.
--
-- THE RIDER GETS THEIR OWN THREAD
--   A rider joins partway through and must not read what the student said about
--   the vendor before they were assigned. Adding them to the order thread would
--   expose that history, and a per-message visibility cutoff is far more
--   machinery than a second thread.
--
-- ROLLBACK
--   drop function if exists public.open_booking_conversation(uuid);
--   drop function if exists public.open_hostel_conversation(uuid);
--   drop function if exists public.open_service_conversation(uuid);
--   drop function if exists public.open_delivery_conversation(uuid);
--   -- constraint widening below is additive; restore the previous check from
--   -- 20260820160000_listing_conversations.sql to revert.
-- ============================================================================

-- 1. Vocabulary for delivery threads -----------------------------------------
-- 'booking', 'service_request' and 'hostel' are already permitted; only the
-- rider case needs new values.
alter table public.conversations drop constraint if exists conversations_kind_check;
alter table public.conversations add  constraint conversations_kind_check
  check (kind in ('direct', 'order', 'listing', 'booking', 'service_request',
                  'hostel', 'delivery', 'support'));

alter table public.conversations drop constraint if exists conversations_subject_type_check;
alter table public.conversations add  constraint conversations_subject_type_check
  check (subject_type in ('order', 'listing', 'booking', 'service_request',
                          'hostel', 'delivery'));

-- 2. Student <-> Landlord, about a booking ------------------------------------
create or replace function public.open_booking_conversation(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid      uuid := auth.uid();
  v_student  uuid;
  v_landlord uuid;
  v_hostel   text;
  v_convo    uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select b.student_id, h.landlord_id, h.name
    into v_student, v_landlord, v_hostel
    from public.bookings b
    join public.hostels  h on h.id = b.hostel_id
   where b.id = p_booking_id;

  if v_student is null then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_uid not in (v_student, v_landlord) then
    raise exception 'not a party to this booking' using errcode = '42501';
  end if;

  -- Two parties, so the subject alone identifies the thread.
  select id into v_convo from public.conversations
   where subject_type = 'booking' and subject_id = p_booking_id
   limit 1;
  if v_convo is not null then
    return v_convo;
  end if;

  insert into public.conversations (kind, subject_type, subject_id, created_by, last_message_preview)
  values ('booking', 'booking', p_booking_id, v_uid, v_hostel)
  returning id into v_convo;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_convo, v_student,  'member'),
         (v_convo, v_landlord, 'owner')
  on conflict do nothing;

  return v_convo;
end;
$fn$;

grant execute on function public.open_booking_conversation(uuid) to authenticated, service_role;

-- 3. Student <-> Landlord, BEFORE booking -------------------------------------
-- The hostel equivalent of open_listing_conversation: "is this room still
-- available" is asked long before any booking row exists.
create or replace function public.open_hostel_conversation(p_hostel_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid      uuid := auth.uid();
  v_landlord uuid;
  v_name     text;
  v_convo    uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select h.landlord_id, h.name into v_landlord, v_name
    from public.hostels h
   where h.id = p_hostel_id and h.archived_at is null;

  if v_landlord is null then
    raise exception 'hostel not found' using errcode = 'P0002';
  end if;
  if v_uid = v_landlord then
    raise exception 'cannot open a thread with yourself' using errcode = '42501';
  end if;

  -- Scoped to the CALLER: many students enquire about one property, and a
  -- subject-only lookup would hand this student someone else's thread.
  select c.id into v_convo
    from public.conversations c
    join public.conversation_participants p
      on p.conversation_id = c.id and p.user_id = v_uid
   where c.subject_type = 'hostel' and c.subject_id = p_hostel_id
   limit 1;
  if v_convo is not null then
    return v_convo;
  end if;

  insert into public.conversations (kind, subject_type, subject_id, created_by, last_message_preview)
  values ('hostel', 'hostel', p_hostel_id, v_uid, v_name)
  returning id into v_convo;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_convo, v_uid,      'member'),
         (v_convo, v_landlord, 'owner')
  on conflict do nothing;

  return v_convo;
end;
$fn$;

grant execute on function public.open_hostel_conversation(uuid) to authenticated, service_role;

-- 4. Student <-> Vendor, about a service request ------------------------------
-- Covers beauty, laundry and workmanship, which all run through
-- public.service_requests.
create or replace function public.open_service_conversation(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_student uuid;
  v_vendor  uuid;
  v_convo   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select sr.student_id, sr.vendor_id into v_student, v_vendor
    from public.service_requests sr
   where sr.id = p_request_id;

  if v_student is null then
    raise exception 'service request not found' using errcode = 'P0002';
  end if;
  -- vendor_profiles.id = profiles.id, so v_vendor is directly comparable.
  if v_uid not in (v_student, v_vendor) then
    raise exception 'not a party to this request' using errcode = '42501';
  end if;

  select id into v_convo from public.conversations
   where subject_type = 'service_request' and subject_id = p_request_id
   limit 1;
  if v_convo is not null then
    return v_convo;
  end if;

  insert into public.conversations (kind, subject_type, subject_id, created_by)
  values ('service_request', 'service_request', p_request_id, v_uid)
  returning id into v_convo;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_convo, v_student, 'member'),
         (v_convo, v_vendor,  'owner')
  on conflict do nothing;

  return v_convo;
end;
$fn$;

grant execute on function public.open_service_conversation(uuid) to authenticated, service_role;

-- 5. Student <-> Rider, about a delivery --------------------------------------
-- Keyed by ORDER because that is what both parties hold: the student is looking
-- at their order, the rider at their job. deliveries.order_id is unique, so it
-- identifies the delivery unambiguously.
create or replace function public.open_delivery_conversation(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_student uuid;
  v_rider   uuid;
  v_convo   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select o.student_id, d.rider_id into v_student, v_rider
    from public.deliveries d
    join public.orders     o on o.id = d.order_id
   where d.order_id = p_order_id;

  if v_student is null then
    raise exception 'delivery not found' using errcode = 'P0002';
  end if;
  -- rider_id is nullable until dispatch assigns one. There is nobody to talk
  -- to yet, and saying so beats creating a one-person thread.
  if v_rider is null then
    raise exception 'no rider assigned yet' using errcode = 'P0001';
  end if;
  if v_uid not in (v_student, v_rider) then
    raise exception 'not a party to this delivery' using errcode = '42501';
  end if;

  select id into v_convo from public.conversations
   where subject_type = 'delivery' and subject_id = p_order_id
   limit 1;
  if v_convo is not null then
    return v_convo;
  end if;

  -- Separate from the order thread on purpose - see the header.
  insert into public.conversations (kind, subject_type, subject_id, created_by)
  values ('delivery', 'delivery', p_order_id, v_uid)
  returning id into v_convo;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_convo, v_student, 'member'),
         (v_convo, v_rider,   'member')
  on conflict do nothing;

  return v_convo;
end;
$fn$;

grant execute on function public.open_delivery_conversation(uuid) to authenticated, service_role;
