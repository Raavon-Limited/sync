-- ============================================================================
-- rider_fleet_and_dispatch
--
-- Riders have had a backend since 20260817090200 and no way in. rider_profiles,
-- deliveries, delivery_offers and active_delivery_positions are all here and
-- correct; nothing has ever written to them, because no screen exists. This
-- migration adds the three things the screens need that the schema does not
-- already have, and nothing else.
--
-- 1. LOGISTICS COMPANIES
--   A rider is either independent or employed by exactly one company. That is
--   one nullable column on rider_profiles, not a join table: with a join table,
--   "which company earned this delivery" stops having a single answer, and
--   every payout query has to pick one. If multi-fleet riders are ever needed,
--   the join table can be added then and this column becomes its default.
--
--   A company's documents hang off its OWNER's profile, because
--   verification_documents.owner_id references profiles and a company is owned
--   by a person. A person who runs a fleet AND sells food therefore shares one
--   document folder across both. That is a real limitation and it is the right
--   trade for now: splitting the folder means a polymorphic owner, which this
--   schema has deliberately avoided everywhere else.
--
-- 2. BLOCK AND SUSPENSION PARITY
--   vendor_profiles got verification_blocked_at in 20260901260000. Riders never
--   did, so a rider caught with a forged licence could be rejected and
--   re-apply the same afternoon. The columns are added here on the same terms.
--
--   Suspension is a SEPARATE fact from verification, and deliberately so. A
--   verified vendor who starts behaving badly is not "unverified" - their
--   papers are still real. Suspension freezes trading while leaving the account
--   readable, which is what makes it reversible and what makes it explainable
--   to the person on the other end.
--
-- 3. AN OPEN BOARD, NOT WIDER RLS
--   Riders pick their own jobs, so they must see unclaimed ones. The obvious
--   move - loosening deliveries_select_party - is the wrong one: that policy is
--   what stops a rider reading every student's home address on the platform.
--   The board is a SECURITY DEFINER function returning a REDACTED row instead:
--   pickup, distance and fee, which is everything needed to decide whether to
--   take a job, and no dropoff address until the rider has actually claimed it.
--
-- ROLLBACK
--   drop function if exists public.claim_delivery(uuid);
--   drop function if exists public.open_delivery_board(integer);
--   drop function if exists public.set_account_suspension(uuid, boolean, text);
--   drop function if exists public.set_company_verification(uuid, text, boolean);
--   drop function if exists public.set_rider_verification(uuid, text, boolean);
--   drop function if exists public.set_rider_company(uuid, uuid);
--   drop function if exists public.is_suspended(uuid);
--   alter table public.rider_profiles
--     drop column if exists company_id,
--     drop column if exists verification_blocked_at,
--     drop column if exists verification_blocked_reason;
--   alter table public.profiles
--     drop column if exists suspended_at,
--     drop column if exists suspended_reason,
--     drop column if exists suspended_by;
--   drop table if exists public.logistics_companies;
--   -- and restore guard_rider_profile_cols / guard_profile_privileged_cols
--   -- from 20260817090000 and 0001 respectively.
-- ============================================================================

-- ── 1. Logistics companies ──────────────────────────────────────────────────
create table if not exists public.logistics_companies (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete cascade,
  name                text not null,
  slug                text not null unique,
  -- Same four values as vendor_profiles and rider_profiles. A fifth value here
  -- would mean every status switch in the app needs a company-shaped branch.
  verification_status text not null default 'unverified'
                        check (verification_status in
                          ('unverified', 'pending', 'verified', 'rejected')),
  verified_at         timestamptz,
  verification_blocked_at     timestamptz,
  verification_blocked_reason text,
  contact_phone       text,
  contact_email       text,
  business_address    text,
  campus_id           uuid references public.campuses (id) on delete set null,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One live company per owner. A second is almost always a mis-click in
-- onboarding, and two companies owned by one person with riders split between
-- them makes payouts ambiguous for no gain.
create unique index if not exists logistics_companies_one_per_owner_idx
  on public.logistics_companies (owner_id) where archived_at is null;

create index if not exists logistics_companies_status_idx
  on public.logistics_companies (verification_status) where archived_at is null;

comment on table public.logistics_companies is
  'A fleet operator running deliveries on Sync. Its riders are rider_profiles rows with company_id set. Verification documents hang off the OWNER''s profile.';

-- ── 2. Rider columns ────────────────────────────────────────────────────────
alter table public.rider_profiles
  add column if not exists company_id uuid
    -- The company folding must not delete the person. They become an
    -- independent rider and keep their history, ratings and wallet.
    references public.logistics_companies (id) on delete set null,
  add column if not exists verification_blocked_at     timestamptz,
  add column if not exists verification_blocked_reason text;

create index if not exists rider_profiles_company_idx
  on public.rider_profiles (company_id) where archived_at is null;

comment on column public.rider_profiles.company_id is
  'The fleet this rider works for, or null for an independent rider. Set only by set_rider_company - never by the rider directly.';

comment on column public.rider_profiles.verification_blocked_at is
  'Set on a permanent (fraud) rejection. Cleared by any later decision. Mirrors vendor_profiles.';

-- ── 3. Suspension, on profiles ──────────────────────────────────────────────
-- On profiles rather than on each role table: a person suspended for fraud as a
-- vendor must not be able to keep taking deliveries as a rider. One person, one
-- suspension.
alter table public.profiles
  add column if not exists suspended_at     timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists suspended_by     uuid references public.profiles (id) on delete set null;

create index if not exists profiles_suspended_idx
  on public.profiles (suspended_at) where suspended_at is not null;

comment on column public.profiles.suspended_at is
  'Trading is frozen while set: no claiming deliveries, no new orders, no withdrawals. The account still logs in and reads its own history - that is the point of it being distinct from a block.';

-- ── 4. The guards have to cover the new columns ─────────────────────────────
-- Every column added above is decided by staff. Without these, a client can
-- PATCH its own row and lift its own suspension, which would make all of it
-- decorative.
create or replace function public.guard_profile_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.role := old.role;
    new.verification_status := old.verification_status;
    -- A self-service unsuspend is not a suspension.
    new.suspended_at     := old.suspended_at;
    new.suspended_reason := old.suspended_reason;
    new.suspended_by     := old.suspended_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_rider_profile_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.verification_status := old.verification_status;
    new.rating_avg          := old.rating_avg;
    new.rating_count        := old.rating_count;
    new.deliveries_count    := old.deliveries_count;
    new.verification_blocked_at     := old.verification_blocked_at;
    new.verification_blocked_reason := old.verification_blocked_reason;
    -- Employment is agreed between a rider and a fleet, not declared by the
    -- rider. set_rider_company is the only door.
    new.company_id := old.company_id;
  end if;
  return new;
end;
$$;

-- ── 5. Is this person frozen? ───────────────────────────────────────────────
create or replace function public.is_suspended(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = p_user and suspended_at is not null
  );
$$;

revoke all on function public.is_suspended(uuid) from public, anon;
grant execute on function public.is_suspended(uuid) to authenticated, service_role;

-- ── 6. Staff decisions ──────────────────────────────────────────────────────
-- Deliberately a separate function from set_verification_status rather than a
-- polymorphic one taking an entity type: the two write different tables with
-- different guards, and a single function switching on a text argument is how
-- the wrong table gets written when someone adds a third kind.
create or replace function public.set_rider_verification(
  p_rider     uuid,
  p_status    text,
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
    from public.rider_profiles
   where id = p_rider
     for update;

  if not found then
    raise exception 'no such rider' using errcode = 'P0002';
  end if;

  -- Same rule as businesses: a rider carries other people's food and other
  -- people's money. Verifying one whose documents nobody approved is exactly
  -- the failure this check exists to prevent.
  if p_status = 'verified' then
    select count(*) into v_approved
      from public.verification_documents
     where owner_id = p_rider and status = 'approved';

    if v_approved = 0 then
      raise exception
        'This rider has no approved documents. Review their uploads before verifying.'
        using errcode = 'P0001';
    end if;
  end if;

  update public.rider_profiles
     set verification_status = p_status,
         verification_blocked_at =
           case when p_permanent then now() else null end,
         verification_blocked_reason =
           case when p_permanent
                then 'A reviewer found this submission fraudulent. Contact support@letsyncyou.com.'
                else null end,
         -- A rider who is no longer verified must not stay on the dispatch
         -- index waiting for a job they can no longer legally take.
         is_online  = case when p_status = 'verified' then is_online else false end,
         updated_at = now()
   where id = p_rider;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'staff', 'verification.decided', 'rider_profile', p_rider::text,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status, 'permanent', p_permanent));

  return p_status;
end;
$fn$;

revoke all on function public.set_rider_verification(uuid, text, boolean) from public, anon;
grant execute on function public.set_rider_verification(uuid, text, boolean)
  to authenticated, service_role;

comment on function public.set_rider_verification is
  'The only path to a verified rider. Staff only, audited, refuses to verify a rider with no approved documents. p_permanent blocks re-application for fraud.';

-- A fleet is verified on its own papers - CAC, insurance, an address that
-- exists - and its riders are verified on theirs. Neither implies the other: a
-- real company can still hire someone with a forged licence.
create or replace function public.set_company_verification(
  p_company   uuid,
  p_status    text,
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
  v_owner    uuid;
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

  select verification_status, owner_id into v_old, v_owner
    from public.logistics_companies
   where id = p_company
     for update;

  if not found then
    raise exception 'no such company' using errcode = 'P0002';
  end if;

  -- The company's documents live on the OWNER's profile, so that is where the
  -- approved-document check has to look.
  if p_status = 'verified' then
    select count(*) into v_approved
      from public.verification_documents
     where owner_id = v_owner and status = 'approved';

    if v_approved = 0 then
      raise exception
        'This company has no approved documents. Review their uploads before verifying.'
        using errcode = 'P0001';
    end if;
  end if;

  update public.logistics_companies
     set verification_status = p_status,
         verified_at = case when p_status = 'verified' then now() else null end,
         verification_blocked_at =
           case when p_permanent then now() else null end,
         verification_blocked_reason =
           case when p_permanent
                then 'A reviewer found this submission fraudulent. Contact support@letsyncyou.com.'
                else null end,
         updated_at = now()
   where id = p_company;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'staff', 'verification.decided', 'logistics_company', p_company::text,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status, 'permanent', p_permanent));

  return p_status;
end;
$fn$;

revoke all on function public.set_company_verification(uuid, text, boolean) from public, anon;
grant execute on function public.set_company_verification(uuid, text, boolean)
  to authenticated, service_role;

comment on function public.set_company_verification is
  'The only path to a verified logistics company. Staff only, audited. Checks documents on the owner''s profile, since that is where a company''s folder lives.';

create or replace function public.set_account_suspension(
  p_user      uuid,
  p_suspended boolean,
  p_reason    text default null
)
returns boolean
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

  if not public.is_staff() then
    raise exception 'Only Sync staff can suspend an account' using errcode = '42501';
  end if;

  -- A reason is not paperwork. It is what support reads back to the person
  -- asking why they cannot take orders, and an unexplained suspension is
  -- indistinguishable from a bug to everyone who has to deal with it.
  if p_suspended and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why this account is being suspended' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'no such account' using errcode = 'P0002';
  end if;

  update public.profiles
     set suspended_at     = case when p_suspended then now() else null end,
         suspended_reason = case when p_suspended then btrim(p_reason) else null end,
         suspended_by     = case when p_suspended then v_uid else null end,
         updated_at       = now()
   where id = p_user;

  -- Taking them off the dispatch index immediately. Leaving a suspended rider
  -- "online" means the board keeps offering them work that claim_delivery will
  -- then refuse, which reads as a broken app rather than as a suspension.
  update public.rider_profiles
     set is_online = false, updated_at = now()
   where id = p_user and p_suspended;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'staff',
          case when p_suspended then 'account.suspended' else 'account.reinstated' end,
          'profile', p_user::text,
          jsonb_build_object('suspended', not p_suspended),
          jsonb_build_object('suspended', p_suspended, 'reason', p_reason));

  return p_suspended;
end;
$fn$;

revoke all on function public.set_account_suspension(uuid, boolean, text) from public, anon;
grant execute on function public.set_account_suspension(uuid, boolean, text)
  to authenticated, service_role;

comment on function public.set_account_suspension is
  'Freeze or unfreeze trading for one account. Staff only, audited, requires a reason. Does not touch verification: suspension says "not right now", rejection says "your papers are not real".';

-- ── 7. Employment ───────────────────────────────────────────────────────────
-- Callable by the fleet owner (for their own company) or by staff. Passing null
-- releases the rider back to independent.
create or replace function public.set_rider_company(
  p_rider   uuid,
  p_company uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := (select auth.uid());
  v_owner uuid;
  v_old   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select company_id into v_old from public.rider_profiles where id = p_rider for update;
  if not found then
    raise exception 'no such rider' using errcode = 'P0002';
  end if;

  if p_company is not null then
    select owner_id into v_owner
      from public.logistics_companies
     where id = p_company and archived_at is null;

    if not found then
      raise exception 'no such company' using errcode = 'P0002';
    end if;

    if v_uid <> v_owner and not public.is_staff() then
      raise exception 'Only this company or Sync staff can add a rider to it'
        using errcode = '42501';
    end if;
  else
    -- Releasing a rider: the company they are currently in may do it, and so
    -- may the rider themselves. Nobody is trapped in a fleet.
    select owner_id into v_owner
      from public.logistics_companies where id = v_old;

    if v_uid <> p_rider and v_uid is distinct from v_owner and not public.is_staff() then
      raise exception 'Only this rider, their company, or Sync staff can do that'
        using errcode = '42501';
    end if;
  end if;

  update public.rider_profiles
     set company_id = p_company, updated_at = now()
   where id = p_rider;

  return p_company;
end;
$fn$;

revoke all on function public.set_rider_company(uuid, uuid) from public, anon;
grant execute on function public.set_rider_company(uuid, uuid) to authenticated, service_role;

-- ── 8. The open board ───────────────────────────────────────────────────────
-- REDACTED BY DESIGN. Everything a rider needs to decide on a job is here;
-- the dropoff address is not, because the board is visible to every online
-- rider on the campus and that address belongs to a student who has not yet
-- agreed to share it with any of them. claim_delivery is what unseals it.
create or replace function public.open_delivery_board(p_limit integer default 50)
returns table (
  delivery_id     uuid,
  order_id        uuid,
  vendor_name     text,
  pickup_address  text,
  dropoff_area    text,
  distance_meters integer,
  fee_kobo        bigint,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_campus uuid;
  v_ok     boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select rp.campus_id,
         rp.verification_status = 'verified'
           and rp.archived_at is null
           and not public.is_suspended(v_uid)
    into v_campus, v_ok
    from public.rider_profiles rp
   where rp.id = v_uid;

  -- Not a rider, or not a rider who may work right now. An empty board rather
  -- than an exception: the screen renders the same either way and the reason
  -- belongs in the banner above it, which reads the rider's own row.
  if not found or not coalesce(v_ok, false) then
    return;
  end if;

  return query
    select d.id,
           d.order_id,
           v.business_name,
           d.pickup_address,
           -- Area, not street. A rider needs to know it is a job they can
           -- reach, not where the student sleeps.
           v.area,
           d.distance_meters,
           d.fee_kobo,
           d.created_at
      from public.deliveries d
      join public.orders o          on o.id = d.order_id
      join public.vendor_profiles v on v.id = o.vendor_id
     where d.status = 'pending'
       and d.rider_id is null
       -- A rider with no campus set sees everything; one with a campus sees
       -- their own. Campus is optional on rider_profiles and an unset campus
       -- must not mean an empty board.
       and (v_campus is null or v.campus_id = v_campus)
     order by d.created_at
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$fn$;

revoke all on function public.open_delivery_board(integer) from public, anon;
grant execute on function public.open_delivery_board(integer) to authenticated, service_role;

comment on function public.open_delivery_board is
  'Unclaimed deliveries a rider may take, redacted: no dropoff address until claimed. Returns nothing for anyone who is not a verified, unsuspended rider.';

-- ── 9. Claiming one ─────────────────────────────────────────────────────────
-- The race is settled by delivery_offers_one_accepted_idx, which already
-- exists: a unique partial index on (delivery_id) where status = 'accepted'.
-- The offer row is written FIRST for exactly that reason - the loser of a
-- simultaneous claim is rejected by the database before either transaction has
-- touched deliveries.
create or replace function public.claim_delivery(p_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_rp  public.rider_profiles%rowtype;
  v_d   public.deliveries%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_rp from public.rider_profiles where id = v_uid;
  if not found then
    raise exception 'Only a rider can take a delivery' using errcode = '42501';
  end if;

  if v_rp.verification_status <> 'verified' or v_rp.archived_at is not null then
    raise exception 'Your rider account is not verified yet' using errcode = '42501';
  end if;

  if public.is_suspended(v_uid) then
    raise exception 'Your account is suspended. Contact support@letsyncyou.com.'
      using errcode = '42501';
  end if;

  select * into v_d from public.deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'no such delivery' using errcode = 'P0002';
  end if;

  if v_d.rider_id is not null or v_d.status not in ('pending', 'offered') then
    raise exception 'Somebody already took this one' using errcode = 'P0001';
  end if;

  begin
    insert into public.delivery_offers (delivery_id, rider_id, status, responded_at)
    values (p_delivery_id, v_uid, 'accepted', now())
    on conflict (delivery_id, rider_id)
      -- This rider was already offered the job and is now accepting it. Same
      -- outcome, different route in; the partial unique index still decides
      -- whether they are the one who gets it.
      --
      -- Unqualified table name on purpose: inside ON CONFLICT the existing row
      -- is addressed by the target's bare name, never schema-qualified, even
      -- with search_path set to ''.
      do update set status = 'accepted', responded_at = now()
      where delivery_offers.status = 'offered';
  exception
    when unique_violation then
      raise exception 'Somebody already took this one' using errcode = 'P0001';
  end;

  update public.deliveries
     set rider_id    = v_uid,
         status      = 'assigned',
         assigned_at = now(),
         updated_at  = now()
   where id = p_delivery_id;

  -- Everyone else who was offered it stops seeing it as actionable.
  update public.delivery_offers
     set status = 'expired', responded_at = now()
   where delivery_id = p_delivery_id
     and rider_id <> v_uid
     and status = 'offered';

  return p_delivery_id;
end;
$fn$;

revoke all on function public.claim_delivery(uuid) from public, anon;
grant execute on function public.claim_delivery(uuid) to authenticated, service_role;

comment on function public.claim_delivery is
  'Take an unclaimed delivery. Verified, unsuspended riders only. Concurrent claims are settled by delivery_offers_one_accepted_idx - the loser gets an error, never a half-assigned delivery.';

-- ── 10. RLS on the new table ────────────────────────────────────────────────
alter table public.logistics_companies enable row level security;

-- The fleet owner manages their own company.
drop policy if exists "logistics_companies_own" on public.logistics_companies;
create policy "logistics_companies_own" on public.logistics_companies
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- A rider reads the company that employs them. They cannot write it.
drop policy if exists "logistics_companies_rider_read" on public.logistics_companies;
create policy "logistics_companies_rider_read" on public.logistics_companies
  for select to authenticated
  using (exists (
    select 1 from public.rider_profiles rp
     where rp.id = (select auth.uid()) and rp.company_id = public.logistics_companies.id
  ));

drop policy if exists "logistics_companies_staff" on public.logistics_companies;
create policy "logistics_companies_staff" on public.logistics_companies
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

revoke all on public.logistics_companies from anon;
grant select, insert, update on public.logistics_companies to authenticated;

-- The owner must not be able to verify their own fleet. Same shape as the
-- vendor guard: the status columns are staff-decided, so a client write to
-- them is silently reverted rather than rejected.
create or replace function public.guard_logistics_company_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.verification_status := old.verification_status;
    new.verified_at         := old.verified_at;
    new.verification_blocked_at     := old.verification_blocked_at;
    new.verification_blocked_reason := old.verification_blocked_reason;
    new.owner_id            := old.owner_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists logistics_companies_guard on public.logistics_companies;
create trigger logistics_companies_guard
  before update on public.logistics_companies
  for each row execute function public.guard_logistics_company_cols();
