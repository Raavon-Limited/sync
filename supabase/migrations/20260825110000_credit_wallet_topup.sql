-- ============================================================================
-- credit_wallet_topup
--
-- The Paystack webhook verifies a charge and then… logs it. Its own TODO says
-- "needs the wallet schema" — which has existed since 20260817090300. So a
-- student can complete a real payment and their balance never moves.
--
-- WHY THE WEBHOOK CANNOT DO THIS ITSELF
--   `private.post_transaction` is the only sanctioned way to move money, and
--   `private` is not exposed through PostgREST. The webhook holds the service
--   role but has no route to the function. This is the public doorway, closed
--   to everyone except the service role.
--
-- IDEMPOTENCY IS THE WHOLE POINT
--   Paystack retries. It retries on timeouts, on non-2xx, and sometimes just
--   because. A webhook that credits on every delivery pays a student twice for
--   one payment, and the second credit is indistinguishable from the first.
--
--   `private.ledger_transactions.reference` is UNIQUE, so the reference IS the
--   idempotency key — no separate table, no TTL, no cleanup. A replay finds the
--   existing transaction and returns it unchanged.
--
-- DOUBLE ENTRY, NOT A BALANCE BUMP
--   A top-up moves money from the gateway into the student's wallet:
--       payment_gateway  -amount
--       user_wallet      +amount
--   The balance cache on `wallets` is maintained by the trigger on
--   ledger_entries; nothing here writes it directly, and `guard_wallet_cols`
--   would reject it if it tried.
--
-- ROLLBACK
--   drop function if exists public.credit_wallet_topup(uuid, bigint, text);
-- ============================================================================

create or replace function public.credit_wallet_topup(
  p_user_id     uuid,
  p_amount_kobo bigint,
  p_reference   text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_wallet uuid;
  v_txn    uuid;
begin
  if p_user_id is null or p_reference is null then
    raise exception 'user and reference are required' using errcode = '22023';
  end if;
  -- A zero or negative "credit" is a bug upstream, not a refund. Refunds are
  -- their own kind with their own entries.
  if p_amount_kobo is null or p_amount_kobo <= 0 then
    raise exception 'top-up amount must be positive, got %', p_amount_kobo
      using errcode = '22023';
  end if;

  -- Replay: same reference, same money. Return what already happened.
  select id into v_txn
    from private.ledger_transactions
   where reference = p_reference;
  if v_txn is not null then
    return v_txn;
  end if;

  -- Wallets are created by a trigger on profiles, but a webhook must not fail
  -- because of a signup edge case.
  insert into public.wallets (owner_id) values (p_user_id)
  on conflict (owner_id) do nothing;

  select id into v_wallet from public.wallets where owner_id = p_user_id;
  if v_wallet is null then
    raise exception 'no wallet for user %', p_user_id using errcode = 'P0002';
  end if;

  v_txn := private.post_transaction(
    'wallet_topup',
    'Wallet top-up',
    jsonb_build_array(
      jsonb_build_object('account', 'payment_gateway', 'amount_kobo', -p_amount_kobo),
      jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet, 'amount_kobo', p_amount_kobo)
    ),
    p_reference
  );

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
  values (null, 'system', 'wallet.topup', 'wallet', v_wallet::text,
          jsonb_build_object('amount_kobo', p_amount_kobo, 'reference', p_reference));

  return v_txn;
exception
  -- Two deliveries of the same webhook can race past the SELECT above and both
  -- reach the insert. The unique index settles it; the loser returns the
  -- winner's transaction rather than erroring.
  when unique_violation then
    select id into v_txn from private.ledger_transactions where reference = p_reference;
    return v_txn;
end;
$fn$;

-- Service role ONLY. A client that could call this could mint money.
revoke all on function public.credit_wallet_topup(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.credit_wallet_topup(uuid, bigint, text) to service_role;

comment on function public.credit_wallet_topup is
  'Credits a verified Paystack top-up. Idempotent by reference. Service role only — never expose to clients.';
