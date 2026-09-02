-- ============================================================================
-- account_id_cards
--
-- An ID card for every account, not only for businesses.
--
-- WHAT WAS THERE
--   20260901190000 gave each vendor_profiles row an unguessable code and a
--   public page at /v/<code>. It works, and it is the right design - the QR
--   carries an ADDRESS, never a status, so the answer is fetched live and a
--   suspended account's printed card reads "suspended" the moment it is
--   scanned.
--
--   But it is keyed on vendor_profiles. A student, a rider, an event organiser
--   and every member of staff therefore had no card at all - which is backwards,
--   because the people most often asked "are you really from Sync?" are the ones
--   turning up at a door: a rider collecting an order, an ambassador inspecting
--   a hostel, a staff member asking a landlord for documents. A vendor sits in a
--   shop that is already public.
--
-- WHAT THIS DOES
--   Moves the code onto the PERSON. One card per account, addressed the same
--   way, showing every credential that account holds: a landlord who is also a
--   student is one human being with one card and two lines on it.
--
-- PRINTED CARDS KEEP WORKING
--   Existing vendor codes are carried across verbatim rather than reissued.
--   A card in somebody's wallet must not stop resolving because we changed a
--   table, and `verify_card` still falls back to the old table for anything
--   this backfill could not reach.
--
-- THERE IS NO FACE ON A PERSON'S CARD, AND THAT IS DELIBERATE
--   The only photograph Sync holds of a student or a rider is their
--   verification selfie, which lives in a private bucket and is opened by
--   reviewers alone. Publishing it behind an unguessable URL would still be
--   publishing it. A business logo is already public and is still shown; a
--   person's card shows their name and their credentials, and the check is the
--   live answer rather than the likeness.
--
-- STAFF ARE ON IT ON PURPOSE
--   "This person is Sync staff" is exactly the claim a landlord being asked for
--   documents needs to test. The card names the role they hold in the console,
--   nothing more - no areas, no permissions, no email.
--
-- ROLLBACK
--   Re-run 20260901190000_verification_card_code.sql, then:
--   drop function if exists public.my_card_code();
--   drop function if exists public.rotate_card_code();
--   drop trigger if exists profiles_issue_card_code on public.profiles;
--   drop function if exists private.issue_account_card_code();
--   drop table if exists private.account_card_codes;
-- ============================================================================

-- ── 1. The code, per account ────────────────────────────────────────────────
create table if not exists private.account_card_codes (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  code       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  rotated_at timestamptz not null default now()
);

comment on table private.account_card_codes is
  'Opaque address of an account''s public verification card. A capability: possession of the code opens the card page, so it never travels with a profile read. Rotate to invalidate printed cards.';

-- Every card already printed keeps its address.
insert into private.account_card_codes (user_id, code, rotated_at)
select v.vendor_id, v.code, v.rotated_at
  from private.vendor_card_codes v
  join public.profiles p on p.id = v.vendor_id
on conflict (user_id) do nothing;

-- And everybody else gets one.
insert into private.account_card_codes (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function private.issue_account_card_code()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  insert into private.account_card_codes (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists profiles_issue_card_code on public.profiles;
create trigger profiles_issue_card_code
  after insert on public.profiles
  for each row execute function private.issue_account_card_code();

-- ── 2. Reading your own code ────────────────────────────────────────────────
-- Issues one if it is somehow missing rather than returning null: a card that
-- cannot be drawn because a backfill missed a row is a bug the holder cannot
-- see the cause of, and the insert is idempotent.
create or replace function public.my_card_code()
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid  uuid := (select auth.uid());
  v_code text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into private.account_card_codes (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select code into v_code from private.account_card_codes where user_id = v_uid;
  return v_code;
end;
$fn$;

revoke all on function public.my_card_code() from public, anon;
grant execute on function public.my_card_code() to authenticated, service_role;

-- The vendor-shaped name kept as a wrapper: business-profile-form calls it, and
-- both names must answer with the SAME code or a vendor would print a card
-- addressing a different row than the one /v resolves.
create or replace function public.my_verification_code()
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select c.code from private.account_card_codes c where c.user_id = (select auth.uid());
$fn$;

revoke all on function public.my_verification_code() from public, anon;
grant execute on function public.my_verification_code() to authenticated, service_role;

-- ── 3. Reissuing ────────────────────────────────────────────────────────────
create or replace function public.rotate_card_code()
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_new text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_new := replace(gen_random_uuid()::text, '-', '');

  insert into private.account_card_codes (user_id, code, rotated_at)
  values (v_uid, v_new, now())
  on conflict (user_id) do update set code = excluded.code, rotated_at = now();

  -- The old table too, so a card printed before this migration cannot be
  -- revived by the fallback in verify_card after its owner has reissued.
  update private.vendor_card_codes
     set code = v_new, rotated_at = now()
   where vendor_id = v_uid;

  -- Worth a trail: "my old card stopped working" is a support question, and
  -- this is the answer to it.
  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
  values (v_uid, 'owner', 'verification_card.rotated', 'profile', v_uid::text,
          jsonb_build_object('rotated_at', now()));

  return v_new;
end;
$fn$;

revoke all on function public.rotate_card_code() from public, anon;
grant execute on function public.rotate_card_code() to authenticated, service_role;

create or replace function public.rotate_verification_code()
returns text
language sql
security definer
set search_path = ''
as $fn$
  select public.rotate_card_code();
$fn$;

revoke all on function public.rotate_verification_code() from public, anon;
grant execute on function public.rotate_verification_code() to authenticated, service_role;

-- ── 4. The public lookup, for any kind of account ───────────────────────────
drop function if exists public.verify_card(text);

create or replace function public.verify_card(p_code text)
returns table (
  found          boolean,
  -- 'verified' | 'pending' | 'unverified' | 'rejected' | 'suspended' | 'unknown'
  state          text,
  -- What kind of card this is, for the heading: 'business' | 'person' | 'staff'
  card_kind      text,
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
  -- [{ key, label, met }]   which checks the platform actually ran. Never the
  -- documents themselves.
  requirements   jsonb,
  -- [{ kind, label, state }]   every credential this account holds. A landlord
  -- who is also a student is one card with two lines.
  credentials    jsonb,
  checked_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with target as (
    -- The account. New table first; the old one is the fallback for any card
    -- printed before this migration that the backfill could not reach.
    select p.id,
           p.full_name,
           p.role,
           coalesce(p.roles, array[]::text[]) as roles,
           p.archived_at,
           p.suspended_at,
           p.verification_status as personal_status,
           p.created_at
      from public.profiles p
     where p.id = coalesce(
             (select c.user_id from private.account_card_codes c
               where lower(c.code) = lower(trim(coalesce(p_code, '')))),
             (select v.vendor_id from private.vendor_card_codes v
               where lower(v.code) = lower(trim(coalesce(p_code, ''))))
           )
     limit 1
  ),
  biz as (
    select vp.* from public.vendor_profiles vp
     where vp.id = (select id from target)
  ),
  stu as (
    select sp.* from public.student_profiles sp
     where sp.id = (select id from target)
  ),
  rid as (
    select rp.* from public.rider_profiles rp
     where rp.id = (select id from target)
  ),
  staff as (
    -- Staff by ROLE, which is what is_staff() tests, plus the name of the
    -- console role they were granted when there is one. A super admin holds
    -- the role without necessarily holding a named grant, and leaving them off
    -- their own staff card would be the one omission nobody would think to
    -- check for.
    select coalesce(
             (select r.name
                from public.access_members m
                join public.access_roles r on r.id = m.role_id
               where m.user_id = t.id and r.scope = 'admin'
               order by r.name
               limit 1),
             initcap(replace(t.role, '_', ' '))
           ) as name
      from target t
     where t.role in ('admin', 'super_admin')
        or exists (
             select 1 from public.access_members m
               join public.access_roles r on r.id = m.role_id
              where m.user_id = t.id and r.scope = 'admin'
           )
  ),
  -- What this account was ASKED for, by role. Spelled out rather than derived
  -- from uploaded rows: a requirement nobody has uploaded still has to appear,
  -- as unmet, and deriving it from the data would silently drop the checks
  -- that matter most.
  asked as (
    select d.key, d.label, d.ord
      from target t
      cross join (values
        ('gov_id',        'Government ID',         1, array['vendor','landlord','rider','student','event_manager','creator']),
        ('biz_reg',       'Business registration', 2, array['vendor','landlord']),
        ('proof_address', 'Proof of address',      3, array['vendor','landlord','rider']),
        ('student_id',    'School ID',             4, array['student'])
      ) as d(key, label, ord, for_roles)
     where exists (
       select 1 from unnest(d.for_roles) as asked_role
        where asked_role = t.role or asked_role = any (t.roles)
     )
  ),
  checks as (
    select coalesce(
             jsonb_agg(jsonb_build_object(
               'key',   a.key,
               'label', a.label,
               'met',   exists (
                 select 1 from public.verification_documents vd
                  where vd.owner_id = (select id from target)
                    and vd.doc_type = a.key
                    and vd.status = 'approved'
               )
             ) order by a.ord),
             '[]'::jsonb
           ) as requirements
      from asked a
  ),
  -- One line per credential the account actually holds.
  creds as (
    select coalesce(jsonb_agg(c.j order by c.ord), '[]'::jsonb) as credentials
      from (
        select 1 as ord, jsonb_build_object(
                 'kind',  case when b.category = 'landlord' then 'landlord' else 'vendor' end,
                 'label', case when b.category = 'landlord' then 'Landlord' else 'Business' end,
                 'state', b.verification_status) as j
          from biz b
        union all
        select 2, jsonb_build_object('kind', 'student', 'label', 'Student',
                                     'state', s.verification_status)
          from stu s
        union all
        select 3, jsonb_build_object('kind', 'rider', 'label', 'Rider',
                                     'state', r.verification_status)
          from rid r
        union all
        select 4, jsonb_build_object('kind', 'organiser', 'label', 'Event organiser',
                                     'state', t.personal_status)
          from target t
         where t.role = 'event_manager' or 'event_manager' = any (t.roles)
        union all
        select 5, jsonb_build_object('kind', 'creator', 'label', 'Content creator',
                                     'state', t.personal_status)
          from target t
         where t.role = 'creator' or 'creator' = any (t.roles)
        union all
        -- Being staff is not a document check   it is a grant, and holding it
        -- is the whole claim. Reported as verified because that is what it is.
        select 6, jsonb_build_object('kind', 'staff',
                                     'label', coalesce('Sync staff · ' || st.name, 'Sync staff'),
                                     'state', 'verified')
          from staff st
      ) c
  )
  select
    true,
    case
      -- Suspension and archiving are checked BEFORE any status, so a removed
      -- account cannot present its last good verification at a front door.
      when t.archived_at is not null or t.suspended_at is not null then 'suspended'
      when exists (select 1 from staff) then 'verified'
      when coalesce(b.verification_status, '') = 'verified'
        or coalesce(s.verification_status, '') = 'verified'
        or coalesce(r.verification_status, '') = 'verified'
        or (t.personal_status = 'verified'
            and (t.role in ('event_manager', 'creator')
                 or t.roles && array['event_manager','creator'])) then 'verified'
      when coalesce(b.verification_status, '') = 'pending'
        or coalesce(s.verification_status, '') = 'pending'
        or coalesce(r.verification_status, '') = 'pending' then 'pending'
      when coalesce(b.verification_status, '') = 'rejected'
        or coalesce(s.verification_status, '') = 'rejected'
        or coalesce(r.verification_status, '') = 'rejected' then 'rejected'
      else 'unverified'
    end,
    case
      when exists (select 1 from staff) then 'staff'
      when b.id is not null then 'business'
      else 'person'
    end,
    b.business_name,
    nullif(trim(t.full_name), ''),
    -- A business logo is already public. A person's only photograph is their
    -- verification selfie, which is private and stays that way.
    b.logo_url,
    b.category,
    b.area,
    b.verified_at,
    t.created_at,
    (select count(*)::integer from public.storefronts sf
      where sf.vendor_id = t.id and sf.archived_at is null),
    b.rating_avg,
    b.rating_count,
    (select requirements from checks),
    (select credentials from creds),
    now()
  from target t
  left join biz b on true
  left join stu s on true
  left join rid r on true
  union all
  -- No such code. One row, so the page has the same shape to render and a bad
  -- scan says "not a valid card" instead of throwing.
  select false, 'unknown', 'person', null, null, null, null, null, null, null,
         0, null, 0, '[]'::jsonb, '[]'::jsonb, now()
  where not exists (select 1 from target);
$fn$;

-- anon INCLUDED, deliberately: the person checking a rider at their gate has no
-- Sync account and should not need one.
revoke all on function public.verify_card(text) from public;
grant execute on function public.verify_card(text) to anon, authenticated, service_role;

comment on function public.verify_card(text) is
  'Public card lookup for ANY account - business, student, rider, organiser or staff. Fetched live so a suspended account reads as suspended on a card already printed.';
