-- ============================================================================
-- cancel_order_refund
--
-- A vendor who sells out and cancels the order gets paid for it anyway.
--
-- HOW
--   `orders_update_vendor` lets a vendor set `status = 'cancelled'`, and that
--   is all it does. It writes a word on the order row and touches nothing
--   else. The escrow hold stays 'held'.
--
--   `release_order_escrow` guards on: the order exists, a hold exists, the
--   caller is the payer or the platform, the hold has matured, and the hold is
--   still 'held'. It never looks at `orders.status`.
--
--   `release_matured_escrow` — the hourly cron — selects purely on
--   `status = 'held' and release_after <= now()`.
--
--   So: sell out, cancel, wait 24 hours, and the cron pays the vendor in full
--   for an order that was never delivered.
--
-- AND THE ESCAPE HATCH IS SHUT BEHIND IT
--   `resolve_dispute` opens with `if v_hold.status <> 'held' then raise`. Once
--   the cron has released the money, staff cannot refund it through any path
--   in this schema. The student has to be paid back out of band, by hand, from
--   a ledger that will not balance afterwards.
--
-- TWO FIXES, BECAUSE THERE ARE TWO BUGS
--   1. `release_order_escrow` refuses a cancelled order. This is the guard
--      that should always have been there: the money must not move for an
--      order that is not happening, whoever asks and however long they wait.
--   2. `cancel_order` exists at all — cancelling and refunding in ONE
--      transaction, so there is no window in which the order is dead and the
--      money is not yet back. Cancelling without refunding is what created
--      this, and leaving the two as separate steps invites it again.
--
-- WHY THE REFUND IS AUTOMATIC AND FULL
--   The vendor gave up the sale. There is nothing to arbitrate, and a student
--   waiting on a staff queue for a refund the vendor already agreed to is how
--   people stop using the platform. Disputes remain for the contested cases:
--   this is the uncontested one.
--
-- NO COMMISSION ON A CANCELLED ORDER
--   `apply_escrow_settings` freezes a commission at hold creation. Charging it
--   on an order nobody was served would mean the platform earning on a
--   cancellation, and the escrow would not empty to zero.
--
-- WHO CAN CANCEL
--   The vendor who owns the order, anyone who manages the store fulfilling it,
--   or staff. NOT the student: a student-facing cancel needs a policy about
--   how late is too late, and inventing one here would let somebody cancel
--   food that is already cooked. That is a separate decision.
--
-- ROLLBACK
--   drop function if exists public.cancel_order(uuid, text);
--   (and re-run 20260825130000 to restore release_order_escrow)
-- ============================================================================

-- 1. The guard that was missing ---------------------------------------------
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

  -- THE ONLY CHANGE FROM 20260825130000.
  -- An order that is not happening does not pay out, to anyone, however long
  -- its hold has been sitting there. Checked before the caller checks, because
  -- this is true regardless of who is asking — including the cron, which is
  -- the caller that actually made this bite.
  if v_order.status = 'cancelled' then
    raise exception 'order % was cancelled; its escrow is refunded, not released', p_order_id
      using errcode = 'P0001';
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

-- 2. Cancel and refund, in one transaction -----------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid       uuid := (select auth.uid());
  v_order     public.orders%rowtype;
  v_hold      public.escrow_holds%rowtype;
  v_student_w uuid;
  v_ref       text;
  v_txn       uuid;
begin
  -- A null v_uid means the service role, exactly as release_order_escrow
  -- reads it. NOT `current_user <> 'service_role'`: inside a SECURITY DEFINER
  -- function current_user is the function's OWNER, so that test is true for
  -- every caller alive — the bug 20260828130000 exists to fix. Following the
  -- convention already in this file is safer than inventing a second one.

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  -- The vendor who owns it, whoever runs the store fulfilling it, or staff.
  if v_uid is not null
     and v_uid <> v_order.vendor_id
     and not public.is_staff()
     and not (v_order.storefront_id is not null
              and private.can_manage_storefront(v_order.storefront_id, v_uid)) then
    raise exception 'not allowed to cancel this order' using errcode = '42501';
  end if;

  -- Delivered means the student has the food. Cancelling then is a refund
  -- argument, which is what disputes are for.
  if v_order.status = 'delivered' then
    raise exception 'order % was delivered; raise a dispute instead', p_order_id
      using errcode = 'P0001';
  end if;

  v_ref := 'ORDER_CANCEL_' || p_order_id::text;

  -- Idempotent by reference, like every other money path here. A second tap on
  -- "Cancel" must not post a second refund.
  select id into v_txn from private.ledger_transactions where reference = v_ref;

  update public.orders
     set status = 'cancelled', updated_at = now()
   where id = p_order_id;

  select * into v_hold from public.escrow_holds where order_id = p_order_id for update;

  -- An unpaid order has no hold. Cancelling it is just the status change, and
  -- that is a legitimate outcome rather than an error.
  if not found or v_hold.status <> 'held' then
    return v_txn;
  end if;

  if v_txn is null then
    select id into v_student_w from public.wallets where owner_id = v_hold.payer_id;
    if v_student_w is null then
      raise exception 'payer has no wallet' using errcode = 'P0002';
    end if;

    -- Escrow empties completely and all of it goes back. No commission: the
    -- platform does not earn on an order nobody was served.
    v_txn := private.post_transaction(
      'order_refund',
      coalesce(nullif(trim(p_reason), ''), 'Order cancelled by vendor'),
      jsonb_build_array(
        jsonb_build_object('account', 'platform_escrow', 'amount_kobo', -v_hold.amount_kobo),
        jsonb_build_object('account', 'user_wallet', 'wallet_id', v_student_w,
                           'amount_kobo', v_hold.amount_kobo)
      ),
      v_ref,
      p_order_id
    );
  end if;

  update public.escrow_holds
     set status = 'refunded', refunded_at = now(), updated_at = now()
   where id = v_hold.id;

  return v_txn;
end;
$fn$;

revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated, service_role;

comment on function public.cancel_order(uuid, text) is
  'Cancel an order and refund its escrow in full, in one transaction. Vendor, store manager or staff. Idempotent by reference. No commission is taken on a cancellation.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.cancel_order(uuid, text)') is null then
    raise exception 'cancel_order missing';
  end if;

  -- The guard is the point of this migration; assert it is actually in the body.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'release_order_escrow'
       and p.prosrc like '%was cancelled; its escrow is refunded%'
  ) then
    raise exception 'release_order_escrow is missing the cancelled-order guard';
  end if;
end $$;
