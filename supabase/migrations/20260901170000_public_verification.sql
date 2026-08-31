-- ============================================================================
-- public_verification
--
-- The lookup behind the QR code on a vendor's ID card: anybody, signed in or
-- not, can point a phone at a card and be told what Sync currently says about
-- that business.
--
-- THE CODE ENCODES A URL, NOT A STATUS — AND THAT IS THE ENTIRE DESIGN.
--   A QR that carried "VERIFIED: Raavon Limited" would be a claim printed by
--   the person making it. It would still say VERIFIED after the account was
--   suspended, it would still say VERIFIED on a card photocopied by somebody
--   else, and nothing about scanning it would be a check. What the code
--   carries is `/v/<slug>`, and the answer is fetched live from here every
--   time. Suspend an account at 11:00 and the card scans as suspended at
--   11:00 — with the vendor's printed card unchanged in their hand.
--
--   That is also why there is no offline mode and no cached answer. A stale
--   yes is worse than no answer at all.
--
-- WHAT IS RETURNED IS ALREADY PUBLIC. Business name, slug, category, area,
-- logo, rating and verification state are all on the storefront page a
-- signed-out visitor can read today. Nothing here adds an email, a phone, a
-- document or an owner id — a credential check answers "is this business real
-- and in good standing", not "tell me about the person".
--
-- SUSPENDED OUTRANKS VERIFIED. `archived_at` on either the business or the
-- account means the answer is "suspended", regardless of what
-- `verification_status` still says — a suspended account keeps its old status
-- column, and reporting that would have the card vouching for somebody who
-- has been removed.
--
-- NOT FOUND IS AN ANSWER, NOT AN ERROR. An unknown slug returns a row with
-- `state = 'unknown'` rather than raising, so a scan of a forged or mistyped
-- code renders "no such business" instead of a 500 that reads like a bug.
--
-- ROLLBACK
--   drop function if exists public.verify_business(text);
-- ============================================================================

create or replace function public.verify_business(p_slug text)
returns table (
  found          boolean,
  -- 'verified' | 'pending' | 'unverified' | 'rejected' | 'suspended' | 'unknown'
  state          text,
  business_name  text,
  slug           text,
  category       text,
  area           text,
  logo_url       text,
  verified_at    timestamptz,
  member_since   timestamptz,
  store_count    integer,
  rating_avg     numeric,
  rating_count   integer,
  -- When the answer was produced. Printed on the page so a screenshot of a
  -- verification is visibly a screenshot of a moment, not a standing fact.
  checked_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with target as (
    select vp.*, p.archived_at as account_archived_at
      from public.vendor_profiles vp
      left join public.profiles p on p.id = vp.id
     where lower(vp.slug) = lower(trim(coalesce(p_slug, '')))
     limit 1
  )
  select
    true,
    case
      -- Order matters: suspension is checked before status, so a removed
      -- account cannot present its last good verification.
      when t.archived_at is not null or t.account_archived_at is not null then 'suspended'
      when t.verification_status = 'verified' then 'verified'
      when t.verification_status = 'pending'  then 'pending'
      when t.verification_status = 'rejected' then 'rejected'
      else 'unverified'
    end,
    t.business_name,
    t.slug,
    t.category,
    t.area,
    t.logo_url,
    t.verified_at,
    t.created_at,
    (select count(*)::integer from public.storefronts s
      where s.vendor_id = t.id and s.archived_at is null),
    t.rating_avg,
    t.rating_count,
    now()
  from target t
  union all
  -- No such slug. One row, so every caller has the same shape to render.
  select false, 'unknown', null, trim(coalesce(p_slug, '')), null, null, null,
         null, null, 0, null, 0, now()
  where not exists (select 1 from target);
$fn$;
-- anon INCLUDED, deliberately: the entire point is that a stranger with a
-- phone and no Sync account can check a card.
revoke all on function public.verify_business(text) from public;
grant execute on function public.verify_business(text) to anon, authenticated, service_role;
comment on function public.verify_business(text) is
  'Live verification lookup for the QR code on a vendor ID card. Public by design — returns only what the storefront page already shows. Suspension outranks verification status.';
-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_state text;
begin
  if to_regprocedure('public.verify_business(text)') is null then
    raise exception 'verify_business missing';
  end if;

  -- A slug that cannot exist must come back as one 'unknown' row, not as zero
  -- rows: the page renders `rows[0]` and would otherwise crash on a bad scan.
  select state into v_state
    from public.verify_business('__no_such_business_slug__');

  if v_state is distinct from 'unknown' then
    raise exception 'verify_business does not answer for an unknown slug';
  end if;
end $$;
