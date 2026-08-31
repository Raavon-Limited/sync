-- ============================================================================
-- order_payment_escrow
--
-- Closes the money loop for orders. Two functions:
--   pay_order_from_wallet   student's wallet  -> platform_escrow
--   release_order_escrow    platform_escrow   -> vendor wallet (+ commission)
--
-- WHY WALLET-FUNDED RATHER THAN A CARD CHARGE PER ORDER
--   Wallet top-up is verified, idempotent and working. Charging a card per
--   order would mean a second Paystack integration, a second webhook path and a
--   second set of replay bugs, for the same end state. Topping up once and
--   spending from balance is also a better checkout on a campus connection.
--   A card-per-order path can be added later; it would call the same functions.
--
-- WHY ESCROW AND NOT STRAIGHT TO THE VENDOR
--   The vendor is paid on DELIVERY, not on order. Until then the money is the
--   platform's to return. `escrow_holds` already models this and checkout
--   already writes the row — it just never had funds behind it.
--
-- WHO MAY RELEASE
--   The student (confirming they got it), or the service role (a cron, once
--   `release_after` has passed). NOT the vendor: releasing your own escrow is
--   self-dealing, and a vendor who can mark their own order delivered can pay
--   themselves for food nobody received.
--
-- ROLLBACK
--   drop function if exists public.pay_order_from_wallet(uuid);
--   drop function if exists public.release_order_escrow(uuid);
-- ============================================================================

-- 1. Pay -----------------------------------------------------------------------
create or replace function public.pay_order_from_wallet(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_order   public.orders%rowtype;
  v_wallet  uuid;
  v_balance bigint;
  v_ref     text;
  v_txn     uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lock the order so two taps on "Pay" cannot both spend the balance.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.student_id <> v_uid then
    raise exception 'not your order' using errcode = '42501';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'this order was cancelled' using errcode = 'P0001';
  end if;

  -- Already paid: return the existing transaction rather than charging twice.
  v_ref := 'ORDER_' || p_order_id::text;
  select id into v_txn from private.ledger_transactions where reference = v_ref;
  if v_txn is not null then
    return v_txn;
  end if;

  select id, balance_kobo into v_wallet, v_balance
    from public.wallets where owner_id = v_uid for update;
  if v_wallet is null then
    raise exception 'no wallet' using errcode = 'P0002';
  end if;

  -- Checked here as well as in the UI: the UI can be wrong, this cannot be.
  if v_balance < v_order.total_kobo then
    raise exception 'insufficient balance: wallet has % kobo, order needs %',
      v_balance, v_order.total_kobo using errcode = 'P0001';
  end if;

  v_txn := private.post_transaction(
    'order_payment',
    'Payment for order ' || upper(left(p_order_id::text, 8)),
    jsonb_build_array(
      jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet, 'amount_kobo', -v_order.total_kobo),
      jsonb_build_object('account', 'platform_escrow', 'amount_kobo', v_order.total_kobo)
    ),
    v_ref,
    p_order_id
  );

  update public.orders
     set paid_at = now(), payment_reference = v_ref
   where id = p_order_id;

  -- checkout_cart already created the hold; make sure one exists either way.
  insert into public.escrow_holds (order_id, payer_id, payee_id, amount_kobo, release_after, status)
  select p_order_id, v_uid, v_order.vendor_id, v_order.total_kobo, now() + interval '24 hours', 'held'
   where not exists (select 1 from public.escrow_holds h where h.order_id = p_order_id);

  return v_txn;
end;
$fn$;
grant execute on function public.pay_order_from_wallet(uuid) to authenticated, service_role;
-- 2. Release -------------------------------------------------------------------
create or replace function public.release_order_escrow(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_hold   public.escrow_holds%rowtype;
  v_order  public.orders%rowtype;
  v_wallet uuid;
  v_net    bigint;
  v_ref    text;
  v_txn    uuid;
  v_entries jsonb;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  select * into v_hold from public.escrow_holds
   where order_id = p_order_id for update;
  if not found then
    raise exception 'no escrow hold for this order' using errcode = 'P0002';
  end if;

  -- Authorisation, restated because SECURITY DEFINER turned RLS off.
  -- v_uid is null for the service role (a cron), which may release once the
  -- hold has matured. The vendor is deliberately absent — see the header.
  if v_uid is not null and v_uid <> v_hold.payer_id then
    raise exception 'only the payer or the platform can release escrow'
      using errcode = '42501';
  end if;
  if v_uid is null and (v_hold.release_after is null or v_hold.release_after > now()) then
    raise exception 'hold has not matured yet' using errcode = 'P0001';
  end if;

  if v_hold.status <> 'held' then
    -- Already settled. Idempotent rather than an error: a retried cron and a
    -- student tapping "confirm" twice are both normal.
    select id into v_txn from private.ledger_transactions
     where reference = 'ESCROW_' || p_order_id::text;
    return v_txn;
  end if;

  v_ref := 'ESCROW_' || p_order_id::text;
  select id into v_txn from private.ledger_transactions where reference = v_ref;
  if v_txn is not null then
    return v_txn;
  end if;

  select id into v_wallet from public.wallets where owner_id = v_hold.payee_id;
  if v_wallet is null then
    raise exception 'vendor has no wallet' using errcode = 'P0002';
  end if;

  v_net := v_hold.amount_kobo - v_hold.commission_kobo;

  -- Commission is only a line when there is one; a zero-kobo entry is noise in
  -- a statement, and post_transaction requires every line to mean something.
  v_entries := jsonb_build_array(
    jsonb_build_object('account', 'platform_escrow', 'amount_kobo', -v_hold.amount_kobo),
    jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet, 'amount_kobo', v_net)
  );
  if v_hold.commission_kobo > 0 then
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object('account', 'platform_revenue', 'amount_kobo', v_hold.commission_kobo)
    );
  end if;

  v_txn := private.post_transaction(
    'escrow_release',
    'Released for order ' || upper(left(p_order_id::text, 8)),
    v_entries,
    v_ref,
    p_order_id
  );

  update public.escrow_holds
     set status = 'released', released_at = now(), updated_at = now()
   where id = v_hold.id;

  return v_txn;
end;
$fn$;
grant execute on function public.release_order_escrow(uuid) to authenticated, service_role;
comment on function public.pay_order_from_wallet is
  'Moves an order total from the student wallet into platform_escrow. Idempotent by ORDER_<id>.';
comment on function public.release_order_escrow is
  'Releases a matured hold to the vendor, minus commission. Payer or service role only; never the vendor.';
