-- ============================================================================
-- verification_card_code
--
-- The ID card stops being addressed by slug and starts being addressed by an
-- unguessable code — because the page it opens now shows a photograph of a
-- person.
--
-- "ONLY REACHABLE BY SCANNING" — WHAT THAT CAN AND CANNOT MEAN
--   A QR code is a picture of a URL. Nothing in an HTTP request distinguishes
--   "a camera decoded this" from "somebody typed it", and every signal that
--   looks like it might — Referer, User-Agent — is absent on a camera open and
--   trivially forged everywhere else. Trying to enforce arrival-by-camera
--   produces a check that blocks real users and stops nobody.
--
--   What genuinely delivers the property is making the URL impossible to
--   arrive at any other way. `/v/raavon-limited` is guessable from a business
--   name — anyone could walk the slug list and harvest faces. `/v/<32 random
--   hex>` cannot be guessed, is not indexed, and appears nowhere but on the
--   card itself. Possession of the card becomes the thing that grants access,
--   which is exactly what "only by scanning" is asking for.
--
-- WHY THIS MATTERS MORE FOR A LANDLORD OR AGENT THAN FOR A SHOP
--   A food vendor's card answers "is this business real", and the business is
--   already public. An agent's card answers "is the stranger asking to be let
--   into my flat the person the platform sent", and it is checked by someone
--   alone with them at a door. That is a safety check, and the photograph is
--   the part doing the work — a name and a tick could belong to anybody
--   holding the card.
--
-- THE CODE IS ROTATABLE, AND THAT IS NOT OPTIONAL
--   A card gets lost, photographed, or kept by an agent who has left. Without
--   a way to invalidate one, every card ever printed is permanently valid.
--   `rotate_verification_code()` issues a new one and every previously printed
--   card stops resolving, immediately.
--
-- WHAT THE PAGE DISCLOSES, AND WHAT IT DOES NOT
--   Name, photo, category, area, verification state, and WHICH checks passed —
--   by requirement name only ('Government ID', 'Proof of address'). Never the
--   documents, never a storage path, never the document titles, which are
--   user-supplied filenames and routinely contain a full legal name. The
--   answer is "the platform checked these things", not "here is the evidence".
--
-- ROLLBACK
--   drop function if exists public.verify_card(text);
--   drop function if exists public.rotate_verification_code();
--   drop function if exists public.my_verification_code();
--   drop trigger if exists vendor_profiles_issue_card_code on public.vendor_profiles;
--   drop function if exists private.issue_vendor_card_code();
--   drop table if exists private.vendor_card_codes;
--   -- and restore verify_business from 20260901170000 if the slug route is
--   -- being brought back.
-- ============================================================================

-- ── 1. The code ─────────────────────────────────────────────────────────────
-- 32 hex characters — 128 bits, the same construction as storefront_invites'
-- token, using gen_random_uuid() because pgcrypto is never declared by this
-- schema. Short enough that the QR stays a low, dense-free version.
-- IT LIVES IN `private`, NOT ON `vendor_profiles`. This began as a column plus
-- `revoke select (verification_code) ... from anon`, which does not work, in
-- two separate ways:
--
--   1. 20260817090000 granted SELECT on the whole TABLE to anon. Postgres is
--      explicit that a column-level revoke does not claw back a table-level
--      grant, so the revoke was a no-op and anon could read every code. This
--      migration's own assertion caught it — correctly.
--
--   2. Narrowing it properly means revoking the table grant and granting an
--      explicit column list instead. That breaks `select('*')`, which three
--      live call sites use (modules/food/queries, modules/services/queries,
--      around-data), because `*` expands to every column including the revoked
--      one. It would also fail closed on every future column, silently.
--
-- A capability does not belong on a row the whole internet can read. In
-- `private` there is no grant to revoke: client roles have no access to the
-- schema at all, and the SECURITY DEFINER functions below reach it regardless.
--
-- IT ALSO FIXES A SILENT NO-OP. `rotate_verification_code` is SECURITY DEFINER
-- and used to UPDATE vendor_profiles — where guard_vendor_profile_cols reverts
-- the column whenever `current_user` is 'authenticated'. As 20260830100000
-- documents at length, current_user IS 'authenticated' for every PostgREST
-- request, definer RPCs included. Rotation therefore returned a fresh code and
-- saved nothing: the lost card would have kept working forever. The guard is
-- on vendor_profiles and does not reach this table.
create table if not exists private.vendor_card_codes (
  vendor_id  uuid primary key references public.vendor_profiles (id) on delete cascade,
  code       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  rotated_at timestamptz not null default now()
);
comment on table private.vendor_card_codes is
  'Opaque address of each account''s public verification card. A capability: possession of the code opens the card page, so it never travels with a profile read. Rotate to invalidate printed cards.';
-- Everyone who already has a profile gets a card.
insert into private.vendor_card_codes (vendor_id)
select vp.id from public.vendor_profiles vp
on conflict (vendor_id) do nothing;
-- And everyone who gets one from here on.
create or replace function private.issue_vendor_card_code()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  insert into private.vendor_card_codes (vendor_id)
  values (new.id)
  on conflict (vendor_id) do nothing;
  return new;
end;
$fn$;
drop trigger if exists vendor_profiles_issue_card_code on public.vendor_profiles;
create trigger vendor_profiles_issue_card_code
  after insert on public.vendor_profiles
  for each row execute function private.issue_vendor_card_code();
-- ── 2. Keeping the client off it ────────────────────────────────────────────
-- Same guard as the other server-controlled columns. Without this a vendor
-- could set their own code — to a guessable string, or to one that collides
-- with the card they are trying to impersonate.
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
-- ── 3. Reading your own code, to put it on your card ────────────────────────
create or replace function public.my_verification_code()
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select c.code
    from private.vendor_card_codes c
   where c.vendor_id = (select auth.uid());
$fn$;
revoke all on function public.my_verification_code() from public, anon;
grant execute on function public.my_verification_code() to authenticated, service_role;
-- ── 4. Invalidating every card already printed ──────────────────────────────
create or replace function public.rotate_verification_code()
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid  uuid := (select auth.uid());
  v_new  text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_new := replace(gen_random_uuid()::text, '-', '');

  update private.vendor_card_codes
     set code = v_new, rotated_at = now()
   where vendor_id = v_uid;

  if not found then
    raise exception 'no business profile to reissue a card for' using errcode = 'P0002';
  end if;

  -- Worth a trail: "my old card stopped working" is a support question, and
  -- this is the answer to it.
  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
  values (v_uid, 'owner', 'verification_card.rotated', 'vendor_profile', v_uid::text,
          jsonb_build_object('rotated_at', now()));

  return v_new;
end;
$fn$;
revoke all on function public.rotate_verification_code() from public, anon;
grant execute on function public.rotate_verification_code() to authenticated, service_role;
comment on function public.rotate_verification_code() is
  'Issue a new card code. Every previously printed card stops resolving immediately — this is the "my card was lost" button.';
-- ── 5. The public lookup ────────────────────────────────────────────────────
-- Replaces verify_business(slug) from 20260901170000: the slug is guessable
-- and this page now shows a face.
drop function if exists public.verify_business(text);
create or replace function public.verify_card(p_code text)
returns table (
  found          boolean,
  -- 'verified' | 'pending' | 'unverified' | 'rejected' | 'suspended' | 'unknown'
  state          text,
  business_name  text,
  holder_name    text,
  photo_url      text,
  category       text,
  area           text,
  verified_at    timestamptz,
  member_since   timestamptz,
  store_count    integer,
  rating_avg     numeric,
  rating_count   integer,
  -- [{ key, label, met }] — which checks the platform actually ran. Never the
  -- documents themselves.
  requirements   jsonb,
  checked_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with target as (
    select vp.*, p.archived_at as account_archived_at, p.full_name
      from private.vendor_card_codes c
      join public.vendor_profiles vp on vp.id = c.vendor_id
      left join public.profiles p on p.id = vp.id
      -- Trimmed and case-folded so a code retyped off the card still resolves.
     where lower(c.code) = lower(trim(coalesce(p_code, '')))
     limit 1
  ),
  checks as (
    select
      t.id,
      jsonb_agg(
        jsonb_build_object(
          'key',   d.key,
          'label', d.label,
          'met',   exists (
            select 1 from public.verification_documents vd
             where vd.owner_id = t.id
               and vd.doc_type = d.key
               and vd.status = 'approved'
          )
        )
        order by d.ord
      ) as requirements
    from target t
    -- The list is spelled out rather than derived from uploaded rows: a
    -- requirement nobody has uploaded still has to appear, as unmet. Deriving
    -- it from the data would silently drop the checks that matter most.
    cross join (values
      ('gov_id',        'Government ID',    1),
      ('biz_reg',       'Business registration', 2),
      ('proof_address', 'Proof of address', 3)
    ) as d(key, label, ord)
    group by t.id
  )
  select
    true,
    case
      -- Suspension is checked before status, so a removed account cannot
      -- present its last good verification at somebody's front door.
      when t.archived_at is not null or t.account_archived_at is not null then 'suspended'
      when t.verification_status = 'verified' then 'verified'
      when t.verification_status = 'pending'  then 'pending'
      when t.verification_status = 'rejected' then 'rejected'
      else 'unverified'
    end,
    t.business_name,
    nullif(trim(t.full_name), ''),
    t.logo_url,
    t.category,
    t.area,
    t.verified_at,
    t.created_at,
    (select count(*)::integer from public.storefronts s
      where s.vendor_id = t.id and s.archived_at is null),
    t.rating_avg,
    t.rating_count,
    coalesce((select c.requirements from checks c where c.id = t.id), '[]'::jsonb),
    now()
  from target t
  union all
  -- No such code. One row, so the page has the same shape to render and a bad
  -- scan says "not a valid card" instead of throwing.
  select false, 'unknown', null, null, null, null, null, null, null, 0, null, 0,
         '[]'::jsonb, now()
  where not exists (select 1 from target);
$fn$;
-- anon INCLUDED, deliberately: the person checking an agent at their door has
-- no Sync account and should not need one.
revoke all on function public.verify_card(text) from public;
grant execute on function public.verify_card(text) to anon, authenticated, service_role;
comment on function public.verify_card(text) is
  'Live card lookup, addressed by an unguessable code. Public by design — the checker is a stranger at a door. Shows the holder''s photo and which requirements passed, never the documents.';
-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_state text;
  v_dupes integer;
begin
  if to_regprocedure('public.verify_card(text)') is null then
    raise exception 'verify_card missing';
  end if;
  if to_regprocedure('public.rotate_verification_code()') is null then
    raise exception 'rotate_verification_code missing';
  end if;

  select state into v_state from public.verify_card('__not_a_real_card_code__');
  if v_state is distinct from 'unknown' then
    raise exception 'verify_card does not answer for an unknown code';
  end if;

  select count(*) into v_dupes from (
    select 1 from private.vendor_card_codes
     group by code having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception 'verification codes are not unique';
  end if;

  -- Every existing profile got a card.
  if exists (
    select 1 from public.vendor_profiles vp
     where not exists (select 1 from private.vendor_card_codes c where c.vendor_id = vp.id)
  ) then
    raise exception 'some vendor_profiles have no card code';
  end if;

  -- The capability must not be reachable by a client role. Asserted on the
  -- SCHEMA as well as the table: usage on private is what a client would need
  -- first, and it is the grant somebody could add by accident later.
  if has_schema_privilege('anon', 'private', 'usage')
     or has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception 'private schema is reachable by a client role';
  end if;
  if has_table_privilege('anon', 'private.vendor_card_codes', 'select')
     or has_table_privilege('authenticated', 'private.vendor_card_codes', 'select') then
    raise exception 'a client role can read vendor_card_codes — it is a capability';
  end if;
end $$;
