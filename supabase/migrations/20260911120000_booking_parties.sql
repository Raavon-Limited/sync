-- ============================================================================
-- booking_parties
--
-- A landlord could not see the name of anyone booking their rooms.
--
-- WHAT WAS ACTUALLY HAPPENING
--   `bookingsFor` embeds `student:profiles(full_name, phone, campus_other,
--   verification_status)`. `profiles` is locked to the caller's own row -
--   `profiles_select_own` is `auth.uid() = id` and there has never been a
--   policy letting a landlord read a tenant. PostgREST does not error on an
--   embed RLS refuses; it returns NULL. So every request rendered as
--   "A student", every tenant had no email or phone, and the code carried a
--   comment stating the opposite - "RLS lets a landlord read the profile for
--   somebody booked into their own hostel" - describing a policy nobody wrote.
--
--   The verification badge was worse than blank. `studentVerified` reads
--   `verification_status = 'verified'` off that same NULL embed, so it was
--   false for everyone and every request showed NOT VERIFIED. A landlord
--   deciding whether to hand a stranger the keys was being told, with
--   confidence, something we had not checked.
--
-- WHY AN RPC AND NOT A POLICY ON `profiles`
--   RLS is row-level. A policy admitting a landlord to a student's profile row
--   admits them to the WHOLE row - roles, suspension fields, campus, phone,
--   every column added later - because `select` grants are per-table, not per
--   query. This function returns four columns and can never widen by accident.
--
--   It is also the pattern the codebase already chose for exactly this problem:
--   `conversation_counterparties` (20260820170000) exists because the inbox hit
--   the same wall and every thread was titled "Conversation". Same shape here.
--
-- WHAT IS DISCLOSED, AND TO WHOM
--   Only for bookings on hostels the caller owns. Name and verification status
--   are what the decision needs. Phone and email follow the booking's own
--   status: withheld while it is merely `requested`, released once the landlord
--   has accepted, because a landlord who has taken somebody on needs to reach
--   them and a landlord still deciding does not. Declining therefore discloses
--   nothing, which is the point.
-- ============================================================================

create or replace function public.booking_parties(p_booking_ids uuid[] default null)
returns table (
  booking_id          uuid,
  student_id          uuid,
  full_name           text,
  verification_status text,
  phone               text,
  campus              text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    b.id,
    b.student_id,
    p.full_name,
    p.verification_status,
    -- Contact details only once the landlord has actually taken them on. A
    -- pending request is a stranger's phone number.
    -- NO EMAIL COLUMN IS RETURNED because `profiles` does not have one - it
    -- lives on auth.users, which is why modules/admin/emails.ts goes through
    -- the admin API for it. The tenants screen has been reading
    -- `student.email` off this row and rendering an empty string for every
    -- tenant since it was written; that is a separate bug from the RLS one and
    -- is not fixed by inventing a column here.
    case when b.status = 'requested' then null else p.phone end,
    case when b.status = 'requested' then null else p.campus_other end
  from public.bookings b
  join public.hostels  h on h.id = b.hostel_id
  join public.profiles p on p.id = b.student_id
  where h.landlord_id = (select auth.uid())
    and (p_booking_ids is null or b.id = any (p_booking_ids));
$fn$;

comment on function public.booking_parties(uuid[]) is
  'Display fields for the students on a landlord''s own bookings. Exists because profiles is locked to the caller''s own row, so the `student:profiles(...)` embed silently returns NULL. Returns four safe columns rather than opening the profile row - contact details only once the request has been accepted.';

revoke all on function public.booking_parties(uuid[]) from public, anon;
grant execute on function public.booking_parties(uuid[]) to authenticated, service_role;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc where proname = 'booking_parties' limit 1;
  if v_src is null then
    raise exception 'booking_parties is missing';
  end if;

  -- The ownership predicate is the whole security model. Without it this
  -- function hands every student's name and phone to any signed-in caller.
  if position('landlord_id' in v_src) = 0 then
    raise exception 'booking_parties does not scope to the caller''s own hostels';
  end if;

  if has_function_privilege('anon', 'public.booking_parties(uuid[])', 'execute') then
    raise exception 'anon can execute booking_parties';
  end if;
end $$;
