-- ============================================================================
-- student_verify_needs_identity
--
-- A student was verified with MATRIC NUMBER, DEPARTMENT and LEVEL all reading
-- "Not given". Four approved documents, a green VERIFIED badge, and nothing on
-- the row saying who they are at their school.
--
-- WHY THAT IS NOT A COSMETIC PROBLEM
--   The school ID is only evidence if it can be read against something. A
--   reviewer looking at a card with a matric number on it, beside a profile
--   with no matric number, has checked that a card exists   not that it belongs
--   to this account. The identity fields are the thing the document is compared
--   TO, so approving the document without them is approving half a check.
--
--   It also breaks everything downstream that assumes a verified student has a
--   school: a landlord seeing "verified student" is being told this person
--   studies here, and the platform cannot say where.
--
-- SAME SHAPE AS 20260901260000
--   That migration stopped a vendor being verified with no approved documents,
--   in the database rather than in the button, because the button is not the
--   only way in   the server action is callable directly and the console is not
--   the only client we will ever have. This is the same rule for the other half
--   of a student's evidence.
--
--   Only 'verified' is gated. Rejecting, bouncing back to pending or resetting
--   to unverified must all stay possible on an incomplete profile   those are
--   precisely the decisions a reviewer makes ABOUT an incomplete profile.
--
-- LEVEL IS NOT REQUIRED
--   Matric number and department are what a school ID carries and what a
--   reviewer compares. Level changes every year, is on few cards, and refusing
--   an otherwise complete submission over it would be inventing a requirement
--   the reviewer cannot check anyway.
--
-- ROLLBACK
--   Re-run the set_student_verification block of 20260903180000.
-- ============================================================================

create or replace function public.set_student_verification(p_user uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_old     text;
  v_matric  text;
  v_dept    text;
begin
  if not public.is_staff() then
    raise exception 'Only staff can decide a verification' using errcode = '42501';
  end if;

  if p_status not in ('verified', 'rejected', 'pending', 'unverified') then
    raise exception 'Unknown status: %', p_status using errcode = '22023';
  end if;

  insert into public.student_profiles (id) values (p_user) on conflict (id) do nothing;

  select verification_status, nullif(btrim(matric_number), ''), nullif(btrim(department), '')
    into v_old, v_matric, v_dept
    from public.student_profiles where id = p_user for update;

  -- The message names both fields and says who has to supply them, because it
  -- is read by a reviewer who cannot fix it themselves   the student fills
  -- these in from their own settings.
  if p_status = 'verified' and (v_matric is null or v_dept is null) then
    raise exception
      'This student has not given their matric number and department yet, so there is nothing to check the school ID against. Ask them to fill those in before verifying.'
      using errcode = '23514';
  end if;

  update public.student_profiles
     set verification_status = p_status, updated_at = now()
   where id = p_user;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values ((select auth.uid()), 'staff', 'verification.decided', 'student_profile', p_user::text,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status));

  return p_status;
end;
$fn$;

revoke all on function public.set_student_verification(uuid, text) from public, anon;
grant execute on function public.set_student_verification(uuid, text) to authenticated, service_role;

comment on function public.set_student_verification(uuid, text) is
  'Staff-only student verification decision. Refuses to VERIFY a student whose matric number or department is missing - the school ID has nothing to be checked against.';
