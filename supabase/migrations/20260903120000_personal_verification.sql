-- ============================================================================
-- personal_verification
--
-- Letting an account with NO authority table submit itself for review   today
-- a student, tomorrow a content creator or an event manager.
--
-- WHY submit_verification() CANNOT BE USED
--   That function is business-only, and not by accident: it calls
--   `ensure_vendor_profile()` and writes `vendor_profiles.verification_status`.
--   A student calling it would be handed a vendor_profiles row they never
--   asked for   and since profiles.role is kept in step with vendor category
--   by trigger (20260828090000), creating that row for a student is how a
--   student quietly becomes a business.
--
-- WHERE THE AUTHORITY LIVES FOR A STUDENT
--   20260901100000 set the rule that `vendor_profiles.verification_status` is
--   the authority and `profiles.verification_status` is a mirror. That rule
--   exists BECAUSE a business has an authority table. A student has none  
--   there is no student_profiles   so for a student the profiles column is not
--   a mirror of anything; it is the only record there is, and therefore the
--   authority.
--
--   This function is the single writer of it. Nothing else may move that
--   column for a student, exactly as nothing may hand-write the mirror for a
--   business.
--
-- WHY IT IS SECURITY DEFINER
--   `guard_profile_privileged_cols` reverts verification_status for anybody
--   connecting as `authenticated` or `anon`, which is every PostgREST request
--   including the service role. Same reason set_account_role is a function
--   rather than an update: the guard is doing its job, and the way past it is
--   a definer function that states its own rules.
--
-- IT CANNOT SET 'verified'
--   Only 'pending', and only from a state that is not already verified. A
--   person submitting themselves for review must never be able to approve
--   themselves; that decision is a reviewer's and arrives through
--   setAccountSuspension / the admin queue.
--
-- ROLLBACK
--   drop function if exists public.submit_personal_verification();
-- ============================================================================

create or replace function public.submit_personal_verification()
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_role   text;
  v_status text;
  v_docs   integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select role, verification_status
    into v_role, v_status
    from public.profiles
   where id = v_uid
     for update;

  if not found then
    raise exception 'no profile' using errcode = 'P0002';
  end if;

  -- EVERY ROLE THAT HAS NO AUTHORITY TABLE, not only students.
  --
  -- A vendor or landlord has a vendor_profiles row and a rider has a
  -- rider_profiles row; those are the authority for their status and they go
  -- through their own path, or the two records would disagree about the same
  -- person. Everyone else keeps their status in profiles alone, so this is the
  -- one writer of it.
  --
  -- 'creator' and 'event_manager' cannot sign up yet   /signup shows them as
  -- "Not yet". They are listed now so that opening the role is a change to the
  -- signup form and nothing else; a role that arrives here unlisted would be
  -- refused at the last step of its own onboarding.
  if v_role is null or v_role not in ('student', 'creator', 'event_manager') then
    raise exception 'This account verifies through its own dashboard'
      using errcode = '42501';
  end if;

  if v_status = 'verified' then
    raise exception 'You are already verified' using errcode = 'P0001';
  end if;

  -- SOMETHING HAS TO HAVE BEEN UPLOADED. Without this the button moves the
  -- status on its own, and the review queue fills with empty folders that a
  -- reviewer can only bounce   which teaches students that submitting does
  -- nothing. requirementsFor('student') asks for a live photo and a
  -- government ID; the count is deliberately not two, because a reviewer
  -- bouncing one document should not force a re-upload of both.
  select count(*) into v_docs
    from public.verification_documents
   where owner_id = v_uid;

  if v_docs = 0 then
    raise exception 'Upload your photo and ID before submitting'
      using errcode = 'P0001';
  end if;

  update public.profiles
     set verification_status = 'pending',
         updated_at          = now()
   where id = v_uid;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'student', 'verification.submitted', 'profile', v_uid::text,
          jsonb_build_object('status', v_status),
          jsonb_build_object('status', 'pending'));

  return 'pending';
end;
$fn$;

revoke all on function public.submit_personal_verification() from public, anon;
grant execute on function public.submit_personal_verification() to authenticated, service_role;

comment on function public.submit_personal_verification() is
  'Put the caller into the review queue. For a role with no authority table (student, creator, event_manager) profiles.verification_status IS the authority rather than a mirror. Businesses and riders use their own path. Cannot set verified.';

-- === Verify =================================================================
do $$
begin
  if to_regprocedure('public.submit_personal_verification()') is null then
    raise exception 'submit_personal_verification missing';
  end if;

  if has_function_privilege('anon', 'public.submit_personal_verification()', 'execute') then
    raise exception 'submit_personal_verification is executable by anon -- it must not be';
  end if;
end $$;
