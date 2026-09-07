-- ============================================================================
-- unnamed_business_placeholder   onboarding could not name a business.
--
-- WHAT A VENDOR SAW
--
--   “Hizzy Internationals” is already taken. Try another name.
--
--   …for a name that no account holds, typed by the owner of the business,
--   on their own onboarding wizard. Nothing in vendor_profiles matched it.
--
-- WHY THE MESSAGE WAS A RED HERRING
--   claim_business_name (20260901140000) ends with a blanket handler:
--
--     exception when unique_violation then
--       raise exception '“%” is already taken. Try another name.', v_name;
--
--   That catches ANY unique violation anywhere in the function and relabels it
--   with the name the person typed. It is not a message about what happened;
--   it is a message about what was in scope. The violation was somewhere else
--   entirely.
--
-- WHERE IT ACTUALLY CAME FROM
--   claim_business_name's first act is `perform public.ensure_vendor_profile()`
--   (20260901100000), which inserts the missing business row and, when
--   `profiles.business_name` is blank, supplies the LITERAL 'Unnamed business'
--   for a NOT NULL column.
--
--   20260901140000 then put a unique index across that same column. So the
--   placeholder is a name like any other, and exactly ONE account in the whole
--   database may be called 'Unnamed business'. Every vendor after the first who
--   reaches onboarding without a name on their profile collides with it.
--
--   The evidence was already sitting in the table: that migration's dedupe pass
--   found the collision had happened before and renamed the losers
--   'Unnamed business (2)' and 'Unnamed business (3)'. It settled the existing
--   rows and left the function that produces them untouched, so the next signup
--   walked into it again.
--
-- AND A SECOND WALL BEHIND THE FIRST
--   Suppose the collision had not fired. claim_business_name would then read
--   back the placeholder it had just caused to be written, find a non-empty
--   name, and refuse:
--
--     Your business name is already set to "Unnamed business" and cannot be
--     changed here. Contact support if it is wrong.
--
--   That rule is right   a claimed name is frozen against the client   but a
--   placeholder the system invented one statement earlier is not a claim
--   anybody made. So an account with no business name on its profile could not
--   finish onboarding by either route: collide, or be told the name it never
--   chose is final.
--
-- THE FIX, IN THREE PARTS
--   1. The placeholder becomes UNIQUE PER ACCOUNT, the way `slug` already is.
--      Two businesses with no name yet are two rows, not a conflict.
--   2. A placeholder is treated as NO NAME. claim_business_name will overwrite
--      one, and only one   a real claimed name stays frozen.
--   3. The handler stops lying. It relabels a violation of the business-name
--      index and RE-RAISES anything else, so the next unrelated constraint
--      failure says what it was instead of blaming whatever was in the box.
--
-- WHY NOT JUST MAKE THE COLUMN NULLABLE
--   NULL is the honest model for "unclaimed" and unique indexes already permit
--   many NULLs. It is also a schema change that reaches every read of
--   `business_name` in the app, all of which are typed non-null today. The
--   placeholder is the smaller change and it removes the same dead end; the
--   nullable version can come later behind a types regeneration.
--
-- ROLLBACK
--   Restore ensure_vendor_profile from 20260901100000 and claim_business_name
--   from 20260901140000. Note that doing so re-blocks onboarding for any
--   account whose profile carries no business name.
-- ============================================================================

-- ── 1. What counts as "no name yet" ─────────────────────────────────────────
-- One predicate, so the writer and the reader of a placeholder cannot disagree
-- about what one looks like. Matches the historical forms too ('Unnamed
-- business', and the '(2)'/'(3)' the earlier dedupe produced), because those
-- rows are in the table right now and their owners are just as stuck.
create or replace function private.is_placeholder_business_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(trim(p_name), '') = ''
      or lower(trim(p_name)) like 'unnamed business%';
$$;

comment on function private.is_placeholder_business_name(text) is
  'Whether a vendor_profiles.business_name is a system-invented placeholder rather than a name somebody chose. Placeholders are freely overwritable; claimed names are frozen.';

-- ── 2. The placeholder stops being one shared name ──────────────────────────
-- 20260901100000 unchanged except the business_name expression, which is
-- marked. The uuid tail is the same collision breaker the slug two lines above
-- it already uses.
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
    -- THE LINE THAT CAUSED THE OUTAGE. This was the bare literal
    -- 'Unnamed business', which a unique index then let exactly one account in
    -- the database hold. Per-account now, for the same reason the slug above
    -- carries a uuid tail: a placeholder is not a name two people are fighting
    -- over, it is the absence of one.
    coalesce(nullif(trim(v_prof.business_name), ''),
             'Unnamed business ' || left(v_uid::text, 8)),
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

-- ── 3. A placeholder is not a claim ─────────────────────────────────────────
-- 20260901140000 unchanged except the two marked blocks.
create or replace function public.claim_business_name(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid        uuid := (select auth.uid());
  v_name       text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_old        text;
  v_constraint text;
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

  -- THE FROZEN-NAME RULE, NOW WITH THE PLACEHOLDER EXEMPTED.
  -- SECURITY DEFINER runs as the owner, so the column guard's `current_user`
  -- test does not fire here and this function must refuse a rename on its own.
  -- It still does   but 'Unnamed business …' is something ensure_vendor_profile
  -- wrote one statement ago, not a name this vendor chose, and treating it as
  -- final locked every unnamed account out of onboarding permanently.
  if not private.is_placeholder_business_name(v_old) then
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
  -- ONLY THE BUSINESS-NAME INDEX GETS THIS MESSAGE.
  -- The handler used to catch every unique_violation raised anywhere in the
  -- body   including one from ensure_vendor_profile's INSERT   and relabel it
  -- with whatever the vendor had typed. That is how a placeholder collision
  -- came out as "Hizzy Internationals is already taken": a true-sounding
  -- sentence about a name that was never the problem, sending somebody off to
  -- rename a business that did not need renaming.
  --
  -- GET STACKED DIAGNOSTICS names the constraint that actually fired. Anything
  -- else is re-raised untouched, so the next unrelated failure gets to say
  -- what it was.
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'vendor_profiles_business_name_key' then
      raise exception '“%” is already taken. Try another name.', v_name
        using errcode = '23505';
    end if;
    raise;
end;
$fn$;

revoke all on function public.claim_business_name(text) from public, anon;
grant execute on function public.claim_business_name(text) to authenticated, service_role;

-- ── 4. Free the accounts already holding the shared placeholder ─────────────
-- Three rows in production right now: 'Unnamed business' plus the '(2)' and
-- '(3)' the 20260901140000 dedupe renamed. Every one of them is an account that
-- would be refused with "cannot be changed here" the moment it tried to claim a
-- real name. Rewritten to the per-account form, which the predicate above still
-- reads as unclaimed.
update public.vendor_profiles
   set business_name = 'Unnamed business ' || left(id::text, 8),
       updated_at    = now()
 where archived_at is null
   and private.is_placeholder_business_name(business_name)
   and business_name is distinct from 'Unnamed business ' || left(id::text, 8);

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_bad integer;
begin
  if to_regprocedure('private.is_placeholder_business_name(text)') is null then
    raise exception 'is_placeholder_business_name missing';
  end if;

  -- The actual property: no two live businesses share a placeholder any more.
  select count(*) into v_bad from (
    select 1
      from public.vendor_profiles
     where archived_at is null
       and private.is_placeholder_business_name(business_name)
     group by lower(regexp_replace(trim(business_name), '\s+', ' ', 'g'))
    having count(*) > 1
  ) d;
  if v_bad > 0 then
    raise exception '% placeholder business name(s) are still shared', v_bad;
  end if;

  -- The shared literal is what the unique index turned into a single global
  -- slot. If it comes back, so does the outage.
  --
  -- COMMENTS ARE STRIPPED BEFORE THIS LOOKS. pg_get_functiondef returns the
  -- whole source, prose included, and the note above the fix QUOTES the very
  -- literal this forbids in order to explain it. The first version of this
  -- assertion had no such filter, matched its own explanation, and failed the
  -- migration for a bug that was already fixed two hundred lines above it.
  -- Only code is searched now.
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'ensure_vendor_profile'
       and regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
           like '%''Unnamed business'',%'
  ) then
    raise exception 'ensure_vendor_profile still writes the shared placeholder literal';
  end if;

  -- The positive half, and it is not redundant: the check above also passes on
  -- a function that stopped writing any placeholder at all, which would fail
  -- the NOT NULL column at the next signup instead. This asserts the
  -- per-account form is the one actually there.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'ensure_vendor_profile'
       and pg_get_functiondef(p.oid) like '%''Unnamed business '' || left(v_uid::text, 8)%'
  ) then
    raise exception 'ensure_vendor_profile does not build a per-account placeholder';
  end if;

  -- The handler must be able to tell one constraint from another.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'claim_business_name'
       and pg_get_functiondef(p.oid) like '%get stacked diagnostics%'
  ) then
    raise exception 'claim_business_name still relabels every unique violation';
  end if;
end $$;
