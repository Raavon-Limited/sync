-- ============================================================================
-- withdrawals
--
-- Vendors could not take their money out. `WithdrawDialog` was a modal saying
-- "This feature is coming soon" over a disabled button; there was no RPC, no
-- table, and no payout path anywhere. `wallet_withdrawal` and `payout` have
-- been permitted ledger kinds since 20260817090300 and nothing ever wrote one.
--
-- RESERVE ON REQUEST, SETTLE LATER
--   The wallet is debited the moment a withdrawal is requested, not when the
--   bank transfer lands. Money in flight has left the balance: otherwise a
--   vendor with ₦10,000 could request ₦10,000 three times before the first
--   transfer settles, and every one of those requests would look affordable.
--
--   It moves user_wallet -> payment_gateway, the mirror of a top-up. The
--   ledger keeps balancing, `wallets.balance_kobo` is recomputed by the
--   existing trigger, and a failed transfer is a reversal rather than an
--   adjustment nobody can trace.
--
-- A FAILED PAYOUT MUST GIVE THE MONEY BACK
--   `settle_payout` refunds the wallet on failure, in the same transaction
--   that marks the request failed. A payout system whose failure path is a
--   manual correction is a payout system that loses money quietly.
--
-- THE BANK ACCOUNT MUST BE VERIFIED
--   `bank_accounts.is_verified` is set by the Paystack resolve call — the
--   account holder's real name, not a name somebody typed. Paying out to an
--   unverified destination is how money reaches the wrong person and cannot be
--   recalled.
--
-- WHY THERE IS NO PAYSTACK CALL IN HERE
--   A transfer is an external side effect and belongs in a route handler that
--   can retry, not in a function holding a row lock. This creates the request
--   and reserves the money; the transfer and its webhook settle it. A pending
--   request with no transfer is visible and recoverable — a transfer with no
--   request is not.
--
-- ROLLBACK
--   drop function if exists public.settle_payout(uuid, text, text, text);
--   drop function if exists public.request_withdrawal(bigint, uuid);
--   drop table if exists public.payout_requests cascade;
-- ============================================================================

create table if not exists public.payout_requests (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  -- RESTRICT, not cascade: deleting a bank account must not erase the record
  -- of money that was sent to it.
  bank_account_id uuid not null references public.bank_accounts (id) on delete restrict,
  amount_kobo     bigint not null check (amount_kobo > 0),

  status text not null default 'pending' check (status in (
    'pending',     -- reserved, no transfer attempted
    'processing',  -- handed to the payment provider
    'paid',
    'failed',      -- money returned to the wallet
    'cancelled'    -- withdrawn by the vendor before it was sent
  )),

  -- The provider's transfer id, once there is one.
  transfer_code   text,
  failure_reason  text,
  requested_at    timestamptz not null default now(),
  settled_at      timestamptz,
  updated_at      timestamptz not null default now()
);
create index if not exists payout_requests_owner_idx
  on public.payout_requests (owner_id, requested_at desc);
-- The queue a human or a cron works.
create index if not exists payout_requests_open_idx
  on public.payout_requests (requested_at) where status in ('pending', 'processing');
alter table public.payout_requests enable row level security;
drop policy if exists "payout_requests_own" on public.payout_requests;
create policy "payout_requests_own" on public.payout_requests
  for select to authenticated using (owner_id = (select auth.uid()) or public.is_staff());
-- No insert/update policy on purpose. Requests are created by
-- request_withdrawal and settled by settle_payout, both of which check things
-- a policy cannot express — a balance, a verified destination, a reversal.
revoke all on public.payout_requests from anon, authenticated;
grant select on public.payout_requests to authenticated;
-- ── Requesting ──────────────────────────────────────────────────────────────
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
  v_min     bigint := private.setting_int('min_withdrawal_kobo', 100000)::bigint; -- ₦1,000
  v_request uuid;
  v_ref     text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Locked for the whole check-and-debit: two taps on Withdraw must not both
  -- read the same balance and both succeed.
  select * into v_wallet from public.wallets where owner_id = v_uid for update;
  if not found then
    raise exception 'You do not have a wallet yet' using errcode = 'P0002';
  end if;
  if v_wallet.is_frozen then
    raise exception 'This wallet is frozen: %', coalesce(v_wallet.frozen_reason, 'contact support')
      using errcode = 'P0001';
  end if;

  if p_amount_kobo is null or p_amount_kobo < v_min then
    raise exception 'The smallest withdrawal is %', (v_min / 100)::text
      using errcode = 'P0001';
  end if;

  -- `balance_kobo` already excludes escrow: held money is counted in
  -- pending_kobo and is not credited to the wallet until it is released.
  if p_amount_kobo > v_wallet.balance_kobo then
    raise exception 'You have % available, not %',
      (v_wallet.balance_kobo / 100)::text, (p_amount_kobo / 100)::text
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

  -- Reference keyed on the request, so a retry of the same request cannot post
  -- a second debit.
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
-- ── Settling ────────────────────────────────────────────────────────────────
-- Staff or the service role: this is where an external transfer's outcome is
-- recorded, and a vendor must not be able to mark their own payout paid.
create or replace function public.settle_payout(
  p_request_id     uuid,
  p_status         text,
  p_transfer_code  text default null,
  p_failure_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_req    public.payout_requests%rowtype;
  v_wallet public.wallets%rowtype;
  v_ref    text;
begin
  if not public.is_staff() and (select auth.uid()) is not null then
    raise exception 'Only staff can settle a payout' using errcode = '42501';
  end if;

  if p_status not in ('processing', 'paid', 'failed') then
    raise exception 'unknown payout status %', p_status using errcode = '22023';
  end if;

  select * into v_req from public.payout_requests where id = p_request_id for update;
  if not found then
    raise exception 'payout request not found' using errcode = 'P0002';
  end if;

  -- Terminal states are terminal. Re-settling a paid payout would either pay
  -- twice or refund money that was genuinely sent.
  if v_req.status in ('paid', 'failed', 'cancelled') then
    return v_req.status;
  end if;

  if p_status = 'failed' then
    select * into v_wallet from public.wallets where owner_id = v_req.owner_id for update;
    v_ref := 'PAYOUT_REVERSAL_' || v_req.id::text;

    -- Idempotent: a retried failure notice must not credit twice.
    if not exists (select 1 from private.ledger_transactions where reference = v_ref) then
      perform private.post_transaction(
        'wallet_withdrawal',
        'Withdrawal failed - returned to wallet',
        jsonb_build_array(
          jsonb_build_object('account', 'payment_gateway', 'amount_kobo', -v_req.amount_kobo),
          jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet.id,
                             'amount_kobo', v_req.amount_kobo)
        ),
        v_ref
      );
    end if;
  end if;

  update public.payout_requests
     set status = p_status,
         transfer_code = coalesce(p_transfer_code, transfer_code),
         failure_reason = case when p_status = 'failed' then p_failure_reason else null end,
         settled_at = case when p_status in ('paid', 'failed') then now() else settled_at end,
         updated_at = now()
   where id = p_request_id;

  return p_status;
end;
$fn$;
-- ── Cancelling your own pending request ─────────────────────────────────────
create or replace function public.cancel_withdrawal(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_req    public.payout_requests%rowtype;
  v_wallet public.wallets%rowtype;
  v_ref    text;
begin
  select * into v_req from public.payout_requests where id = p_request_id for update;
  if not found then
    raise exception 'payout request not found' using errcode = 'P0002';
  end if;
  if v_req.owner_id <> (select auth.uid()) and not public.is_staff() then
    raise exception 'That withdrawal is not yours' using errcode = '42501';
  end if;

  -- Only before it has been handed to the provider. After that the money may
  -- genuinely be moving, and the outcome has to come from the provider.
  if v_req.status <> 'pending' then
    raise exception 'This withdrawal is already %', v_req.status using errcode = 'P0001';
  end if;

  select * into v_wallet from public.wallets where owner_id = v_req.owner_id for update;
  v_ref := 'PAYOUT_REVERSAL_' || v_req.id::text;

  if not exists (select 1 from private.ledger_transactions where reference = v_ref) then
    perform private.post_transaction(
      'wallet_withdrawal',
      'Withdrawal cancelled - returned to wallet',
      jsonb_build_array(
        jsonb_build_object('account', 'payment_gateway', 'amount_kobo', -v_req.amount_kobo),
        jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet.id,
                           'amount_kobo', v_req.amount_kobo)
      ),
      v_ref
    );
  end if;

  update public.payout_requests
     set status = 'cancelled', settled_at = now(), updated_at = now()
   where id = p_request_id;
end;
$fn$;
revoke all on function public.request_withdrawal(bigint, uuid) from public, anon;
revoke all on function public.settle_payout(uuid, text, text, text) from public, anon;
revoke all on function public.cancel_withdrawal(uuid) from public, anon;
grant execute on function public.request_withdrawal(bigint, uuid) to authenticated;
grant execute on function public.settle_payout(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.cancel_withdrawal(uuid) to authenticated;
insert into public.app_settings (key, value)
values ('min_withdrawal_kobo', '100000'::jsonb)
on conflict (key) do nothing;
comment on table public.payout_requests is
  'Vendor withdrawals. The wallet is debited when a request is created, not when the transfer settles, so money in flight cannot be spent twice.';
-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.request_withdrawal(bigint, uuid)') is null then
    raise exception 'request_withdrawal missing';
  end if;
  if to_regprocedure('public.settle_payout(uuid, text, text, text)') is null then
    raise exception 'settle_payout missing';
  end if;
end $$;
