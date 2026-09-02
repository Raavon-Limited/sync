-- ============================================================================
-- student_profiles
--
-- A student's identity and their own verification status, in their own row.
--
-- THE BUG THIS EXISTS TO PREVENT
--   Since 20260830090000 one account can hold several roles. Verification is
--   per ROLE, not per person: being a checked landlord says nothing about
--   whether you are a student at this school, and the documents are not even
--   the same ones.
--
--   Until now a student's status lived in `profiles.verification_status`. That
--   column is a MIRROR of `vendor_profiles`, maintained by an unconditional
--   trigger (20260901100000). So for somebody who is both a student and a
--   vendor:
--
--     1. a reviewer verifies them as a student   profiles says 'verified'
--     2. a reviewer later rejects their business  the mirror trigger fires
--     3. profiles now says 'rejected', and the student verification is gone
--
--   Nobody did anything wrong and there is no error anywhere. 20260901100000
--   already called this out for riders and gave them their own table. This is
--   the same fix for students, and it is why `set_personal_verification` must
--   not write profiles for a role that can co-exist with a business.
--
-- WHAT A STUDENT IS ASKED FOR, AND WHY IT IS NOT A BUSINESS'S LIST
--   A student has no CAC certificate and no business address. What actually
--   establishes that somebody studies here is a school ID, a matriculation
--   number and a department   which is data, not just documents, so it lives
--   on this row beside the status it supports.
--
--   The live photo and the government ID stay SHARED: they identify the
--   person, and a person is the same person in every role. Only the
--   role-specific evidence is separate, which is exactly the distinction
--   requirementsFor() already draws.
--
-- WRITTEN ONLY THROUGH FUNCTIONS
--   There is no update policy on this table at all. Postgres has no
--   column-level RLS, so a policy letting a student edit their department
--   would also let them edit their verification_status. The identity columns
--   go through save_student_identity; the status goes through the two
--   functions below and nowhere else.
--
-- ROLLBACK
--   drop function if exists public.set_student_verification(uuid, text);
--   drop function if exists public.submit_student_verification();
--   drop function if exists public.save_student_identity(text, text, text);
--   drop function if exists public.ensure_student_profile();
--   drop table if exists public.student_profiles;
-- ============================================================================

create table if not exists public.student_profiles (
  id                  uuid primary key references public.profiles (id) on delete cascade,
  -- The three things that make somebody a student HERE rather than a person
  -- with a school ID from somewhere.
  matric_number       text,
  department          text,
  level               text,
  verification_status text not null default 'unverified'
                        check (verification_status in
                               ('unverified', 'pending', 'verified', 'rejected')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.student_profiles is
  'A student''s identity and their own verification status. Separate from profiles.verification_status, which is the mirror of vendor_profiles - one account can be both and the two decisions are independent.';

-- One student per campus cannot share a matric number. Partial, because the
-- column is null until they fill it in and nulls must not collide.
create unique index if not exists student_profiles_matric_idx
  on public.student_profiles (lower(matric_number))
  where matric_number is not null;

-- === Ensuring the row =======================================================
create or replace function public.ensure_student_profile()
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.student_profiles (id)
  values (v_uid)
  on conflict (id) do nothing;

  return v_uid;
end;
$fn$;

revoke all on function public.ensure_student_profile() from public, anon;
grant execute on function public.ensure_student_profile() to authenticated, service_role;

-- === The student writes their own identity ==================================
create or replace function public.save_student_identity(
  p_matric     text,
  p_department text,
  p_level      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if coalesce(btrim(p_matric), '') = '' then
    raise exception 'Your matriculation number is needed' using errcode = '22023';
  end if;
  if coalesce(btrim(p_department), '') = '' then
    raise exception 'Your department is needed' using errcode = '22023';
  end if;

  perform public.ensure_student_profile();

  -- NOT verification_status. Editing your own department must never move you
  -- back into, or out of, a queue.
  update public.student_profiles
     set matric_number = btrim(p_matric),
         department    = btrim(p_department),
         level         = nullif(btrim(coalesce(p_level, '')), ''),
         updated_at    = now()
   where id = v_uid;
end;
$fn$;

revoke all on function public.save_student_identity(text, text, text) from public, anon;
grant execute on function public.save_student_identity(text, text, text) to authenticated, service_role;

-- === Submitting ==============================================================
-- Replaces the profiles-writing version from 20260903120000 for students.
create or replace function public.submit_student_verification()
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_status text;
  v_matric text;
  v_dept   text;
  v_docs   integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Holding the role is what matters, not currently wearing it: somebody
  -- switched to their vendor hat is still a student and may still submit.
  if not exists (
    select 1 from public.profiles
     where id = v_uid
       and ('student' = any (coalesce(roles, array[]::text[])) or role = 'student')
  ) then
    raise exception 'This account is not a student' using errcode = '42501';
  end if;

  perform public.ensure_student_profile();

  select verification_status, matric_number, department
    into v_status, v_matric, v_dept
    from public.student_profiles
   where id = v_uid
     for update;

  if v_status = 'verified' then
    raise exception 'You are already verified as a student' using errcode = 'P0001';
  end if;

  if coalesce(v_matric, '') = '' or coalesce(v_dept, '') = '' then
    raise exception 'Add your matriculation number and department before submitting'
      using errcode = 'P0001';
  end if;

  -- The school ID is the one document only a student is asked for, so it is
  -- the one this insists on. The shared live photo and government ID are
  -- checked by requirementsFor on the way in.
  select count(*) into v_docs
    from public.verification_documents
   where owner_id = v_uid
     and doc_type = 'student_id';

  if v_docs = 0 then
    raise exception 'Upload your school ID before submitting' using errcode = 'P0001';
  end if;

  update public.student_profiles
     set verification_status = 'pending', updated_at = now()
   where id = v_uid;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'student', 'verification.submitted', 'student_profile', v_uid::text,
          jsonb_build_object('status', v_status),
          jsonb_build_object('status', 'pending'));

  return 'pending';
end;
$fn$;

revoke all on function public.submit_student_verification() from public, anon;
grant execute on function public.submit_student_verification() to authenticated, service_role;

-- === Deciding ================================================================
create or replace function public.set_student_verification(p_user uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_old text;
begin
  if not public.is_staff() then
    raise exception 'Only staff can decide a verification' using errcode = '42501';
  end if;

  if p_status not in ('verified', 'rejected', 'pending', 'unverified') then
    raise exception 'Unknown status: %', p_status using errcode = '22023';
  end if;

  insert into public.student_profiles (id) values (p_user) on conflict (id) do nothing;

  select verification_status into v_old
    from public.student_profiles where id = p_user for update;

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

-- === RLS ====================================================================
alter table public.student_profiles enable row level security;

-- Readable by the student themselves and by staff. NO write policy: every
-- write goes through a function above, for the column-level reason in the
-- header.
drop policy if exists "student_profiles_read" on public.student_profiles;
create policy "student_profiles_read" on public.student_profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());

revoke all on public.student_profiles from anon;
grant select on public.student_profiles to authenticated;

-- === Backfill ===============================================================
-- Everyone who already holds the role gets a row, carrying across whatever
-- profiles said about them. Without this, an existing verified student would
-- appear unverified the moment the app starts reading this table.
insert into public.student_profiles (id, verification_status)
select p.id,
       case when p.verification_status in ('unverified', 'pending', 'verified', 'rejected')
            then p.verification_status else 'unverified' end
  from public.profiles p
 where p.role = 'student'
    or 'student' = any (coalesce(p.roles, array[]::text[]))
on conflict (id) do nothing;

-- === Verify =================================================================
do $$
begin
  if to_regclass('public.student_profiles') is null then
    raise exception 'student_profiles missing';
  end if;
  if to_regprocedure('public.set_student_verification(uuid, text)') is null then
    raise exception 'set_student_verification missing';
  end if;
  if to_regprocedure('public.save_student_identity(text, text, text)') is null then
    raise exception 'save_student_identity missing';
  end if;

  -- The whole point: no policy may let a client write this table directly.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'student_profiles' and cmd <> 'SELECT'
  ) then
    raise exception 'student_profiles has a write policy - status would be client-writable';
  end if;
end $$;
