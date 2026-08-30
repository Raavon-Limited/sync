-- ============================================================================
-- subscribe_to_plan
--
-- `plans` is seeded (Starter / Growth / Pro) and `subscriptions` is empty:
-- nothing could ever create one. The vendor plan screen had no way to charge
-- for an upgrade, so the whole subscription revenue line was inert.
--
-- PAID FROM WALLET, LIKE ORDERS
--   Same reasoning as pay_order_from_wallet: top-up is verified and idempotent,
--   and a second card integration for subscriptions would mean a second webhook
--   path and a second set of replay bugs for the same end state. Paystack
--   recurring can be added later and would call this same function.
--
-- NO ESCROW HERE
--   An order is escrowed because the vendor still has to deliver. A
--   subscription is paid to the platform for access that starts immediately,
--   so it goes straight to platform_revenue. There is nothing to hold.
--
-- IDEMPOTENT PER PERIOD, NOT PER CALL
--   The reference is SUB_<vendor>_<plan>_<period start date>. Charging twice in
--   one period is the bug worth preventing; charging again next month is the
--   product working. A renewal is a new period and therefore a new reference.
--
-- THE FREE PLAN IS NOT A PAYMENT
--   Downgrading to Starter must not post a zero-kobo transaction —
--   post_transaction requires balanced entries and a zero entry is noise in a
--   statement. Free plans switch the subscription and write no ledger row.
--
-- ROLLBACK
--   drop function if exists public.subscribe_to_plan(uuid);
-- ============================================================================

-- One live subscription per vendor. Created BEFORE the function so the
-- `on conflict (vendor_id)` below has a conflict target to name; without it a
-- vendor accumulates a row per plan change.
create unique index if not exists subscriptions_one_per_vendor_idx
  on public.subscriptions (vendor_id);

create or replace function public.subscribe_to_plan(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_plan    public.plans%rowtype;
  v_wallet  uuid;
  v_balance bigint;
  v_ref     text;
  v_txn     uuid;
  v_start   timestamptz := date_trunc('day', now());
  v_end     timestamptz;
  v_sub     uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- vendor_profiles.id = profiles.id, so this both finds the brand and proves
  -- the caller is a vendor.
  if not exists (select 1 from public.vendor_profiles vp where vp.id = v_uid) then
    raise exception 'only a vendor can subscribe' using errcode = '42501';
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;

  v_end := case when v_plan.interval = 'yearly'
                then v_start + interval '1 year'
                else v_start + interval '30 days' end;

  -- Free plan: switch, charge nothing, write no ledger row.
  if v_plan.price_kobo = 0 then
    insert into public.subscriptions (vendor_id, plan_id, status, current_period_start, current_period_end)
    values (v_uid, p_plan_id, 'active', v_start, v_end)
    on conflict (vendor_id) do update
      set plan_id = excluded.plan_id,
          status = 'active',
          current_period_start = excluded.current_period_start,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = false,
          updated_at = now()
    returning id into v_sub;
    return v_sub;
  end if;

  v_ref := 'SUB_' || v_uid::text || '_' || v_plan.code || '_' || to_char(v_start, 'YYYY-MM-DD');

  -- Replay within the same period: already paid, nothing more to take.
  select id into v_txn from private.ledger_transactions where reference = v_ref;
  if v_txn is null then
    select id, balance_kobo into v_wallet, v_balance
      from public.wallets where owner_id = v_uid for update;
    if v_wallet is null then
      raise exception 'no wallet' using errcode = 'P0002';
    end if;
    if v_balance < v_plan.price_kobo then
      raise exception 'insufficient balance: wallet has % kobo, plan costs %',
        v_balance, v_plan.price_kobo using errcode = 'P0001';
    end if;

    v_txn := private.post_transaction(
      'subscription_charge',
      v_plan.name || ' plan',
      jsonb_build_array(
        jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet, 'amount_kobo', -v_plan.price_kobo),
        jsonb_build_object('account', 'platform_revenue', 'amount_kobo', v_plan.price_kobo)
      ),
      v_ref
    );
  end if;

  insert into public.subscriptions (vendor_id, plan_id, status, current_period_start, current_period_end, provider_ref)
  values (v_uid, p_plan_id, 'active', v_start, v_end, v_ref)
  on conflict (vendor_id) do update
    set plan_id = excluded.plan_id,
        status = 'active',
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = false,
        provider_ref = excluded.provider_ref,
        updated_at = now()
  returning id into v_sub;

  return v_sub;
end;
$fn$;

grant execute on function public.subscribe_to_plan(uuid) to authenticated, service_role;

comment on function public.subscribe_to_plan is
  'Subscribes the calling vendor, paying from wallet. Idempotent per (vendor, plan, period). Free plans write no ledger row.';
