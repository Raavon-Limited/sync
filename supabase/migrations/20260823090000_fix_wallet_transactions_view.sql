-- ============================================================================
-- fix_wallet_transactions_view
--
-- WHAT WAS BROKEN
--   public.wallet_transactions was unreadable by every user:
--     ERROR: permission denied for table ledger_entries
--   So the student wallet statement and the vendor earnings statement both
--   threw on load. Confirmed against the live database for two separate
--   accounts.
--
-- WHY
--   The view was declared `with (security_invoker = true)`, which runs it as
--   the CALLER. The caller then needs privileges on the base tables — and the
--   base tables are `private.ledger_entries` and `private.ledger_transactions`,
--   which `authenticated` deliberately cannot read. That is the entire reason
--   they live in `private`.
--
--   The original comment states the intent exactly: "They must not read
--   private.* directly, so this view projects only their own lines." Invoker
--   rights are the one option that cannot deliver that. The mechanism
--   contradicted the goal.
--
--   (The other invoker view in this schema, public.active_delivery_positions,
--   is fine — it reads only public.* tables the caller is granted, so the
--   caller's own RLS is exactly what should apply there. This is not a
--   blanket problem with security_invoker.)
--
-- THE FIX
--   Run the view with its OWNER's rights (the default) so it can read the
--   ledger, and scope it with an EXPLICIT predicate instead of relying on
--   `wallets` RLS — which no longer applies once the view is not invoker.
--   Same discipline as every SECURITY DEFINER function here: when RLS is off,
--   restate the authorisation by hand.
--
-- WHY THE PREDICATE IS WRITTEN THIS WAY
--   `auth.uid() is not null and w.owner_id = auth.uid()` and not
--   `w.owner_id = auth.uid()` alone: if auth.uid() is null the comparison is
--   NULL, which filters everything out today — but the explicit guard makes an
--   anonymous or service-role caller returning ZERO rows an intended property
--   rather than an accident of three-valued logic.
--
--   Nothing server-side reads this view (only modules/payments/queries.ts, from
--   the browser), so scoping it to the signed-in user breaks no caller. Server
--   code that needs the whole ledger should read private.* directly, where it
--   already has rights.
--
-- ROLLBACK
--   Restore the definition from 20260817090300_money_ledger.sql (note that it
--   is the broken version).
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
  e.amount_kobo,
  case when e.amount_kobo >= 0 then 'in' else 'out' end as direction,
  e.created_at
from private.ledger_entries e
join public.wallets w on w.id = e.wallet_id
join private.ledger_transactions t on t.id = e.transaction_id
-- Scoping now lives here, because the view no longer runs as the caller.
where (select auth.uid()) is not null
  and w.owner_id = (select auth.uid());
comment on view public.wallet_transactions is
  'Per-user statement projected from the ledger. Owner rights + an explicit auth.uid() predicate: the base tables are in private and authenticated cannot read them.';
grant select on public.wallet_transactions to authenticated;
