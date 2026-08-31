-- ============================================================================
-- withdrawal_messages
--
-- `request_withdrawal` refused an over-balance request with:
--
--   "You have 35900 available, not 35900"
--
-- Both numbers are the same. `amount_kobo / 100` is integer division on two
-- bigints, so the kobo are truncated away and any two amounts less than ₦1
-- apart print identically. The refusal was correct; the sentence explaining it
-- was self-contradictory, which is worse than no sentence — it reads as broken
-- software at the exact moment somebody is trying to take their money out.
--
-- Amounts are now formatted to two decimal places with thousands separators,
-- so ₦35,900.00 and ₦35,900.01 are visibly different and a naira figure looks
-- like a naira figure.
--
-- Only the three RAISE messages change; every check is byte-for-byte the one
-- verified in 20260830110000.
--
-- ROLLBACK
--   Re-run 20260830110000_withdrawals.sql.
-- ============================================================================

-- Kobo to a readable naira string. Divides as numeric, not bigint: `/ 100` on
-- two bigints is integer division, which is the whole bug.
create or replace function public.naira(p_kobo bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select '₦' || to_char(coalesce(p_kobo, 0) / 100.0, 'FM999,999,999,990.00');
$$;
grant execute on function public.naira(bigint) to anon, authenticated, service_role;
comment on function public.naira(bigint) is
  'Kobo as a naira string, two decimals. Exists because bigint/100 silently truncates the kobo and made two different amounts print identically.';
create or replace function public.request_withdrawal(
  p_amount_kobo     bigint,
  p_bank_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := (select auth.uid());
  v_wallet  public.wallets%rowtype;
  v_bank    public.bank_accounts%rowtype;
  v_min     bigint := private.setting_int('min_withdrawal_kobo', 100000)::bigint;
  v_request uuid;
  v_ref     text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_wallet from public.wallets where owner_id = v_uid for update;
  if not found then
    raise exception 'You do not have a wallet yet' using errcode = 'P0002';
  end if;
  if v_wallet.is_frozen then
    raise exception 'This wallet is frozen: %', coalesce(v_wallet.frozen_reason, 'contact support')
      using errcode = 'P0001';
  end if;

  if p_amount_kobo is null or p_amount_kobo < v_min then
    raise exception 'The smallest withdrawal is %', public.naira(v_min)
      using errcode = 'P0001';
  end if;

  if p_amount_kobo > v_wallet.balance_kobo then
    raise exception 'You have % available, and asked for %',
      public.naira(v_wallet.balance_kobo), public.naira(p_amount_kobo)
      using errcode = 'P0001';
  end if;

  select * into v_bank from public.bank_accounts
   where id = p_bank_account_id and owner_id = v_uid;
  if not found then
    raise exception 'That payout account is not yours' using errcode = '42501';
  end if;
  if not v_bank.is_verified then
    raise exception 'Confirm this account with your bank before withdrawing to it'
      using errcode = 'P0001';
  end if;

  insert into public.payout_requests (owner_id, bank_account_id, amount_kobo)
  values (v_uid, p_bank_account_id, p_amount_kobo)
  returning id into v_request;

  v_ref := 'PAYOUT_' || v_request::text;

  perform private.post_transaction(
    'wallet_withdrawal',
    'Withdrawal to ' || v_bank.bank_name || ' ' || right(v_bank.account_number, 4),
    jsonb_build_array(
      jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet.id,
                         'amount_kobo', -p_amount_kobo),
      jsonb_build_object('account', 'payment_gateway', 'amount_kobo', p_amount_kobo)
    ),
    v_ref
  );

  return v_request;
end;
$fn$;
grant execute on function public.request_withdrawal(bigint, uuid) to authenticated;
