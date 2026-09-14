-- ============================================================================
-- tenancy_terms_consent
--
-- TWO THINGS, AND THE SECOND IS THE POINT OF THE FIRST.
--
-- 1. A LANDLORD MAY HAVE THEIR OWN AGREEMENT.
--    Sync generates a tenancy agreement from what the two parties actually did,
--    which is honest and is not what every landlord uses. Plenty have a
--    document of their own - house terms, a deposit clause, a solicitor's
--    lease - and there was nowhere to put it, so it was being handed over on
--    paper or over WhatsApp and Sync's record of the tenancy was incomplete.
--
-- 2. THE STUDENT AGREES BEFORE THEY PAY, NOT AFTER.
--    Paying was the only act, and it silently stood in for agreement to terms
--    the student may never have opened. That is the wrong order: consent to the
--    terms has to be a separate, recorded act that happens FIRST, or the
--    agreement is something we assert they accepted rather than something they
--    did.
--
-- ENFORCED BY A TRIGGER, NOT BY THE PAY FUNCTION
--    `pay_booking_from_wallet` is a money function that recomputes the price,
--    checks the hold, debits a wallet and opens escrow in one transaction.
--    Reproducing its body to add one line is how a rewrite silently drops one
--    of the others - this schema has lost a line that way twice before (see
--    20260910210000). A BEFORE UPDATE trigger refusing the move to `confirmed`
--    without consent is additive, cannot damage what is already there, and
--    covers every future path to `confirmed` as well as the current one.
--
-- CONSENT IS TO A VERSION, NOT TO A CHECKBOX
--    `agreement_version` is stamped at acceptance from the hostel's document -
--    its uploaded-at timestamp, or 'sync-standard' when there is none. A
--    landlord who replaces their agreement after somebody agreed to the old one
--    has not obtained consent to the new one, and without recording which was
--    shown there is no way to tell afterwards.
--
-- ROLLBACK
--   drop trigger if exists bookings_require_terms on public.bookings;
--   drop function if exists private.require_terms_before_confirm();
--   drop function if exists public.accept_tenancy_terms(uuid);
--   alter table public.bookings drop column if exists agreement_accepted_at,
--     drop column if exists agreement_version;
--   alter table public.hostels drop column if exists agreement_url,
--     drop column if exists agreement_uploaded_at;
-- ============================================================================

alter table public.hostels
  add column if not exists agreement_url         text,
  add column if not exists agreement_uploaded_at timestamptz;

comment on column public.hostels.agreement_url is
  'The landlord''s own tenancy agreement, if they have one. Shown alongside Sync''s generated agreement and covered by the same consent.';

alter table public.bookings
  add column if not exists agreement_accepted_at timestamptz,
  add column if not exists agreement_version     text;

comment on column public.bookings.agreement_accepted_at is
  'When the student accepted the tenancy terms. Required before the booking can reach `confirmed` - see private.require_terms_before_confirm.';

-- ── Accepting ───────────────────────────────────────────────────────────────
create or replace function public.accept_tenancy_terms(p_booking uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_b       public.bookings%rowtype;
  v_version text;
  v_when    timestamptz;
begin
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'no such booking' using errcode = 'P0002';
  end if;

  -- The tenant, and nobody else. A landlord accepting terms on their tenant's
  -- behalf is the exact thing this record exists to make impossible.
  if v_b.student_id is distinct from (select auth.uid()) then
    raise exception 'That is not your booking' using errcode = '42501';
  end if;

  -- Which document they were shown. See the header on versions.
  select case
           when h.agreement_url is null then 'sync-standard'
           else 'landlord:' || coalesce(to_char(h.agreement_uploaded_at, 'YYYY-MM-DD"T"HH24:MI:SSOF'), 'unknown')
         end
    into v_version
    from public.hostels h where h.id = v_b.hostel_id;

  -- Idempotent: re-accepting keeps the ORIGINAL moment. When they agreed is a
  -- fact about the past and a second press must not rewrite it.
  update public.bookings
     set agreement_accepted_at = coalesce(agreement_accepted_at, now()),
         agreement_version     = coalesce(agreement_version, v_version),
         updated_at            = now()
   where id = p_booking
  returning agreement_accepted_at into v_when;

  return v_when;
end;
$fn$;

revoke all on function public.accept_tenancy_terms(uuid) from public, anon;

grant execute on function public.accept_tenancy_terms(uuid) to authenticated, service_role;

comment on function public.accept_tenancy_terms is
  'The student agrees to the tenancy terms. Must happen before payment; the version shown is stamped so a later change to the landlord''s document cannot be passed off as agreed.';

-- ── Enforcing ───────────────────────────────────────────────────────────────
create or replace function private.require_terms_before_confirm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Only the transition into `confirmed`, which is the moment money has moved
  -- and the tenancy becomes real.
  if new.status = 'confirmed'
     and old.status is distinct from 'confirmed'
     and new.agreement_accepted_at is null then
    raise exception 'The tenancy terms have to be accepted before this booking can be paid for.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;

-- Alphabetically after `bookings_guard_privileged` and before
-- `bookings_set_end_date` / `bookings_sync_hold`, which is the order this table
-- already relies on. Refusing here aborts the payment transaction whole - the
-- wallet is not debited and no escrow row survives.
drop trigger if exists bookings_require_terms on public.bookings;

create trigger bookings_require_terms
  before update on public.bookings
  for each row execute function private.require_terms_before_confirm();

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Tenancies that were already paid for predate this rule. Marking them agreed
-- at their payment time is the honest reading: paying WAS the only act
-- available, and refusing to let existing tenancies be touched again would
-- break move-in confirmation for every one of them.
update public.bookings
   set agreement_accepted_at = coalesce(agreement_accepted_at, paid_at),
       agreement_version     = coalesce(agreement_version, 'pre-consent')
 where status = 'confirmed' and paid_at is not null and agreement_accepted_at is null;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $verify$
declare
  v_src text;
  v_cnt bigint;
begin
  if to_regprocedure('public.accept_tenancy_terms(uuid)') is null then
    raise exception 'accept_tenancy_terms missing';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'bookings_require_terms' and not tgisinternal
  ) then
    raise exception 'bookings_require_terms trigger missing';
  end if;

  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'require_terms_before_confirm';

  -- The whole point: no consent, no confirmation. A rewrite that drops this
  -- lets payment stand in for agreement again, silently.
  if position('agreement_accepted_at is null' in v_src) = 0 then
    raise exception 'require_terms_before_confirm no longer checks for consent';
  end if;

  -- Only the tenant may accept.
  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'accept_tenancy_terms';
  if position('That is not your booking' in v_src) = 0 then
    raise exception 'accept_tenancy_terms would let somebody consent on a tenant''s behalf';
  end if;

  -- Re-accepting must not move the recorded moment.
  if position('coalesce(agreement_accepted_at, now())' in v_src) = 0 then
    raise exception 'accept_tenancy_terms overwrites when consent was given';
  end if;

  -- No paid tenancy should have been left unable to move on.
  select count(*) into v_cnt from public.bookings
   where status = 'confirmed' and paid_at is not null and agreement_accepted_at is null;
  if v_cnt > 0 then
    raise exception '% paid tenancies would now be stuck', v_cnt;
  end if;
end;
$verify$;
