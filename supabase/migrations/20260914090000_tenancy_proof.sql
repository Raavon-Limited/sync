-- ============================================================================
-- tenancy_proof
--
-- WHY
--   A student needs to be able to prove where they live: to a porter, to a
--   parent paying the rent, to the school, to whoever is at the gate. Sync
--   holds every fact required - who paid, for which room, for which dates, and
--   that the landlord accepted them - and had no way to show any of it to
--   somebody who is not logged in.
--
-- THE CODE IS A CAPABILITY, AND IT LIVES IN `private`
--   Exactly as `private.vendor_card_codes` does, and for the reason that
--   migration sets out at length: a column on a table anon can read cannot be
--   protected by a column-level revoke, because a table-level grant is not
--   clawed back by one. In `private` there is no grant to revoke - client roles
--   have no access to the schema at all - and the definer functions below reach
--   it regardless.
--
--   128 unguessable bits via gen_random_uuid(), because pgcrypto is never
--   declared by this schema.
--
-- WHAT THE PUBLIC PAGE MAY SAY, AND WHAT IT MAY NOT
--   It answers one question: does this person hold this room, for these dates.
--   So: their name, the hostel, the room, the address, the dates, and whether
--   the landlord accepted. NOT their phone, NOT their email, NOT what they
--   paid. The rent is between the student, the landlord and Sync - a porter
--   checking a room does not need to know somebody's finances, and a proof that
--   discloses them is one people will refuse to show.
--
--   That is a deliberate departure from the receipt, which DOES itemise the
--   money and is only ever visible to the person who paid it.
--
-- ISSUED ON CONFIRMATION, NOT ON REQUEST
--   There is nothing to prove about a booking nobody has paid for. The trigger
--   fires when a booking reaches `confirmed`, which is the first moment the
--   tenancy is real.
--
-- ROLLBACK
--   drop trigger if exists bookings_issue_tenancy_code on public.bookings;
--   drop function if exists private.issue_tenancy_code();
--   drop function if exists public.tenancy_proof(text);
--   drop function if exists public.my_tenancy_code(uuid);
--   drop table if exists private.tenancy_codes;
-- ============================================================================

create table if not exists private.tenancy_codes (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  code       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  rotated_at timestamptz not null default now()
);

comment on table private.tenancy_codes is
  'Opaque address of a tenancy''s public proof page. A capability: possession of the code opens the page, so it never travels with a booking read.';

-- Every tenancy that is already confirmed gets one.
insert into private.tenancy_codes (booking_id)
select b.id from public.bookings b
 where b.status = 'confirmed'
on conflict (booking_id) do nothing;

create or replace function private.issue_tenancy_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.status = 'confirmed' then
    insert into private.tenancy_codes (booking_id)
    values (new.id)
    -- Re-confirming must not rotate the code: a proof already shown to a porter
    -- has to keep working.
    on conflict (booking_id) do nothing;
  end if;
  return new;
end;
$fn$;

drop trigger if exists bookings_issue_tenancy_code on public.bookings;
create trigger bookings_issue_tenancy_code
  after insert or update on public.bookings
  for each row execute function private.issue_tenancy_code();

-- ── The student fetches their own code, to draw the QR ───────────────────────
create or replace function public.my_tenancy_code(p_booking uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_code text;
begin
  select c.code into v_code
    from private.tenancy_codes c
    join public.bookings b on b.id = c.booking_id
   where c.booking_id = p_booking
     -- OWN BOOKING ONLY. Not the landlord's: the proof is the student's
     -- document to show or withhold, and a landlord who could pull the code
     -- could publish where a named person sleeps.
     and b.student_id = (select auth.uid());

  return v_code;
end;
$fn$;

revoke all on function public.my_tenancy_code(uuid) from public, anon;
grant execute on function public.my_tenancy_code(uuid) to authenticated, service_role;

-- ── Anybody holding the code can check the claim ────────────────────────────
create or replace function public.tenancy_proof(p_code text)
returns table (
  student_name  text,
  hostel_name   text,
  room_label    text,
  address       text,
  area          text,
  move_in       date,
  ends_on       date,
  is_current    boolean,
  landlord_name text,
  accepted_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    coalesce(sp.full_name, 'A Sync student'),
    h.name,
    r.label,
    h.address,
    h.area,
    b.move_in,
    -- Grace counts: a student the landlord let stay on is still living there,
    -- and a proof that says otherwise is wrong at the one moment it is used.
    coalesce(b.grace_until, b.end_date),
    b.status = 'confirmed'
      and (coalesce(b.grace_until, b.end_date) is null
           or coalesce(b.grace_until, b.end_date) >= current_date),
    lp.full_name,
    -- When the landlord accepted them. This is the consent the page attests to.
    b.locked_at
  from private.tenancy_codes c
  join public.bookings b  on b.id = c.booking_id
  join public.hostels  h  on h.id = b.hostel_id
  left join public.hostel_rooms r on r.id = b.room_id
  left join public.profiles sp on sp.id = b.student_id
  left join public.profiles lp on lp.id = h.landlord_id
  where c.code = p_code;
$fn$;

-- Anon deliberately: the page is for somebody standing at a door who has no
-- Sync account. The code is the access control.
revoke all on function public.tenancy_proof(text) from public;
grant execute on function public.tenancy_proof(text) to anon, authenticated, service_role;

comment on function public.tenancy_proof is
  'Public tenancy check, addressed by an unguessable code. Names, room and dates only - never contact details and never the rent.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $verify$
declare
  v_src text;
  v_cnt bigint;
begin
  if to_regprocedure('public.tenancy_proof(text)') is null then
    raise exception 'tenancy_proof missing';
  end if;

  -- The code table must be unreachable by client roles. This is the whole
  -- security model: if anon can list codes, every tenancy is public.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'private' and table_name = 'tenancy_codes'
       and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'private.tenancy_codes is readable by a client role';
  end if;

  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'tenancy_proof';

  -- What the page must NOT disclose. A proof that leaks a phone number or the
  -- rent is one people will refuse to show, which defeats it entirely.
  if position('phone' in v_src) > 0 or position('price_per_session' in v_src) > 0 then
    raise exception 'tenancy_proof is disclosing contact details or the rent';
  end if;

  -- And the one it must: a student on granted grace still lives there.
  if position('grace_until' in v_src) = 0 then
    raise exception 'tenancy_proof ignores granted grace, so it will read as expired';
  end if;

  -- my_tenancy_code must stay scoped to the student.
  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'my_tenancy_code';
  if position('auth.uid()' in v_src) = 0 then
    raise exception 'my_tenancy_code would hand a code to anybody who asked';
  end if;

  -- Every confirmed booking should now have a code.
  select count(*) into v_cnt
    from public.bookings b
    left join private.tenancy_codes c on c.booking_id = b.id
   where b.status = 'confirmed' and c.booking_id is null;
  if v_cnt > 0 then
    raise exception '% confirmed tenancies have no proof code', v_cnt;
  end if;
end;
$verify$;
