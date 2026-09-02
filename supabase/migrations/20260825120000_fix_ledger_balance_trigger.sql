-- ============================================================================
-- fix_ledger_balance_trigger
--
-- NO MONEY COULD BE POSTED. AT ALL. BY ANYONE.
--
--   select credit_wallet_topup(...)  ->  permission denied for table ledger_entries
--
-- WHY
--   `private.post_transaction` is SECURITY DEFINER, so its inserts into
--   private.ledger_entries succeed. But the balance check is a CONSTRAINT
--   TRIGGER declared DEFERRABLE INITIALLY DEFERRED:
--
--     create constraint trigger ledger_entries_balanced
--       deferrable initially deferred
--       for each row execute function private.assert_ledger_balanced();
--
--   A deferred trigger fires at COMMIT   after post_transaction has returned,
--   outside its definer context. And `assert_ledger_balanced` was declared
--   plain `language plpgsql`, no SECURITY DEFINER, so at commit it runs with
--   the CALLER's privileges. The caller is service_role over PostgREST, which
--   has no SELECT on private.ledger_entries. The check that exists to protect
--   the ledger was the thing rejecting every write to it.
--
--   The deferral is correct and stays: a non-deferred check would reject the
--   first line of every transaction, because one line alone never balances.
--   `private.sync_wallet_balance` next to it is already SECURITY DEFINER, which
--   is why the cache maintenance was never the thing that failed.
--
-- WHY THIS WENT UNNOTICED
--   Nothing had ever called post_transaction. The escrow rows created at
--   checkout are plain inserts into public.escrow_holds; the ledger itself had
--   never been written to, so the whole money layer was untested until a wallet
--   top-up tried to use it.
--
-- SECURITY NOTE
--   SECURITY DEFINER here is not a widening. The function reads one column of
--   one table, filtered to the transaction being committed, and either returns
--   null or raises. It exposes nothing to the caller.
--
-- ROLLBACK
--   Restore the definition from 20260817090300_money_ledger.sql (note that it
--   is the broken version).
-- ============================================================================

create or replace function private.assert_ledger_balanced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  imbalance bigint;
begin
  select coalesce(sum(amount_kobo), 0) into imbalance
    from private.ledger_entries
   where transaction_id = coalesce(new.transaction_id, old.transaction_id);

  if imbalance <> 0 then
    raise exception
      'ledger transaction % does not balance: % kobo unaccounted for',
      coalesce(new.transaction_id, old.transaction_id), imbalance;
  end if;
  return null;
end;
$fn$;
