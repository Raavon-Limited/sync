-- ============================================================================
-- booking_conduct_revoke_anon
--
-- `booking_conduct` answered an anonymous PostgREST read with 200 and an empty
-- array. `bookings`, asked the same way, answers 42501. The difference is a
-- table GRANT: new tables pick one up from the schema's default privileges, so
-- the conduct table was reachable and relying on its RLS policy alone to come
-- back empty.
--
-- THAT IS ONE CONTROL WHERE THERE SHOULD BE TWO, and this table is the wrong
-- place to run thin. Its entire purpose is to hold a flag the flagged person
-- must not discover - a soft flag they learn about is a flag that teaches them
-- to game the board differently. A single dropped or mis-widened policy in some
-- future migration is all it would take, and the failure is silent: it looks
-- exactly like a working query returning rows.
--
-- So anon loses the grant outright and is refused at the privilege layer,
-- before any policy is consulted.
--
-- `authenticated` KEEPS THE GRANT, deliberately. Staff read this table through
-- PostgREST as `authenticated`, so revoking it there would not harden anything
-- - it would break the admin view and leave the policy enforcing nothing. RLS
-- (`booking_conduct_staff_read`, staff-only) is what separates a reviewer from
-- a student inside that role, which is exactly the job RLS is for.
-- ============================================================================

revoke all on table public.booking_conduct from anon;

comment on table public.booking_conduct is
  'Per-student booking behaviour. NOT readable by the student: the flag is deliberately silent. anon has no grant at all; authenticated has one because staff read through it, and RLS (staff-only) is what filters within that role. Do not grant this to anon.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if has_table_privilege('anon', 'public.booking_conduct', 'select') then
    raise exception 'anon can still select booking_conduct';
  end if;

  -- The other half: revoking too much would silently break the admin screen,
  -- and an empty staff view looks like "no flagged students" rather than a
  -- permissions error.
  if not has_table_privilege('authenticated', 'public.booking_conduct', 'select') then
    raise exception 'authenticated lost its grant - staff cannot read conduct at all';
  end if;
end $$;
