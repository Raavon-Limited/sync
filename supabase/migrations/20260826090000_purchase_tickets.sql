-- ============================================================================
-- purchase_tickets
--
-- Tickets could be listed and priced but never bought: `tickets` has no insert
-- policy and there was no purchase path. This adds one, paid from wallet like
-- orders and subscriptions.
--
-- MONEY GOES TO PLATFORM REVENUE, NOT THE ORGANISER — AND THAT IS A GAP
--   `escrow_holds` can reference an order, a booking or a service request, and
--   a check constraint requires exactly one of the three. There is no event
--   column, so a ticket sale cannot be escrowed and released to an organiser
--   the way an order is released to a vendor.
--
--   So ticket money lands in platform_revenue and organiser payout is NOT
--   modelled. That is a deliberate, visible gap rather than a silent one: the
--   alternative was inventing an escrow shape the schema does not have, or
--   paying organisers with no hold at all. Closing it means adding `event_id`
--   to escrow_holds and widening that constraint.
--
-- A NEW LEDGER KIND
--   The existing kinds had nowhere for this. Filing a ticket sale under
--   'order_payment' would make every revenue report that groups by kind wrong,
--   so 'ticket_purchase' is added to the check constraint.
--
-- IDEMPOTENCY IS CALLER-SUPPLIED
--   Unlike a top-up, buying tickets twice is legitimate — a student may come
--   back for a friend. So there is no natural key. The caller passes a
--   reference (one uuid per attempt); replaying it returns the same tickets
--   instead of buying more, which is what protects a double-tapped button.
--
-- ROLLBACK
--   drop function if exists public.purchase_tickets(uuid, integer, text);
--   -- and restore the ledger_transactions kind check from 20260817090300.
-- ============================================================================

-- 1. Somewhere for a ticket sale to live in the ledger -------------------------
alter table private.ledger_transactions drop constraint if exists ledger_transactions_kind_check;
alter table private.ledger_transactions add constraint ledger_transactions_kind_check
  check (kind in (
    'order_payment', 'order_refund', 'escrow_hold', 'escrow_release',
    'wallet_topup', 'wallet_withdrawal', 'payout', 'commission',
    'delivery_fee', 'subscription_charge', 'ticket_purchase', 'adjustment'));

-- 2. Buy ----------------------------------------------------------------------
create or replace function public.purchase_tickets(
  p_tier_id   uuid,
  p_quantity  integer default 1,
  p_reference text    default null
)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_tier    public.event_ticket_tiers%rowtype;
  v_wallet  uuid;
  v_balance bigint;
  v_total   bigint;
  v_ref     text;
  v_txn     uuid;
  v_i       integer;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    -- An upper bound because this is a public function and each ticket is a
    -- row; 10 is a person buying for friends, 10 000 is an attack.
    raise exception 'quantity must be between 1 and 10' using errcode = '22023';
  end if;

  v_ref := coalesce(p_reference, 'TIX_' || gen_random_uuid()::text);

  -- Replay of the same attempt: hand back what was already bought.
  select id into v_txn from private.ledger_transactions where reference = v_ref;
  if v_txn is not null then
    return query
      select t.id from public.tickets t
       where t.owner_id = v_uid and t.reference like v_ref || '%';
    return;
  end if;

  -- Lock the tier so two buyers cannot both take the last seat.
  select * into v_tier from public.event_ticket_tiers where id = p_tier_id for update;
  if not found then
    raise exception 'ticket tier not found' using errcode = 'P0002';
  end if;
  if not v_tier.is_active then
    raise exception 'this ticket is no longer on sale' using errcode = 'P0001';
  end if;
  -- null quantity means uncapped; only a capped tier can run out.
  if v_tier.quantity is not null and v_tier.sold + p_quantity > v_tier.quantity then
    raise exception 'only % left', greatest(0, v_tier.quantity - v_tier.sold)
      using errcode = 'P0001';
  end if;

  v_total := v_tier.price_kobo * p_quantity;

  -- Free tiers still issue tickets; they just do not move money, and a
  -- zero-kobo ledger transaction would not balance meaningfully.
  if v_total > 0 then
    select id, balance_kobo into v_wallet, v_balance
      from public.wallets where owner_id = v_uid for update;
    if v_wallet is null then
      raise exception 'no wallet' using errcode = 'P0002';
    end if;
    if v_balance < v_total then
      raise exception 'insufficient balance: wallet has % kobo, tickets cost %',
        v_balance, v_total using errcode = 'P0001';
    end if;

    v_txn := private.post_transaction(
      'ticket_purchase',
      p_quantity || ' x ' || v_tier.name,
      jsonb_build_array(
        jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet, 'amount_kobo', -v_total),
        jsonb_build_object('account', 'platform_revenue', 'amount_kobo', v_total)
      ),
      v_ref
    );
  end if;

  for v_i in 1 .. p_quantity loop
    insert into public.tickets (event_id, owner_id, reference, tier, price_kobo, status)
    values (
      v_tier.event_id,
      v_uid,
      -- Prefixed with the attempt reference so a replay can find them again.
      v_ref || '-' || v_i,
      v_tier.name,
      v_tier.price_kobo,
      'valid'
    )
    returning id into v_id;
    return next v_id;
  end loop;

  return;
end;
$fn$;

grant execute on function public.purchase_tickets(uuid, integer, text) to authenticated, service_role;

comment on function public.purchase_tickets is
  'Buys tickets from wallet balance. Idempotent by caller-supplied reference. Money goes to platform_revenue: organiser payout is not modelled, see the migration header.';
