-- ============================================================================
-- strict_verification
--
-- Nobody can mark themselves verified. Only staff can, and only through one
-- function that says who did it.
--
-- THE SHAPE OF THE PROBLEM
--   `verification_status` is guarded on both tables by
--   `current_user in ('authenticated','anon')`. That reads like "block the
--   client", and it is not what it does. As 20260830100000 documents at
--   length, `current_user` is `authenticated` for EVERY PostgREST request —
--   service-role calls and SECURITY DEFINER RPCs included. So the guard was
--   blocking everybody:
--
--     * a vendor could not self-verify            (correct, and the point)
--     * an ADMIN could not verify anybody either  (the approval never landed)
--     * `submit_verification()` could not even    (onboarding looked like it
--       move a vendor to 'pending'                 submitted and did nothing)
--
--   Which means verification has never actually worked end to end. The column
--   was frozen against the world, including the people whose job it is.
--
-- THE FIX IS THE ONE 20260830100000 ALREADY ESTABLISHED
--   Stop asking WHO is calling — that question has no reliable answer here.
--   Ask WHAT IS BEING DONE. A transaction-local GUC is raised by the two
--   functions allowed to move this column, and the guard honours only that.
--
--   A client cannot raise it. PostgREST executes no arbitrary SQL, so the only
--   way to set the flag is to call a function that sets it, and both of those
--   check the caller first. `set_config(..., true)` is transaction-scoped, so
--   it cannot leak into the next request on a pooled connection.
--
-- TWO DOORS, DELIBERATELY DIFFERENT SIZES
--   `submit_verification()`   the vendor. May only move
--                             unverified|rejected -> pending. It is physically
--                             incapable of writing 'verified' — the value is
--                             not a parameter, it is a literal in the body.
--   `set_verification_status()` staff only, gated on is_staff(). The ONLY path
--                             to 'verified', and every call is written to the
--                             audit log with the actor's id.
--
--   That asymmetry is the whole security model: the vendor's door leads into
--   the queue and nowhere else.
--
-- WHAT IT DOES NOT DO: decide FOR the reviewer. 20260817090000 recorded that
-- verification is deliberately not automatic on the last document being
-- approved, because a human decides a business is real. That stands. The one
-- rail added here is that 'verified' is refused when NOTHING has been
-- approved — a reviewer may judge, but not on an empty folder.
--
-- ROLLBACK
--   drop function if exists public.set_verification_status(uuid, text);
--   -- and restore guard_vendor_profile_cols from 20260901190000 and
--   -- guard_profile_privileged_cols from 20260830100000.
-- ============================================================================

-- ── 1. The guards learn one exception ───────────────────────────────────────
create or replace function public.guard_vendor_profile_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    -- Verification moves only inside a sanctioned call. Everything else that
    -- touches it is reverted, whoever it claims to be.
    if coalesce(current_setting('sync.verification_grant', true), '') <> 'on' then
      new.verification_status := old.verification_status;
      new.verified_at         := old.verified_at;
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
-- Same exception on `profiles`, so the mirror trigger can land. Everything
-- else here is 20260830100000 unchanged — the roles/role rules are load
-- bearing and are restated rather than rewritten.
create or replace function public.guard_profile_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    -- `roles` is a set of privileges. Widening it is a grant, and grants go
    -- through claim_role, which checks what may be claimed. Anything else that
    -- touches this column is reverted, whoever it claims to be.
    if coalesce(current_setting('sync.role_grant', true), '') <> 'on' then
      new.roles := old.roles;
    end if;

    -- `role` is which held privilege is active. Moving it is not a grant, so
    -- it is allowed — but only within the set above, which by this point is
    -- either the old set or a legitimately granted one.
    if not (new.role = any (coalesce(new.roles, '{}'))) then
      new.role := old.role;
    end if;

    if coalesce(current_setting('sync.verification_grant', true), '') <> 'on' then
      new.verification_status := old.verification_status;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists profiles_guard_privileged on public.profiles;
create trigger profiles_guard_privileged
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_cols();
-- ── 2. The vendor's door: into the queue, and nowhere else ──────────────────
create or replace function public.submit_verification()
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform public.ensure_vendor_profile();

  select verification_status into v_status
    from public.vendor_profiles
   where id = v_uid
     for update;

  if v_status = 'verified' then
    raise exception 'This business is already verified' using errcode = 'P0001';
  end if;
  if v_status = 'pending' then
    -- Not an error worth failing onboarding over: re-submitting after adding a
    -- document is a normal thing to do.
    return 'pending';
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
          jsonb_build_object('status', 'pending'));

  return 'pending';
end;
$fn$;
revoke all on function public.submit_verification() from public, anon;
grant execute on function public.submit_verification() to authenticated, service_role;
comment on function public.submit_verification() is
  'Put the caller''s business into the review queue. Takes no arguments and writes the literal ''pending'' — it cannot reach ''verified'' by any input.';
-- ── 3. The staff door: the only way to 'verified' ───────────────────────────
create or replace function public.set_verification_status(
  p_vendor uuid,
  p_status text
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

  -- THE CHECK THAT MATTERS. is_staff() reads current_app_role(), which reads
  -- the JWT claim or profiles.role — and profiles.role is itself guarded, so a
  -- client cannot forge its way in here.
  if not public.is_staff() then
    raise exception 'Only Sync staff can decide a verification' using errcode = '42501';
  end if;

  if p_status not in ('unverified', 'pending', 'verified', 'rejected') then
    raise exception 'Unknown verification status: %', p_status using errcode = '22023';
  end if;

  select verification_status into v_old
    from public.vendor_profiles
   where id = p_vendor
     for update;

  if not found then
    raise exception 'no such business' using errcode = 'P0002';
  end if;

  -- A reviewer may judge, but not on an empty folder. This does not decide FOR
  -- them — 20260817090000 was explicit that a human makes the call and that
  -- approving the last document must not auto-verify. It only refuses the
  -- accident of verifying somebody who has submitted nothing at all.
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
         updated_at  = now()
   where id = p_vendor;

  perform set_config('sync.verification_grant', 'off', true);

  -- Who decided, and what it was before. A verification is a claim Sync makes
  -- to strangers at somebody's front door; it needs a name against it.
  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'staff', 'verification.decided', 'vendor_profile', p_vendor::text,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status));

  return p_status;
end;
$fn$;
revoke all on function public.set_verification_status(uuid, text) from public, anon;
grant execute on function public.set_verification_status(uuid, text) to authenticated, service_role;
comment on function public.set_verification_status(uuid, text) is
  'The ONLY path to a verified business. Staff only, audited, and refuses to verify an account with no approved documents.';
-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.set_verification_status(uuid, text)') is null then
    raise exception 'set_verification_status missing';
  end if;

  -- submit_verification must take NO arguments. If it ever grows one, the
  -- "cannot reach verified by any input" property is gone and this fails.
  if to_regprocedure('public.submit_verification()') is null then
    raise exception 'submit_verification missing or no longer zero-argument';
  end if;

  -- The guard must not be reachable without the flag. Asserted by inspecting
  -- the body rather than by attempting a write, which would need a real row.
  if not exists (
    select 1 from pg_proc p
     where p.proname = 'guard_vendor_profile_cols'
       and pg_get_functiondef(p.oid) like '%sync.verification_grant%'
  ) then
    raise exception 'the vendor guard does not honour the verification flag';
  end if;
  if not exists (
    select 1 from pg_proc p
     where p.proname = 'guard_profile_privileged_cols'
       and pg_get_functiondef(p.oid) like '%sync.verification_grant%'
  ) then
    raise exception 'the profile guard does not honour the verification flag';
  end if;
end $$;
