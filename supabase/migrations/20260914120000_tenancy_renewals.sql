-- ============================================================================
-- tenancy_renewals
--
-- THE PROBLEM
--   A tenancy ends, `complete_ended_tenancies` frees the room, and the person
--   living in it has no way to keep it. They find out their room is on the
--   market by seeing it on the market.
--
-- WHY THIS IS NOT "JUST BOOK IT AGAIN"
--   `bookings_one_hold_per_room_idx` is unique on (room_id) where the status is
--   awaiting_payment or confirmed. A follow-on booking created while the
--   current tenancy is still confirmed violates it, so the obvious approach is
--   refused by the database.
--
--   The tempting fix - exclude renewal rows from that index - is wrong, and
--   subtly. A renewal row keeps its `renews` link for ever, so once it BECOMES
--   the live tenancy it would still be excluded, and a third booking could then
--   be taken on an occupied room. An index predicate must be immutable, so it
--   cannot say "excluded only while the predecessor is live". There is no
--   version of that idea that holds.
--
--   So a renewal is not a booking until it is one. It is a REQUEST, in its own
--   table, and the follow-on booking is created at the moment the old tenancy
--   completes - in the same transaction, so no other student can take the room
--   in between.
--
-- EITHER SIDE MAY START IT
--   A tenant asking to stay and a landlord asking them to stay are the same
--   arrangement, and refusing one direction would mean a landlord who wants to
--   keep a good tenant has to hope the tenant asks first. `initiated_by`
--   records which it was, and whoever did not start it is the one who answers.
--
-- A PENDING REQUEST HOLDS THE ROOM, FOR A WHILE
--   `renewal_hold_days` (14). If the other side has not answered by the lease
--   end, the sweep leaves the tenancy alone for that long rather than freeing
--   the room out from under a live negotiation. After it, the room lists - a
--   request nobody answered must not freeze a room for ever, and a landlord who
--   has stopped using Sync should not lose the room to silence.
--
-- SILENCE IS NOT CONSENT
--   Accepting creates a booking at `awaiting_payment`, which starts the normal
--   24-hour hold and requires payment like any other. Nobody is billed and no
--   room is committed because somebody did nothing.
--
-- THE RENT IS THE LISTING'S PRICE AT THE TIME, NOT LAST YEAR'S
--   The new booking carries no snapshot, so `quote_rent` prices it at payment
--   exactly as a fresh booking. Binding a landlord to an old price because the
--   tenant is a returning one is not something either party agreed to.
--
-- ROLLBACK
--   drop function if exists public.request_renewal(uuid);
--   drop function if exists public.respond_to_renewal(uuid, boolean);
--   drop table if exists public.renewal_requests;
--   restore complete_ended_tenancies from 20260913210000.
-- ============================================================================

create table if not exists public.renewal_requests (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings (id) on delete cascade,
  initiated_by text not null check (initiated_by in ('tenant', 'landlord')),
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'fulfilled')),
  -- The booking this turned into, once it was accepted and the old tenancy
  -- ended. Null until then, which is also how `fulfilled` is evidenced.
  booking_created uuid references public.bookings (id) on delete set null,
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One live request per tenancy. A declined or withdrawn one may be followed by
-- another - people change their minds - so the uniqueness is on the OPEN ones.
create unique index if not exists renewal_requests_one_open_idx
  on public.renewal_requests (booking_id)
  where status in ('pending', 'accepted');

create index if not exists renewal_requests_booking_idx
  on public.renewal_requests (booking_id, created_at desc);

comment on table public.renewal_requests is
  'A tenant or landlord asking to continue a tenancy. Becomes a booking only when the current one ends - see the header of 20260914120000 for why it cannot be a booking sooner.';

alter table public.renewal_requests enable row level security;

-- Both parties to the tenancy can see it; nobody else has any business
-- knowing whether somebody is trying to keep their room.
drop policy if exists "renewal_requests_parties" on public.renewal_requests;

create policy "renewal_requests_parties" on public.renewal_requests
  for select
  using (
    exists (
      select 1 from public.bookings b
        join public.hostels h on h.id = b.hostel_id
       where b.id = renewal_requests.booking_id
         and (select auth.uid()) in (b.student_id, h.landlord_id)
    )
  );

grant select on public.renewal_requests to authenticated;

revoke all on public.renewal_requests from anon;

-- Writes go through the two functions below, never directly: they are the only
-- things that know the timing rules.

insert into public.app_settings (key, value) values
  ('renewal_hold_days', '14'::jsonb),
  ('renewal_window_days', '60'::jsonb)
on conflict (key) do nothing;

-- ── Asking ──────────────────────────────────────────────────────────────────
create or replace function public.request_renewal(p_booking uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_b      public.bookings%rowtype;
  v_owner  uuid;
  v_hostel text;
  v_who    text;
  v_window integer := private.setting_int('renewal_window_days', 60);
  v_id     uuid;
begin
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'no such booking' using errcode = 'P0002';
  end if;

  select h.landlord_id, h.name into v_owner, v_hostel
    from public.hostels h where h.id = v_b.hostel_id;

  -- Whichever party is calling. Anybody else is refused outright.
  if (select auth.uid()) = v_b.student_id then
    v_who := 'tenant';
  elsif (select auth.uid()) = v_owner then
    v_who := 'landlord';
  else
    raise exception 'That tenancy is not yours' using errcode = '42501';
  end if;

  if v_b.status <> 'confirmed' then
    raise exception 'Only a live tenancy can be renewed.' using errcode = 'P0001';
  end if;
  if v_b.end_date is null then
    raise exception 'This tenancy has no end date yet.' using errcode = 'P0001';
  end if;

  -- Not a year out. Renewal is a decision about the term that is ending, and
  -- asking in month one is asking about a room nobody can price yet.
  if v_b.end_date > (current_date + make_interval(days => v_window)) then
    raise exception 'Renewal opens % days before the lease ends (% ).',
      v_window, to_char(v_b.end_date - v_window, 'FMDD FMMonth YYYY')
      using errcode = 'P0001';
  end if;

  insert into public.renewal_requests (booking_id, initiated_by)
  values (p_booking, v_who)
  -- The partial unique index refuses a second open request; say so in words
  -- rather than letting a constraint name reach anybody.
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'There is already an open renewal on this tenancy.' using errcode = 'P0001';
  end if;

  -- Told to the OTHER side - the one who has to answer.
  if v_who = 'tenant' then
    perform private.notify(
      v_owner, 'booking', 'Your tenant wants to stay',
      'They have asked to renew at ' || coalesce(v_hostel, 'your hostel') ||
      ' when the current term ends on ' || to_char(v_b.end_date, 'FMDD FMMonth YYYY') || '.',
      'tenants', null, p_booking, 'booking', 'landlord'
    );
  else
    perform private.notify(
      v_b.student_id, 'booking', 'Your landlord has offered you another term',
      'You can keep your room at ' || coalesce(v_hostel, 'your hostel') ||
      ' after ' || to_char(v_b.end_date, 'FMDD FMMonth YYYY') ||
      '. Accept it from your bookings; the rent is whatever the room is listed at then.',
      'bookings', null, p_booking, 'booking', 'student'
    );
  end if;

  return v_id;
end;
$fn$;

revoke all on function public.request_renewal(uuid) from public, anon;

grant execute on function public.request_renewal(uuid) to authenticated, service_role;

-- ── Answering ───────────────────────────────────────────────────────────────
create or replace function public.respond_to_renewal(p_booking uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_b      public.bookings%rowtype;
  v_r      public.renewal_requests%rowtype;
  v_owner  uuid;
  v_hostel text;
  v_who    text;
begin
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'no such booking' using errcode = 'P0002';
  end if;

  select * into v_r from public.renewal_requests
   where booking_id = p_booking and status = 'pending' for update;
  if not found then
    raise exception 'There is no renewal waiting on an answer.' using errcode = 'P0002';
  end if;

  select h.landlord_id, h.name into v_owner, v_hostel
    from public.hostels h where h.id = v_b.hostel_id;

  if (select auth.uid()) = v_b.student_id then
    v_who := 'tenant';
  elsif (select auth.uid()) = v_owner then
    v_who := 'landlord';
  else
    raise exception 'That tenancy is not yours' using errcode = '42501';
  end if;

  -- THE ANSWER COMES FROM THE OTHER SIDE. Whoever asked may withdraw, and that
  -- is a different verb: accepting your own request would commit the other
  -- party to a term they never agreed to.
  if v_who = v_r.initiated_by then
    if p_accept then
      raise exception 'You asked for this renewal - the other side has to accept it.'
        using errcode = 'P0001';
    end if;
    update public.renewal_requests
       set status = 'withdrawn', responded_at = now(), updated_at = now()
     where id = v_r.id;
    return 'withdrawn';
  end if;

  update public.renewal_requests
     set status       = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now(),
         updated_at   = now()
   where id = v_r.id;

  if p_accept then
    perform private.notify(
      case when v_who = 'tenant' then v_owner else v_b.student_id end,
      'booking', 'Renewal agreed',
      'The renewal for ' || coalesce(v_hostel, 'the hostel') ||
      ' is agreed. A new booking opens when the current term ends on ' ||
      to_char(v_b.end_date, 'FMDD FMMonth YYYY') || ', and the rent is due then.',
      'bookings', null, p_booking, 'booking', null
    );
  else
    perform private.notify(
      case when v_who = 'tenant' then v_owner else v_b.student_id end,
      'booking', 'Renewal declined',
      'The renewal for ' || coalesce(v_hostel, 'the hostel') ||
      ' will not go ahead. The tenancy ends as planned on ' ||
      to_char(v_b.end_date, 'FMDD FMMonth YYYY') || '.',
      'bookings', null, p_booking, 'booking', null
    );
  end if;

  return case when p_accept then 'accepted' else 'declined' end;
end;
$fn$;

revoke all on function public.respond_to_renewal(uuid, boolean) from public, anon;

grant execute on function public.respond_to_renewal(uuid, boolean) to authenticated, service_role;

-- ── The sweep learns about renewals ─────────────────────────────────────────
create or replace function public.complete_ended_tenancies(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row   record;
  v_hold  integer := private.setting_int('renewal_hold_days', 14);
  v_new   uuid;
  v_count integer := 0;
begin
  for v_row in
    select b.id, b.student_id, b.hostel_id, b.room_id, b.end_date, b.grace_until,
           h.landlord_id, h.name,
           r.id as renewal_id, r.status as renewal_status
      from public.bookings b
      join public.hostels h on h.id = b.hostel_id
      left join public.renewal_requests r
        on r.booking_id = b.id and r.status in ('pending', 'accepted')
     where b.status = 'confirmed'
       and coalesce(b.grace_until, b.end_date) < current_date
       -- A PENDING REQUEST HOLDS THE ROOM, BUT NOT FOR EVER. Past the hold
       -- window the room lists: nobody answering is not a reason to freeze a
       -- landlord's room indefinitely.
       and not (
         r.status = 'pending'
         and coalesce(b.grace_until, b.end_date) + make_interval(days => v_hold) >= current_date
       )
     order by coalesce(b.grace_until, b.end_date)
     limit greatest(1, p_limit)
  loop
    update public.bookings
       set status     = 'completed',
           updated_at = now()
     where id = v_row.id;

    /*
     * THE FOLLOW-ON BOOKING IS CREATED HERE, IN THE SAME TRANSACTION.
     *
     * This is the whole reason a renewal is a request rather than a booking:
     * the per-room unique index will not accept a second live booking, so the
     * new one can only exist once the old is completed - and if that happened
     * in a later statement, another student could take the room in the gap.
     *
     * It lands at `awaiting_payment`, which starts the normal 24h hold and
     * requires payment like any other booking. Accepting a renewal commits
     * nobody to anything until they pay. No price is carried over: `quote_rent`
     * prices it at payment, at whatever the room is listed for then.
     */
    if v_row.renewal_status = 'accepted' then
      insert into public.bookings (student_id, hostel_id, room_id, status, move_in)
      values (
        v_row.student_id, v_row.hostel_id, v_row.room_id, 'awaiting_payment',
        -- The day after the old term ends, so the two never overlap.
        (coalesce(v_row.grace_until, v_row.end_date) + 1)::date
      )
      returning id into v_new;

      update public.renewal_requests
         set status = 'fulfilled', booking_created = v_new, updated_at = now()
       where id = v_row.renewal_id;

      perform private.notify(
        v_row.student_id, 'booking', 'Your renewal is ready to pay',
        'Your new term at ' || coalesce(v_row.name, 'your hostel') ||
        ' is held for you. Pay within 24 hours to confirm it.',
        'bookings', null, v_new, 'booking', 'student'
      );
      perform private.notify(
        v_row.landlord_id, 'booking', 'A renewal is awaiting payment',
        'The renewed term at ' || coalesce(v_row.name, 'your hostel') ||
        ' is held for your returning tenant while they pay.',
        'tenants', null, v_new, 'booking', 'landlord'
      );
    else
      perform private.notify(
        v_row.student_id, 'booking', 'Your stay has ended',
        'Your tenancy at ' || coalesce(v_row.name, 'your hostel') ||
        ' ended on ' || to_char(coalesce(v_row.grace_until, v_row.end_date), 'FMDD FMMonth YYYY') ||
        '. Thanks for staying with us.',
        'bookings', null, v_row.id, 'booking', 'student'
      );
      perform private.notify(
        v_row.landlord_id, 'booking', 'A room is free again',
        coalesce(v_row.name, 'Your hostel') ||
        ' has a tenancy that has now ended, and the room is back on the market.',
        'tenants', null, v_row.id, 'booking', 'landlord'
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

revoke all on function public.complete_ended_tenancies(integer) from public, anon, authenticated;

grant execute on function public.complete_ended_tenancies(integer) to service_role;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $verify$
declare
  v_src text;
begin
  if to_regprocedure('public.request_renewal(uuid)') is null
     or to_regprocedure('public.respond_to_renewal(uuid, boolean)') is null then
    raise exception 'renewal functions missing';
  end if;

  -- One open request per tenancy, or two students could queue on one room.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'renewal_requests_one_open_idx'
  ) then
    raise exception 'renewal_requests_one_open_idx missing';
  end if;

  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'respond_to_renewal';

  -- You may not accept your own request. Without this either party could
  -- commit the other to a term they never agreed to.
  if position('the other side has to accept it' in v_src) = 0 then
    raise exception 'respond_to_renewal lets somebody accept their own request';
  end if;

  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'complete_ended_tenancies';

  -- The follow-on booking must be created in the SAME function as the
  -- completion, or another student can take the room in the gap.
  if position('insert into public.bookings' in v_src) = 0 then
    raise exception 'complete_ended_tenancies no longer creates the renewal booking';
  end if;

  -- And it must start unpaid. Silence, or an accepted renewal, must never
  -- produce a confirmed tenancy nobody paid for.
  if position('''awaiting_payment''' in v_src) = 0 then
    raise exception 'the renewal booking is not starting at awaiting_payment';
  end if;

  -- Grace is still honoured by the sweep.
  if position('coalesce(b.grace_until, b.end_date)' in v_src) = 0 then
    raise exception 'complete_ended_tenancies ignores granted grace';
  end if;

  -- And a pending request still holds the room.
  if position('renewal_hold_days' in v_src) = 0 then
    raise exception 'complete_ended_tenancies no longer holds the room for an open renewal';
  end if;
end;
$verify$;
