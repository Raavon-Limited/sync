-- ============================================================================
-- notification_producers
--
-- public.notifications has existed since 20260817090400 and NOTHING has ever
-- written to it. No trigger, no RPC, no app-side insert — and `authenticated`
-- holds only select+update, which is correct: a notification a client can forge
-- is not a notification. The result is an inbox that is permanently empty and a
-- bell that can never light up.
--
-- This adds the producers for the four events that actually matter, each one
-- mapping to a `kind` the table already permits.
--
-- RULES THESE TRIGGERS FOLLOW
--   * Never notify the actor about their own action. A student who advances
--     their own booking does not need telling; the person on the other side
--     does. `auth.uid()` is the actor, and it is skipped.
--   * Only on CHANGE, never on every write. Order and booking rows are updated
--     for many reasons; only a status transition is worth an alert.
--   * SECURITY DEFINER, because `authenticated` cannot insert here by design.
--   * Failure to notify must never fail the underlying write. A broken alert is
--     an annoyance; a rolled-back order is a lost sale. Every producer is
--     wrapped so an exception is swallowed.
--
-- ROLLBACK
--   drop trigger if exists messages_notify   on public.messages;
--   drop trigger if exists orders_notify     on public.orders;
--   drop trigger if exists bookings_notify   on public.bookings;
--   drop trigger if exists deliveries_notify on public.deliveries;
--   drop function if exists private.notify(uuid, text, text, text, text, text, uuid, text);
--   drop function if exists private.notify_new_message();
--   drop function if exists private.notify_order_status();
--   drop function if exists private.notify_booking_status();
--   drop function if exists private.notify_delivery_status();
-- ============================================================================

-- 1. One insert helper -------------------------------------------------------
create or replace function private.notify(
  p_user_id     uuid,
  p_kind        text,
  p_title       text,
  p_body        text,
  p_href        text default null,
  p_action      text default null,
  p_entity_id   uuid default null,
  p_entity_type text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Nobody to tell, or the actor telling themselves.
  if p_user_id is null or p_user_id = (select auth.uid()) then
    return;
  end if;

  insert into public.notifications (user_id, kind, title, body, href, action, entity_type, entity_id)
  values (p_user_id, p_kind, p_title, p_body, p_href, p_action, p_entity_type, p_entity_id);
exception
  when others then
    -- See the header: an alert must never take down the write that caused it.
    raise warning 'notify failed for % (%): %', p_user_id, p_kind, sqlerrm;
end;
$fn$;
-- 2. New message -> every other participant -----------------------------------
create or replace function private.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row record;
  v_preview text;
begin
  -- System messages narrate status changes that already have their own alert.
  if new.kind = 'system' then
    return new;
  end if;

  v_preview := left(coalesce(new.body, '[attachment]'), 140);

  for v_row in
    select cp.user_id
      from public.conversation_participants cp
     where cp.conversation_id = new.conversation_id
       and cp.user_id is distinct from new.sender_id
       and not cp.muted
  loop
    perform private.notify(
      v_row.user_id, 'message', 'New message', v_preview,
      'messages', 'chat', new.conversation_id, 'conversation'
    );
  end loop;

  return new;
end;
$fn$;
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function private.notify_new_message();
-- 3. Order status -> the student ----------------------------------------------
create or replace function private.notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_label text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_label := case new.status
    when 'preparing'   then 'Your order is being prepared'
    when 'picked_up'   then 'Your order has been picked up'
    when 'on_the_way'  then 'Your order is on the way'
    when 'delivered'   then 'Your order was delivered'
    when 'cancelled'   then 'Your order was cancelled'
    else 'Your order was updated'
  end;

  perform private.notify(
    new.student_id, 'order', v_label,
    'Order ' || upper(left(new.id::text, 8)) || ' is now ' || replace(new.status, '_', ' ') || '.',
    'orders', null, new.id, 'order'
  );
  return new;
end;
$fn$;
drop trigger if exists orders_notify on public.orders;
create trigger orders_notify
  after update on public.orders
  for each row execute function private.notify_order_status();
-- 4. Booking status -> the student, and the landlord on a new request ---------
create or replace function private.notify_booking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_landlord uuid;
  v_hostel   text;
begin
  select h.landlord_id, h.name into v_landlord, v_hostel
    from public.hostels h where h.id = new.hostel_id;

  -- A brand new request is news for the LANDLORD, not the student who sent it.
  if tg_op = 'INSERT' then
    perform private.notify(
      v_landlord, 'booking', 'New booking request',
      'A student requested ' || coalesce(v_hostel, 'your hostel') || '.',
      'bookings', null, new.id, 'booking'
    );
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Both sides care about a transition, and notify() drops whichever of them
  -- caused it.
  perform private.notify(
    new.student_id, 'booking', 'Booking ' || replace(new.status, '_', ' '),
    coalesce(v_hostel, 'Your booking') || ' is now ' || replace(new.status, '_', ' ') || '.',
    'bookings', null, new.id, 'booking'
  );
  perform private.notify(
    v_landlord, 'booking', 'Booking ' || replace(new.status, '_', ' '),
    coalesce(v_hostel, 'A booking') || ' is now ' || replace(new.status, '_', ' ') || '.',
    'bookings', null, new.id, 'booking'
  );
  return new;
end;
$fn$;
drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify
  after insert or update on public.bookings
  for each row execute function private.notify_booking_status();
-- 5. Delivery status -> the student -------------------------------------------
create or replace function private.notify_delivery_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_student uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select o.student_id into v_student from public.orders o where o.id = new.order_id;

  perform private.notify(
    v_student, 'delivery', 'Delivery ' || replace(new.status, '_', ' '),
    'Your delivery is now ' || replace(new.status, '_', ' ') || '.',
    'orders', null, new.order_id, 'delivery'
  );
  return new;
end;
$fn$;
drop trigger if exists deliveries_notify on public.deliveries;
create trigger deliveries_notify
  after update on public.deliveries
  for each row execute function private.notify_delivery_status();
