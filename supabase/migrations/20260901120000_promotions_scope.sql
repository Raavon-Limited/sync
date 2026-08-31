-- ============================================================================
-- promotions_scope
--
-- A fifth thing an owner can hand to somebody they invited: promotions.
--
-- WHY THIS IS ITS OWN MIGRATION AND NOT AN EDIT TO 20260901090000
--   That file had already run. A migration is a record of what happened to a
--   database, so editing an applied one changes the repo and nothing else —
--   the scope list in `private.storefront_scope_names()` would still have four
--   entries in every environment that ran it, and `create_storefront_invite`
--   would keep refusing with "Unknown section: promotions" while the code said
--   it was supported. Which is exactly what it did.
--
-- 'promotions' IS THE ONE SCOPE THAT IS NOT PER STORE
--   `promotions.vendor_id` references `vendor_profiles` — a campaign belongs to
--   the BUSINESS, not to a location, so there is no such thing as a Tanke-only
--   discount today. Granting this at one store therefore lets that person
--   create a discount every store honours. That is a real consequence and the
--   picker says "all your stores" on the row because of it.
--
--   Making it per store instead would mean a `storefront_id` on `promotions`
--   and a checkout that knows which campaigns a store honours — a different
--   migration, and the README already lists it as not in scope yet.
--
-- WHAT IT STILL CANNOT REACH
--   Money. Wallets, payouts, bank accounts and the subscription are brand-wide
--   too, and they stay owner-only. The boundary that protects them is that no
--   store-derived grant reaches them, so `business_scope` below is used by
--   exactly one policy and must stay that way. A discount is a price change,
--   not a withdrawal.
--
-- EXISTING STAFF DO NOT GET IT.
--   The column default set in 20260901090000 was the four store scopes, which
--   is what everyone already hired holds. Adding 'promotions' to that default
--   now would silently widen every current manager's access on deploy — a
--   widening dressed up as a migration. The owner grants it deliberately or
--   not at all.
--
-- ROLLBACK
--   drop policy if exists "promotions_write_own" on public.promotions;
--   create policy "promotions_write_own" on public.promotions
--     for all to authenticated
--     using ((select auth.uid()) = vendor_id)
--     with check ((select auth.uid()) = vendor_id);
--   drop function if exists private.business_scope(uuid, uuid, text);
--   -- then restore storefront_scope_names() and both scope CHECKs to the
--   -- four-name versions in 20260901090000.
-- ============================================================================

-- ── 1. Widen the vocabulary ─────────────────────────────────────────────────
create or replace function private.storefront_scope_names()
returns text[]
language sql
immutable
set search_path = ''
as $fn$ select array['orders', 'listings', 'inbox', 'store', 'promotions']::text[] $fn$;

-- The CHECKs are spelled out rather than calling the function above: a CHECK
-- that depends on a function has to be dropped to be changed, and pg_dump has
-- to reload the two in the right order. The function stays the one definition
-- the RPCs validate against.
alter table public.storefront_staff
  drop constraint if exists storefront_staff_scopes_check,
  add  constraint storefront_staff_scopes_check
       check (cardinality(scopes) > 0
              and scopes <@ array['orders', 'listings', 'inbox', 'store', 'promotions']::text[]);

alter table public.storefront_invites
  drop constraint if exists storefront_invites_scopes_check,
  add  constraint storefront_invites_scopes_check
       check (cardinality(scopes) > 0
              and scopes <@ array['orders', 'listings', 'inbox', 'store', 'promotions']::text[]);

-- ── 2. The brand-level permission question ──────────────────────────────────
-- The sibling of private.storefront_scope(): "may you do this ANYWHERE for
-- this business?" It exists because a campaign has no store to belong to, so
-- a policy on `promotions` has no `storefront_id` to pass.
--
-- SECURITY DEFINER for the same reason as its sibling: a policy has to ask the
-- question without the caller being able to read `storefront_staff` rows they
-- do not own.
create or replace function private.business_scope(
  p_vendor uuid,
  p_user   uuid,
  p_scope  text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select p_vendor = p_user
      or exists (
           select 1
             from public.storefront_staff st
             join public.storefronts s on s.id = st.storefront_id
            where st.user_id     = p_user
              and st.revoked_at  is null
              and s.vendor_id    = p_vendor
              -- Staff of an archived store keep nothing. Their membership row
              -- survives for the audit trail, not as a live grant.
              and s.archived_at  is null
              and p_scope = any (st.scopes)
         );
$fn$;

grant execute on function private.business_scope(uuid, uuid, text) to authenticated, service_role;

comment on function private.business_scope(uuid, uuid, text) is
  'Whether a user may do something brand-wide for a business: the owner, or staff granted that scope at any of its stores. For promotions only — money tables must never consult it.';

-- ── 3. Let the grant actually open something ────────────────────────────────
-- The public read policy (live campaigns, visible to shoppers) is untouched.
drop policy if exists "promotions_write_own" on public.promotions;
create policy "promotions_write_own" on public.promotions
  for all to authenticated
  using       (private.business_scope(vendor_id, (select auth.uid()), 'promotions'))
  with check  (private.business_scope(vendor_id, (select auth.uid()), 'promotions'));

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not ('promotions' = any (private.storefront_scope_names())) then
    raise exception 'promotions missing from the scope vocabulary';
  end if;

  if to_regprocedure('private.business_scope(uuid, uuid, text)') is null then
    raise exception 'business_scope missing';
  end if;

  -- The CHECK has to admit the new name, or create_storefront_invite would
  -- pass its own validation and then fail on insert.
  if not exists (
    select 1
      from pg_constraint c
      join pg_class     t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'storefront_invites'
       and c.conname = 'storefront_invites_scopes_check'
       and pg_get_constraintdef(c.oid) like '%promotions%'
  ) then
    raise exception 'invite scopes CHECK still refuses promotions';
  end if;
end $$;
