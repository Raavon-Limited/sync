-- ============================================================================
-- lease_grace
--
-- WHY
--   A lease ends on a date, and a student whose session has run out does not
--   become homeless on a Tuesday because a timestamp said so. Landlords already
--   do this informally; without somewhere to record it, the room shows as
--   available while somebody is still living in it, and the tenancy the two of
--   them agreed exists nowhere Sync can see.
--
-- IT EXTENDS `end_date`, IT DOES NOT REPLACE IT
--   `grace_until` is separate from `end_date` on purpose. The lease still ended
--   when it ended - that is what was paid for, and it is what the receipt says.
--   Grace is an allowance on top, granted by a named person at a known time,
--   and both dates need to survive so anybody looking later can tell a paid
--   tenancy from a favour.
--
-- THREE MONTHS, AND THE CAP IS THE DATABASE'S
--   `max_grace_months` (3) in app_settings. A cap enforced only by a date
--   picker is not a cap: it is a suggestion to whoever next writes a form. Past
--   three months this is not grace, it is an unpaid tenancy, and it should go
--   through a new booking that takes rent.
--
-- ONLY THE LANDLORD OF THAT PROPERTY, AND ONLY FORWARD
--   Grace can be extended and it can be revoked back to today, but it can never
--   be set into the past to make somebody retroactively overstaying.
--
-- ROLLBACK
--   drop function if exists public.grant_lease_grace(uuid, date);
--   alter table public.bookings drop column if exists grace_until,
--     drop column if exists grace_granted_by, drop column if exists grace_granted_at;
-- ============================================================================

alter table public.bookings
  add column if not exists grace_until      date,
  add column if not exists grace_granted_by uuid references public.profiles (id) on delete set null,
  add column if not exists grace_granted_at timestamptz;

comment on column public.bookings.grace_until is
  'Landlord-granted extension beyond end_date. The lease still ENDED on end_date; this records the allowance on top of it.';

insert into public.app_settings (key, value) values
  ('max_grace_months', '3'::jsonb)
on conflict (key) do nothing;

create or replace function public.grant_lease_grace(p_booking uuid, p_until date)
returns date
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_b     public.bookings%rowtype;
  v_owner uuid;
  v_max   integer := private.setting_int('max_grace_months', 3);
  v_limit date;
begin
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'no such booking' using errcode = 'P0002';
  end if;

  select h.landlord_id into v_owner from public.hostels h where h.id = v_b.hostel_id;
  if v_owner is distinct from (select auth.uid()) then
    raise exception 'That booking is not on one of your properties' using errcode = '42501';
  end if;

  if v_b.end_date is null then
    raise exception 'This tenancy has no end date yet, so there is nothing to extend.'
      using errcode = 'P0001';
  end if;

  -- Grace is for a tenancy that was actually paid for.
  if v_b.paid_at is null then
    raise exception 'Grace is for a paid tenancy. This one has not been paid for.'
      using errcode = 'P0001';
  end if;

  -- Never backwards. Revoking means setting it to today, not to last month.
  if p_until < current_date then
    raise exception 'Grace cannot be set in the past.' using errcode = '22023';
  end if;

  -- THE CAP, measured from the date the lease actually ended.
  v_limit := (v_b.end_date + make_interval(months => v_max))::date;
  if p_until > v_limit then
    raise exception 'Grace runs to at most % (% months after the lease ended on %). Longer than that needs a new booking.',
      to_char(v_limit, 'FMDD FMMonth YYYY'), v_max, to_char(v_b.end_date, 'FMDD FMMonth YYYY')
      using errcode = 'P0001';
  end if;

  update public.bookings
     set grace_until      = p_until,
         grace_granted_by = (select auth.uid()),
         grace_granted_at = now(),
         updated_at       = now()
   where id = p_booking;

  perform private.notify(
    v_b.student_id, 'booking', 'Your landlord extended your stay',
    'You can stay on until ' || to_char(p_until, 'FMDD FMMonth YYYY') ||
    '. This is an extension on top of your lease, not a new one - talk to your landlord about renewing properly.',
    'bookings', null, v_b.id, 'booking', 'student'
  );

  return p_until;
end;
$fn$;

revoke all on function public.grant_lease_grace(uuid, date) from public, anon;

grant execute on function public.grant_lease_grace(uuid, date) to authenticated, service_role;

comment on function public.grant_lease_grace is
  'Landlord lets a tenant stay past end_date, capped at max_grace_months (3). Does not move end_date - the lease still ended when it ended.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $verify$
declare
  v_src text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'bookings' and column_name = 'grace_until'
  ) then
    raise exception 'bookings.grace_until missing';
  end if;

  if private.setting_int('max_grace_months', 0) <> 3 then
    raise exception 'max_grace_months is not 3';
  end if;

  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'grant_lease_grace';

  -- The two rules that make this safe, asserted rather than assumed. A rewrite
  -- that drops either still looks like a working function.
  if position('not on one of your properties' in v_src) = 0 then
    raise exception 'grant_lease_grace no longer checks that the caller owns the hostel';
  end if;
  if position('max_grace_months' in v_src) = 0 then
    raise exception 'grant_lease_grace no longer caps the extension';
  end if;

  -- end_date must NOT be written by this function - the lease ended when it
  -- ended, and rewriting it would erase what was paid for.
  if position('set end_date' in v_src) > 0 or position('end_date      =' in v_src) > 0 then
    raise exception 'grant_lease_grace is moving end_date instead of recording grace';
  end if;
end;
$verify$;
