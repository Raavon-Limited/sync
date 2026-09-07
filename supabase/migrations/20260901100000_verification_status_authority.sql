-- ============================================================================
-- verification_status_authority
--
-- A vendor's verification status lived in three places that nothing kept in
-- step, and two of them were never written after signup:
--
--   auth.users.raw_user_meta_data->>'verification_status'
--        written by submitVendorOnboarding. Read exactly once, by
--        handle_new_user, at signup   so writing it after signup reached
--        nothing at all.
--   profiles.verification_status
--        seeded from that metadata at signup, then frozen for `authenticated`
--        by guard_profile_privileged_cols. Nothing ever moved it again.
--        THIS IS THE ONE THE WHOLE UI READS: getDashboardProfile() -> the
--        vendor and landlord dashboard gate, and /api/profile -> useSession().
--   vendor_profiles.verification_status
--        what an admin actually writes (setVendorVerification), what the
--        review queue lists, and what guard_storefront_insert consults.
--
-- THE BUG THIS CAUSED, PLAINLY
--   An admin approves a vendor. `vendor_profiles` says 'verified'. `profiles`
--   still says 'unverified', because nothing carries the decision across. The
--   vendor signs in to a dashboard that is still locked, with a button asking
--   them to verify an account that a human already approved. There is no
--   action they can take that fixes it   the column they need changed is one
--   only staff can write, and staff already changed the other one.
--
--   The mirror image is just as bad: onboarding wrote 'pending' to metadata
--   only, so a vendor who submitted their documents stayed 'unverified' in
--   both tables. Their dashboard said "verify your account" as though the
--   submission had been lost, and the admin queue never surfaced them.
--
-- THE RULE, FROM NOW ON
--   `vendor_profiles.verification_status` is the AUTHORITY for a business.
--   `profiles.verification_status` is a MIRROR of it, maintained by trigger.
--   Nothing writes the mirror by hand, and metadata is not a source of truth
--   for anything after signup.
--
--   Direction matters and is not arbitrary: the authority is the column staff
--   write and RLS protects, the mirror is the column the session already
--   carries everywhere. Reversing it would mean either teaching every read to
--   join vendor_profiles, or letting a client-writable table decide who is
--   verified.
--
-- WHY RIDERS ARE NOT INCLUDED
--   `rider_profiles.verification_status` has the same shape and is left alone
--   on purpose. Since multi-role accounts (20260830090000) one person can hold
--   both a business role and 'rider', which is two independent verifications
--   and one `profiles.verification_status` to mirror into   they would
--   overwrite each other, and the loser would be silently wrong. Riders need
--   their own gate reading `rider_profiles` directly, which is a separate
--   change.
--
-- ROLLBACK
--   drop trigger if exists vendor_profiles_mirror_verification on public.vendor_profiles;
--   drop function if exists private.mirror_vendor_verification();
--   drop function if exists public.submit_verification();
--   drop function if exists public.ensure_vendor_profile();
-- ============================================================================

-- ── 1. The mirror ───────────────────────────────────────────────────────────
-- SECURITY DEFINER is load-bearing: guard_profile_privileged_cols freezes
-- `verification_status` whenever `current_user` is 'authenticated', and an
-- admin approving through the service role is not the only caller   the RPC
-- below runs this as the vendor themselves. As a definer-rights function the
-- trigger runs as the owner, the guard's role test does not match, and the
-- write lands. That is the whole reason the mirror can exist at all.
create or replace function private.mirror_vendor_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.profiles
     set verification_status = new.verification_status,
         updated_at          = now()
   where id = new.id
     and verification_status is distinct from new.verification_status;

  return new;
end;
$fn$;

drop trigger if exists vendor_profiles_mirror_verification on public.vendor_profiles;
-- AFTER, and only on the column that matters: a BEFORE trigger would mirror a
-- value that a later BEFORE trigger (guard_vendor_profile_cols) then reverts,
-- leaving the mirror ahead of the authority.
create trigger vendor_profiles_mirror_verification
  after insert or update of verification_status on public.vendor_profiles
  for each row execute function private.mirror_vendor_verification();

-- ── 2. Backfill the mirror ──────────────────────────────────────────────────
-- Every account approved or rejected before this migration has the decision
-- sitting in vendor_profiles and a stale 'unverified' on profiles. This is the
-- statement that unlocks them.
update public.profiles p
   set verification_status = vp.verification_status,
       updated_at          = now()
  from public.vendor_profiles vp
 where vp.id = p.id
   and p.verification_status is distinct from vp.verification_status;

-- ── 3. A business profile that is actually there ────────────────────────────
-- Nothing creates `vendor_profiles` for a new business account: the row came
-- from the one-off backfill in 20260817090000, and `set_vendor_category` moves
-- the role without creating one. A vendor who signed up after that backfill
-- therefore has no business row at all   so there is nothing to mirror, nothing
-- for the review queue to list, and nothing for guard_storefront_insert to
-- read.
--
-- Idempotent, caller-scoped, and safe to call from anywhere that needs the row
-- to exist. It does NOT create a store: a store is a location with an area and
-- hours, and inventing "Main branch" at no address is how a vendor ends up
-- invisible to students without ever being told why. /vendor/stores asks for
-- that explicitly, and the first one is never gated.
create or replace function public.ensure_vendor_profile()
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid  uuid := (select auth.uid());
  v_prof public.profiles%rowtype;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.vendor_profiles where id = v_uid) then
    return v_uid;
  end if;

  select * into v_prof from public.profiles where id = v_uid;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  if not (v_prof.role in ('vendor', 'landlord')
          or 'vendor'   = any (coalesce(v_prof.roles, '{}'))
          or 'landlord' = any (coalesce(v_prof.roles, '{}'))) then
    raise exception 'This account has no business to verify' using errcode = '42501';
  end if;

  -- Same derivation as the 20260817090000 backfill, with the uuid tail as the
  -- collision breaker rather than a window function   there is one row here.
  v_slug := regexp_replace(
              lower(coalesce(nullif(trim(v_prof.business_name), ''),
                             'vendor-' || left(v_uid::text, 8))),
              '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' or exists (select 1 from public.vendor_profiles where slug = v_slug) then
    v_slug := v_slug || '-' || left(v_uid::text, 4);
  end if;

  insert into public.vendor_profiles (
    id, slug, business_name, category, trade, business_address, verification_status
  )
  values (
    v_uid,
    v_slug,
    coalesce(nullif(trim(v_prof.business_name), ''), 'Unnamed business'),
    coalesce(v_prof.vendor_category, 'food'),
    v_prof.trade,
    v_prof.business_address,
    -- Starts from whatever profiles already says, so an account mid-review
    -- does not silently restart at 'unverified'.
    v_prof.verification_status
  )
  on conflict (id) do nothing;

  return v_uid;
end;
$fn$;

revoke all on function public.ensure_vendor_profile() from public, anon;
grant execute on function public.ensure_vendor_profile() to authenticated, service_role;

-- ── 4. Submitting for review actually moves the status ──────────────────────
-- The write onboarding should have been making. It goes to the AUTHORITY and
-- the trigger above carries it to the mirror, so one call updates the vendor's
-- dashboard and the admin queue together.
--
-- IT CAN ONLY MOVE ONE WAY. A vendor may put themselves in the queue; nothing
-- here lets them leave it approved. 'verified' is refused outright rather than
-- silently ignored, because a caller that thinks it just re-submitted an
-- approved account has a bug worth hearing about.
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

  update public.vendor_profiles
     set verification_status = 'pending',
         updated_at          = now()
   where id = v_uid;

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
  'Put the caller''s business into the review queue. Writes vendor_profiles (the authority); the mirror trigger carries it to profiles. Cannot set verified.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_drift integer;
begin
  if to_regprocedure('public.submit_verification()') is null then
    raise exception 'submit_verification missing';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'vendor_profiles_mirror_verification'
  ) then
    raise exception 'mirror trigger missing';
  end if;

  select count(*) into v_drift
    from public.profiles p
    join public.vendor_profiles vp on vp.id = p.id
   where p.verification_status is distinct from vp.verification_status;

  if v_drift > 0 then
    raise exception 'verification status still drifts on % account(s)', v_drift;
  end if;
end $$;
