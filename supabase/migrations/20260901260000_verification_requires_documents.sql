-- ============================================================================
-- verification_requires_documents — an empty submission is not a submission,
-- and a rejection is not the end unless we say it is.
--
-- WHAT WENT WRONG
--   A landlord reached the review queue having uploaded nothing. The reviewer's
--   page read:
--
--     0 of 0 documents approved — nothing uploaded yet
--
--   with a Verify button that could not be pressed, because
--   set_verification_status already refuses to verify an account with no
--   approved documents. So the submission was un-actionable from the moment it
--   was made: the vendor believed they had applied, and staff had a queue entry
--   they could only reject.
--
--   The onboarding wizard called documents "optional now — you can add them
--   later", which was never true. Verification cannot complete without them.
--
-- 1. THE FLOOR: NO DOCUMENTS, NO SUBMISSION
--   submit_verification() now refuses an empty folder. This is the same rail
--   set_verification_status has carried since 20260901200000, moved to the
--   other end of the process so it fires where the person can still do
--   something about it.
--
--   IT IS A FLOOR, NOT THE POLICY. Exactly WHICH documents are required is
--   product config (modules/verification/requirements.ts) and belongs there —
--   a requirement nobody has uploaded still has to be listed as unmet, which a
--   query over uploaded rows can never do. The wizard enforces the full set.
--   This refuses the case no configuration could ever make acceptable, and
--   which a client could otherwise reach by calling the RPC directly.
--
-- 2. REJECTED IS NOT A DEAD END
--   'rejected' has always been re-submittable — submit_verification moves
--   unverified|rejected -> pending — and that is right. A blurry NIN photo is
--   the ordinary rejection, and the fix is another photo, not a support
--   ticket.
--
--   But some rejections must stick. A forged CAC certificate is not a document
--   quality problem, and letting that account cycle through the queue forever
--   wastes the reviewer who already caught it.
--
-- 3. WHY A BLOCK COLUMN AND NOT A 'blocked' STATUS
--   `verification_status` is checked against a four-value list on TWO tables,
--   mirrored between them by trigger, and switched on by the dashboard, the
--   banner, the badge, the admin queue and the public card. Adding a fifth
--   value means touching every one of those, and every `status === 'rejected'`
--   branch silently stops covering the worst case.
--
--   A block is not a different status — it is 'rejected', permanently. So it
--   is a separate fact: the status keeps saying what it says, and one column
--   decides whether the door is still open.
--
-- ROLLBACK
--   alter table public.vendor_profiles
--     drop column if exists verification_blocked_at,
--     drop column if exists verification_blocked_reason;
--   -- and restore both functions from 20260901200000.
-- ============================================================================

alter table public.vendor_profiles
  -- Null means "a rejection here is ordinary and they may try again".
  add column if not exists verification_blocked_at     timestamptz,
  add column if not exists verification_blocked_reason text;

comment on column public.vendor_profiles.verification_blocked_at is
  'Set when a rejection is PERMANENT (fraud). While set, submit_verification refuses. Null means an ordinary rejection the business may fix and re-submit.';

-- ── 1. The vendor''s door, with a floor and a lock ──────────────────────────
create or replace function public.submit_verification()
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := (select auth.uid());
  v_status  text;
  v_blocked timestamptz;
  v_reason  text;
  v_docs    integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform public.ensure_vendor_profile();

  select verification_status, verification_blocked_at, verification_blocked_reason
    into v_status, v_blocked, v_reason
    from public.vendor_profiles
   where id = v_uid
     for update;

  if v_status = 'verified' then
    raise exception 'This business is already verified' using errcode = 'P0001';
  end if;

  -- The permanent kind. Named in the message, because "you cannot re-apply"
  -- with no reason attached is the most infuriating possible wall.
  if v_blocked is not null then
    raise exception
      'This business cannot be re-submitted for verification. %',
      coalesce(nullif(trim(v_reason), ''), 'Contact support@letsyncyou.com.')
      using errcode = '42501';
  end if;

  if v_status = 'pending' then
    -- Not an error worth failing onboarding over: re-submitting after adding a
    -- document is a normal thing to do.
    return 'pending';
  end if;

  -- THE FLOOR. A reviewer cannot judge an empty folder, and an account that
  -- lands in the queue with nothing in it can only ever be rejected — which
  -- reads to the applicant as though the upload failed silently.
  select count(*) into v_docs
    from public.verification_documents
   where owner_id = v_uid;

  if v_docs = 0 then
    raise exception
      'Upload your verification documents before submitting. Verification cannot be completed without them.'
      using errcode = 'P0001';
  end if;

  perform set_config('sync.verification_grant', 'on', true);

  -- 'pending' is a LITERAL, not a parameter. There is no argument to this
  -- function, so there is nothing a caller could pass to reach 'verified'.
  update public.vendor_profiles
     set verification_status = 'pending',
         updated_at          = now()
   where id = v_uid;

  perform set_config('sync.verification_grant', 'off', true);

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'owner', 'verification.submitted', 'vendor_profile', v_uid::text,
          jsonb_build_object('status', v_status),
          jsonb_build_object('status', 'pending', 'documents', v_docs));

  return 'pending';
end;
$fn$;

revoke all on function public.submit_verification() from public, anon;
grant execute on function public.submit_verification() to authenticated, service_role;

comment on function public.submit_verification() is
  'Put the caller''s business into the review queue. Refuses an empty folder and refuses a permanently blocked account. Takes no arguments and writes the literal ''pending'' — it cannot reach ''verified'' by any input.';

-- ── 2. The staff door, which can now close permanently ──────────────────────
-- The old two-argument version must GO, not merely be replaced: a default on
-- the third parameter would leave both callable with two arguments and every
-- existing call would fail as ambiguous.
drop function if exists public.set_verification_status(uuid, text);

create or replace function public.set_verification_status(
  p_vendor    uuid,
  p_status    text,
  -- Fraud, not a blurry photo. Only meaningful with 'rejected'.
  p_permanent boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid      uuid := (select auth.uid());
  v_old      text;
  v_approved integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_staff() then
    raise exception 'Only Sync staff can decide a verification' using errcode = '42501';
  end if;

  if p_status not in ('unverified', 'pending', 'verified', 'rejected') then
    raise exception 'Unknown verification status: %', p_status using errcode = '22023';
  end if;

  if p_permanent and p_status <> 'rejected' then
    raise exception 'Only a rejection can be permanent' using errcode = '22023';
  end if;

  select verification_status into v_old
    from public.vendor_profiles
   where id = p_vendor
     for update;

  if not found then
    raise exception 'no such business' using errcode = 'P0002';
  end if;

  if p_status = 'verified' then
    select count(*) into v_approved
      from public.verification_documents
     where owner_id = p_vendor and status = 'approved';

    if v_approved = 0 then
      raise exception
        'This business has no approved documents. Review their uploads before verifying.'
        using errcode = 'P0001';
    end if;
  end if;

  perform set_config('sync.verification_grant', 'on', true);

  update public.vendor_profiles
     set verification_status = p_status,
         verified_at = case when p_status = 'verified' then now() else null end,
         -- Set on a permanent rejection, CLEARED by any other decision. A
         -- reviewer who blocks an account in error, or who later accepts it,
         -- must not need a DBA to undo it.
         verification_blocked_at =
           case when p_permanent then now() else null end,
         verification_blocked_reason =
           case when p_permanent
                then 'A reviewer found this submission fraudulent. Contact support@letsyncyou.com.'
                else null end,
         updated_at  = now()
   where id = p_vendor;

  perform set_config('sync.verification_grant', 'off', true);

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'staff', 'verification.decided', 'vendor_profile', p_vendor::text,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status, 'permanent', p_permanent));

  return p_status;
end;
$fn$;

revoke all on function public.set_verification_status(uuid, text, boolean) from public, anon;
grant execute on function public.set_verification_status(uuid, text, boolean)
  to authenticated, service_role;

comment on function public.set_verification_status(uuid, text, boolean) is
  'The ONLY path to a verified business. Staff only, audited, refuses to verify an account with no approved documents. p_permanent blocks re-submission for fraud; any later decision lifts it.';

-- ── 3. The guard has to let the new columns through ─────────────────────────
-- guard_vendor_profile_cols freezes verification columns unless the grant flag
-- is set. The block columns are decided by exactly the same authority and must
-- be frozen on exactly the same terms, or a client could clear its own block.
create or replace function public.guard_vendor_profile_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if coalesce(current_setting('sync.verification_grant', true), '') <> 'on' then
      new.verification_status := old.verification_status;
      new.verified_at         := old.verified_at;
      -- A self-service unblock would make the whole permanent rejection
      -- decorative.
      new.verification_blocked_at     := old.verification_blocked_at;
      new.verification_blocked_reason := old.verification_blocked_reason;
    end if;

    new.rating_avg   := old.rating_avg;
    new.rating_count := old.rating_count;

    if coalesce(trim(old.business_name), '') <> '' then
      new.business_name := old.business_name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_profiles_guard on public.vendor_profiles;
create trigger vendor_profiles_guard
  before update on public.vendor_profiles
  for each row execute function public.guard_vendor_profile_cols();

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.set_verification_status(uuid, text, boolean)') is null then
    raise exception 'set_verification_status(uuid, text, boolean) missing';
  end if;

  -- The two-argument form must be gone, or every existing call is ambiguous.
  if to_regprocedure('public.set_verification_status(uuid, text)') is not null then
    raise exception 'the old two-argument set_verification_status still exists — calls will be ambiguous';
  end if;

  if to_regprocedure('public.submit_verification()') is null then
    raise exception 'submit_verification missing or no longer zero-argument';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'vendor_profiles'
       and column_name = 'verification_blocked_at'
  ) then
    raise exception 'verification_blocked_at missing';
  end if;

  -- The floor, asserted by inspecting the body: attempting it for real would
  -- need a signed-in vendor, which a migration does not have.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'submit_verification'
       and pg_get_functiondef(p.oid) like '%verification_documents%'
  ) then
    raise exception 'submit_verification does not check for uploaded documents';
  end if;

  if not exists (
    select 1 from pg_proc p
     where p.proname = 'guard_vendor_profile_cols'
       and pg_get_functiondef(p.oid) like '%verification_blocked_at%'
  ) then
    raise exception 'the vendor guard does not protect the block columns';
  end if;
end $$;
