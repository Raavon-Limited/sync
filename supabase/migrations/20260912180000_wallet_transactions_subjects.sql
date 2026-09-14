-- ============================================================================
-- wallet_transactions_subjects
--
-- WHY
--   `public.wallet_transactions` projects `order_id` and nothing else, so a
--   wallet line for rent is a date, an amount and the word "Rent" with no way
--   to reach the booking behind it. That was fine while the view only had to
--   draw a list. It is not enough to issue a receipt, which has to name the
--   hostel, the room, the move-in date and who was paid.
--
--   `private.ledger_transactions` has carried `booking_id` and `request_id`
--   since 20260817090300 alongside `order_id`. They were simply never
--   projected. This adds them.
--
-- THE SCOPING PREDICATE IS THE POINT OF THIS VIEW AND IT IS UNCHANGED
--   `security_invoker = false` plus an explicit `w.owner_id = auth.uid()`.
--   The base tables live in `private` and `authenticated` cannot read them, so
--   the predicate in here is the whole access control - see 20260823090000,
--   which fixed this exact view once already. A rewrite that drops the where
--   clause exposes every user's ledger to every user. The verify block at the
--   bottom asserts it survived.
--
--   Worth knowing when debugging: a service-role probe of this view returns
--   ZERO ROWS no matter what the ledger holds, because service role has no
--   auth.uid(). That reads exactly like "nothing was ever written" and has
--   already sent one investigation down the wrong path.
--
-- ROLLBACK
--   Restore the definition from 20260823090000_fix_wallet_transactions_view.sql.
-- ============================================================================

drop view if exists public.wallet_transactions;

create view public.wallet_transactions
with (security_invoker = false) as
select
  e.id,
  w.owner_id,
  t.kind,
  t.narrative,
  t.reference,
  t.order_id,
  -- New, and the reason for this migration: a receipt has to reach its subject.
  t.booking_id,
  t.request_id,
  e.amount_kobo,
  case when e.amount_kobo >= 0 then 'in' else 'out' end as direction,
  e.created_at
from private.ledger_entries e
join public.wallets w on w.id = e.wallet_id
join private.ledger_transactions t on t.id = e.transaction_id
where (select auth.uid()) is not null
  and w.owner_id = (select auth.uid());

comment on view public.wallet_transactions is
  'Per-user statement projected from the ledger, with the subject ids needed to issue a receipt. Owner rights + an explicit auth.uid() predicate: the base tables are in private and authenticated cannot read them.';

grant select on public.wallet_transactions to authenticated;

/*
 * ANON IS REVOKED EXPLICITLY, AND IT HAD TO BE.
 *
 * The verify block below asserts anon cannot read this view, and on the first
 * push it FAILED - anon really did hold select on it. Supabase ships default
 * privileges on schema `public` that grant to anon and authenticated, so a
 * freshly created view picks up an anon grant nobody wrote. The original
 * 20260823090000 granted only to authenticated and still ended up readable by
 * anon for exactly this reason.
 *
 * No rows were ever exposed: the view's own predicate requires auth.uid() to
 * be non-null, so anon selects returned an empty list. But "the predicate
 * happens to save us" is not the same as "the grant is right", and the next
 * person to touch that where clause would be one edit away from a public
 * ledger. The revoke makes the grant match the intent.
 */
revoke all on public.wallet_transactions from anon;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $verify$
declare
  v_def text;
begin
  select pg_get_viewdef('public.wallet_transactions'::regclass, true) into v_def;

  -- The whole access control. Dropping it exposes every ledger to everybody,
  -- and the view would still look correct in a screenshot.
  if position('auth.uid()' in v_def) = 0 then
    raise exception 'wallet_transactions lost its auth.uid() predicate';
  end if;

  if position('booking_id' in v_def) = 0 or position('request_id' in v_def) = 0 then
    raise exception 'wallet_transactions is missing the subject columns this migration added';
  end if;

  -- security_invoker must stay OFF: the view reads private tables that the
  -- caller has no rights on, so running as the caller would return nothing.
  if exists (
    select 1 from pg_class c
     where c.oid = 'public.wallet_transactions'::regclass
       and c.reloptions::text like '%security_invoker=true%'
  ) then
    raise exception 'wallet_transactions is security_invoker - it will read empty for every user';
  end if;

  -- This is the assertion that caught the default-privilege grant. Keep it:
  -- it fires on a rebuild of this view that forgets the revoke above, which is
  -- every rebuild that copies the original migration.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name = 'wallet_transactions'
       and grantee = 'anon'
  ) then
    raise exception 'wallet_transactions is readable by anon';
  end if;
end;
$verify$;
