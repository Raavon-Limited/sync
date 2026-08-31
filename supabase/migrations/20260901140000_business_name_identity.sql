-- ============================================================================
-- business_name_identity
--
-- A business name stops being a text field and becomes an identity: claimed
-- once, held for good, and held by exactly one account.
--
-- WHY IT MATTERS MORE THAN IT LOOKS
--   The name is what a student recognises on the campus board. Two vendors
--   trading as "Mama Put Tanke" is not a cosmetic collision — it is one of
--   them taking the other's customers, and neither the student nor the app can
--   tell which is which. And a vendor who can rename freely can build a
--   reputation as one business, then wear a different one the week after a bad
--   review, which is the same problem pointed at the past.
--
--   It is also load-bearing in ways that are easy to miss: `resolveHandle()`
--   derives the dashboard URL from `business_name`, so renaming moves someone's
--   own links out from under them.
--
-- THREE PARTS
--   1. Uniqueness, case- and whitespace-insensitive. "Raavon Limited" and
--      "raavon  limited" are the same claim.
--   2. A column guard: once set, `authenticated` cannot change it. Staff and
--      the service role still can, because a name typed wrong on day one has
--      to be fixable by somebody.
--   3. `claim_business_name()`, so onboarding can fail with "that name is
--      taken" instead of a constraint-violation string with an index name in
--      it.
--
-- ARCHIVED ACCOUNTS DO NOT HOLD A NAME. The index is partial on
-- `archived_at is null`: a deleted business should not squat a name forever.
--
-- EXISTING DUPLICATES ARE RENAMED, NOT REJECTED, and the rename is written to
-- the audit log. Failing the migration would block every migration behind it
-- over data a human has to arbitrate anyway; silently keeping duplicates would
-- mean the index never gets created and the whole change is decorative. The
-- OLDEST claim keeps the name — first to trade, first served — and later ones
-- get a numeric suffix that staff can correct, which they can precisely
-- because the guard below exempts them.
--
-- ROLLBACK
--   drop index if exists public.vendor_profiles_business_name_key;
--   drop function if exists public.claim_business_name(text);
--   -- and restore guard_vendor_profile_cols from 20260817090000_identity_roles.
-- ============================================================================

-- ── 1. Settle any existing collisions ───────────────────────────────────────
do $$
declare
  r record;
  v_new text;
begin
  for r in
    select id, business_name, created_at,
           row_number() over (
             partition by lower(regexp_replace(trim(business_name), '\s+', ' ', 'g'))
             order by created_at, id
           ) as rank
      from public.vendor_profiles
     where archived_at is null
       and coalesce(trim(business_name), '') <> ''
  loop
    continue when r.rank = 1;

    v_new := r.business_name || ' (' || r.rank || ')';

    update public.vendor_profiles set business_name = v_new where id = r.id;

    -- Recorded rather than done quietly: somebody's storefront name changed
    -- and support needs to be able to find out why.
    insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
    values (null, 'system', 'business_name.deduplicated', 'vendor_profile', r.id::text,
            jsonb_build_object('business_name', r.business_name),
            jsonb_build_object('business_name', v_new));

    raise notice 'Renamed duplicate business name % -> %', r.business_name, v_new;
  end loop;
end $$;
-- ── 2. One name, one business ───────────────────────────────────────────────
-- Normalised in the index rather than in a trigger: a functional unique index
-- cannot be bypassed by a write path that forgot to normalise first.
create unique index if not exists vendor_profiles_business_name_key
  on public.vendor_profiles (lower(regexp_replace(trim(business_name), '\s+', ' ', 'g')))
  where archived_at is null;
comment on index public.vendor_profiles_business_name_key is
  'A business name is claimed by one account. Case- and whitespace-insensitive; archived accounts release their name.';
-- ── 3. Claimed once, then frozen for the client ─────────────────────────────
-- Same body as 20260817090000 plus business_name. Staff and the service role
-- are exempt by the `current_user` test, which is why a typo on day one is
-- still fixable — by support, not by whoever wants the name next.
--
-- Only frozen once it HAS a value: a row created blank (or by a backfill that
-- had nothing to copy) must still be nameable exactly once.
create or replace function public.guard_vendor_profile_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.verification_status := old.verification_status;
    new.verified_at         := old.verified_at;
    new.rating_avg          := old.rating_avg;
    new.rating_count        := old.rating_count;

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
-- ── 4. A claim that fails in words ──────────────────────────────────────────
-- Onboarding needs to say "that name is taken" while the vendor is still in
-- the form. Without this they meet a raw 23505 naming an index, or — worse —
-- find out after the wizard has already flipped their status to pending.
--
-- Checking then inserting is a race, so the unique index above is still the
-- authority: this converts its error rather than replacing it.
create or replace function public.claim_business_name(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid  uuid := (select auth.uid());
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_old  text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if length(v_name) < 2 then
    raise exception 'Enter your business name' using errcode = 'P0001';
  end if;

  perform public.ensure_vendor_profile();

  select business_name into v_old from public.vendor_profiles where id = v_uid for update;

  -- Already theirs. Idempotent so a retried submit is not an error.
  if lower(coalesce(regexp_replace(trim(v_old), '\s+', ' ', 'g'), '')) = lower(v_name) then
    return v_old;
  end if;

  -- The lock, restated: SECURITY DEFINER runs as the owner, so the column
  -- guard's `current_user` test does not fire here and would let this function
  -- rename anybody's business. It must refuse on its own.
  if coalesce(trim(v_old), '') <> '' then
    raise exception
      'Your business name is already set to "%" and cannot be changed here. Contact support if it is wrong.',
      v_old
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.vendor_profiles vp
     where vp.archived_at is null
       and vp.id <> v_uid
       and lower(regexp_replace(trim(vp.business_name), '\s+', ' ', 'g')) = lower(v_name)
  ) then
    raise exception '“%” is already taken. Try another name.', v_name
      using errcode = '23505';
  end if;

  update public.vendor_profiles
     set business_name = v_name, updated_at = now()
   where id = v_uid;

  return v_name;
exception
  -- The index firing means someone claimed it between the check and the write.
  -- Same message either way: the vendor does not care which of the two lost.
  when unique_violation then
    raise exception '“%” is already taken. Try another name.', v_name
      using errcode = '23505';
end;
$fn$;
revoke all on function public.claim_business_name(text) from public, anon;
grant execute on function public.claim_business_name(text) to authenticated, service_role;
comment on function public.claim_business_name(text) is
  'Claim a business name for the caller, once. Refuses a name already held, and refuses to rename a business that already has one — only staff can do that.';
-- ── 5. Onboarding actually fills the business profile ───────────────────────
-- The wizard collected a business name, an address and a phone number and put
-- them in `auth.users.raw_user_meta_data`, which nothing reads after signup.
-- So Settings — which reads `vendor_profiles` — opened with empty boxes and
-- asked the vendor to type it all again.
--
-- ONLY FILLS WHAT IS BLANK. Onboarding can be re-submitted (a rejected
-- verification comes back through the same wizard), and a vendor who has since
-- corrected their address in Settings must not have the original typed back
-- over it. `coalesce(nullif(existing, ''), new)` is the whole rule.
--
-- `public_phone` IS SEEDED FROM THE PERSONAL ONE, and that is a starting point
-- rather than a merge: the two columns are deliberately separate — one is
-- published on the storefront and one is not — but a vendor with no published
-- number is unreachable, and the number they just typed is the best guess
-- available. Settings is where they change it, and this never overwrites it.
create or replace function public.save_onboarding_business(
  p_business_name    text,
  p_business_address text default null,
  p_phone            text default null,
  p_area             text default null,
  p_bio              text default null
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

  -- Creates the row if it is missing, and refuses a taken or already-set name
  -- with a message a person can read.
  perform public.claim_business_name(p_business_name);

  update public.vendor_profiles vp
     set business_address = coalesce(nullif(trim(vp.business_address), ''),
                                     nullif(trim(p_business_address), '')),
         public_phone     = coalesce(nullif(trim(vp.public_phone), ''),
                                     nullif(trim(p_phone), '')),
         area             = coalesce(nullif(trim(vp.area), ''),
                                     nullif(trim(p_area), '')),
         bio              = coalesce(nullif(trim(vp.bio), ''),
                                     nullif(trim(p_bio), '')),
         updated_at       = now()
   where vp.id = v_uid;

  -- `profiles` carries the same details for the account itself, and the
  -- dashboard handle is derived from business_name there. Kept in step so the
  -- sidebar does not disagree with the storefront.
  update public.profiles p
     set business_name    = coalesce(nullif(trim(p.business_name), ''),
                                     nullif(trim(p_business_name), '')),
         business_address = coalesce(nullif(trim(p.business_address), ''),
                                     nullif(trim(p_business_address), '')),
         phone            = coalesce(nullif(trim(p.phone), ''), nullif(trim(p_phone), '')),
         updated_at       = now()
   where p.id = v_uid;
end;
$fn$;
revoke all on function public.save_onboarding_business(text, text, text, text, text)
  from public, anon;
grant execute on function public.save_onboarding_business(text, text, text, text, text)
  to authenticated, service_role;
comment on function public.save_onboarding_business(text, text, text, text, text) is
  'Move the onboarding wizard''s business details into vendor_profiles and profiles. Fills blanks only — never overwrites something the vendor has since corrected in Settings.';
-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_dupes integer;
begin
  select count(*) into v_dupes from (
    select 1
      from public.vendor_profiles
     where archived_at is null and coalesce(trim(business_name), '') <> ''
     group by lower(regexp_replace(trim(business_name), '\s+', ' ', 'g'))
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception '% duplicate business name(s) survived the dedupe', v_dupes;
  end if;

  if to_regprocedure('public.claim_business_name(text)') is null then
    raise exception 'claim_business_name missing';
  end if;

  if to_regprocedure('public.save_onboarding_business(text, text, text, text, text)') is null then
    raise exception 'save_onboarding_business missing';
  end if;
end $$;
