-- ============================================================================
-- rider_submits_verification
--
-- A rider had no way to ask to be reviewed.
--
-- `submit_verification` (20260901260000) writes vendor_profiles and nothing
-- else, and `guard_rider_profile_cols` freezes rider_profiles.verification_status
-- against anyone connecting as 'authenticated' — which is every PostgREST
-- request. So a rider could upload a licence and a live photo and stay
-- 'unverified' forever, with no row in any queue and nothing to tell them why.
-- The admin screens built in the last two migrations would have listed nobody.
--
-- The same applies to a logistics company: its owner can create the row, but the
-- status column is staff-decided, so it needs the same door.
--
-- WHY IT REFUSES AN EMPTY FOLDER
--   Same reasoning as the vendor version. A submission with nothing attached
--   costs a reviewer a click to find that out, and the person who sent it is
--   waiting on a decision that cannot be made. Better to say so at the moment
--   they press the button, when the fix is still in front of them.
--
-- WHY A BLOCKED ACCOUNT CANNOT RE-SUBMIT
--   verification_blocked_at means a reviewer found fraud. Letting that account
--   back into the queue is the exact loop the block exists to end.
--
-- ROLLBACK
--   drop function if exists public.submit_rider_verification();
--   drop function if exists public.submit_company_verification(uuid);
-- ============================================================================

create or replace function public.submit_rider_verification()
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := (select auth.uid());
  v_rp      public.rider_profiles%rowtype;
  v_docs    integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_rp from public.rider_profiles where id = v_uid for update;
  if not found then
    raise exception 'Finish setting up your rider profile first' using errcode = 'P0002';
  end if;

  if v_rp.verification_blocked_at is not null then
    raise exception '%', coalesce(
      v_rp.verification_blocked_reason,
      'This account cannot be verified. Contact support@letsyncyou.com.'
    ) using errcode = '42501';
  end if;

  if v_rp.verification_status = 'verified' then
    -- Idempotent rather than an error: pressing submit twice, or landing back
    -- on the form after approval, is not a mistake worth an error page.
    return 'verified';
  end if;

  select count(*) into v_docs
    from public.verification_documents
   where owner_id = v_uid;

  if v_docs = 0 then
    raise exception 'Upload your documents before submitting for review'
      using errcode = 'P0001';
  end if;

  update public.rider_profiles
     set verification_status = 'pending', updated_at = now()
   where id = v_uid;

  return 'pending';
end;
$fn$;

revoke all on function public.submit_rider_verification() from public, anon;
grant execute on function public.submit_rider_verification() to authenticated, service_role;

comment on function public.submit_rider_verification is
  'Put your own rider account into the review queue. Writes the literal ''pending'' - it cannot reach ''verified'' by any input. Refuses an empty folder and a blocked account.';

create or replace function public.submit_company_verification(p_company uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid  uuid := (select auth.uid());
  v_co   public.logistics_companies%rowtype;
  v_docs integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_co from public.logistics_companies where id = p_company for update;
  if not found then
    raise exception 'no such company' using errcode = 'P0002';
  end if;

  if v_co.owner_id <> v_uid then
    raise exception 'Only the owner can submit this company' using errcode = '42501';
  end if;

  if v_co.verification_blocked_at is not null then
    raise exception '%', coalesce(
      v_co.verification_blocked_reason,
      'This company cannot be verified. Contact support@letsyncyou.com.'
    ) using errcode = '42501';
  end if;

  if v_co.verification_status = 'verified' then
    return 'verified';
  end if;

  -- The company's folder is the OWNER's folder — verification_documents points
  -- at profiles, and a company is owned by a person. See 20260901270000.
  select count(*) into v_docs
    from public.verification_documents
   where owner_id = v_uid;

  if v_docs = 0 then
    raise exception 'Upload your documents before submitting for review'
      using errcode = 'P0001';
  end if;

  update public.logistics_companies
     set verification_status = 'pending', updated_at = now()
   where id = p_company;

  return 'pending';
end;
$fn$;

revoke all on function public.submit_company_verification(uuid) from public, anon;
grant execute on function public.submit_company_verification(uuid) to authenticated, service_role;

comment on function public.submit_company_verification is
  'Put your own fleet into the review queue. Owner only, writes the literal ''pending''.';
