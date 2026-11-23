-- ============================================================================
-- unfunded_order_escrow   A hold exists for money that arrived, and only that.
--
-- THE SYMPTOM
--   An unpaid food order paid its vendor. checkout_cart (20260902120000) writes
--   the goods hold and the delivery hold as 'held' the moment the cart becomes
--   an order, and payment is a separate later step (pay_order_from_wallet) that
--   the checkout screen treats as the common thing NOT to happen. So:
--     - the hourly sweep pays the vendor 24h after checkout, paid or not;
--     - release_order_escrow's payer branch lets the "student" release it at
--       once, so ordering a N1m listing from your own shop and not paying
--       credits about N998k;
--     - a vendor cancelling an unpaid order REFUNDS it, crediting the student's
--       wallet with money that never left it.
--   Every one of those transactions balances on its own, so the ledger's
--   per-transaction check (invariant 10) cannot see it. platform_escrow just
--   drifts negative.
--
-- THE FIX   ONE NEW STATUS, NO MONEY FUNCTION REWRITTEN
--   'unfunded' is a hold for money not yet received. Every path that moves
--   escrow money already refuses anything that is not exactly 'held':
--     release_order_escrow     `if v_hold.status <> 'held'`    -> no-op
--     release_delivery_escrow  `if v_hold.status <> 'held'`    -> no-op
--     release_matured_escrow   `where h.status = 'held'`       -> never selected
--     cancel_order             `or v_hold.status <> 'held'`    -> no refund
--     resolve_dispute          `if v_hold.status <> 'held'`    -> refused
--     sync_wallet_pending      `and h.status = 'held'`         -> not "pending" to the payee
--   so a hold that is 'unfunded' is invisible to all of them. That is the whole
--   mechanism, and the verify block asserts each of those lines is still there,
--   because a rewrite that loosens one of them re-opens this.
--
--   - BEFORE INSERT on escrow_holds: an order or delivery hold whose order is
--     unpaid starts 'unfunded'. Named to fire after escrow_holds_apply_settings,
--     so commission and maturity are still computed as before.
--   - AFTER UPDATE OF paid_at on orders: the moment pay_order_from_wallet stamps
--     the order, its holds become 'held' and the maturity clock starts from
--     PAYMENT, not from checkout.
--   - Backfill: live 'held' holds on unpaid orders become 'unfunded'.
--
-- WHY NOT CREATE THE HOLDS AT PAYMENT INSTEAD
--   That is the cleaner end state, but it means restating checkout_cart (~230
--   lines) and pay_order_from_wallet, both live money paths with no test
--   harness to replay them against. This gets the same guarantee - no money
--   moves for an unpaid order - with two triggers and no edit to either.
--
-- THE RIDER'S PAYEE
--   claim_delivery fills payee_id only on a 'held' hold. A rider who claims an
--   unpaid order's delivery would therefore be owed a fee with nobody to pay
--   it to once the order is paid. Funding fills the payee from
--   deliveries.rider_id for exactly that case.
--
-- NOT DONE HERE
--   - Unpaid orders are still offered to riders (open_delivery_board) and never
--     expire. An expire_unpaid_orders sweep and a paid-only board are next.
--   - An unfunded hold on a cancelled order stays 'unfunded' for ever. That is
--     inert by construction; nothing reads it as money.
--   - Holds already RELEASED or REFUNDED for unpaid orders are counted below,
--     not reversed. Reversing money is a decision for a person, not a migration.
--
-- ROLLBACK
--   drop trigger escrow_holds_unfunded on public.escrow_holds;
--   drop trigger orders_fund_escrow on public.orders;
--   update public.escrow_holds set status = 'held' where status = 'unfunded';
--   then restore escrow_holds_status_check without 'unfunded'.
-- ============================================================================


-- ── 1. The status ───────────────────────────────────────────────────────────
-- The check was declared inline in 20260817090300, so its name is whatever
-- Postgres generated. Drop every status check on the table by definition rather
-- than by a guessed name, then add one with a name we chose.
do $$
declare
  r record;
begin
  for r in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.escrow_holds'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ~ '\mstatus\M'
       -- The status list specifically, not some future check that merely
       -- mentions the column.
       and pg_get_constraintdef(con.oid) ~ '''released'''
  loop
    execute format('alter table public.escrow_holds drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.escrow_holds
  add constraint escrow_holds_status_check
  check (status in ('unfunded', 'held', 'released', 'refunded', 'disputed'));

comment on column public.escrow_holds.status is
  'unfunded: the money has not arrived (an unpaid order) and no path may move it. held: funded and waiting. released / refunded: settled. disputed: frozen by staff.';


-- ── 2. A hold for an unpaid order starts unfunded ───────────────────────────
create or replace function private.start_unfunded_if_unpaid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_order uuid;
begin
  -- Only the two subjects checkout_cart creates before payment. Rent,
  -- inspections, service requests and tickets are created by the function that
  -- takes the money, in the same transaction, and are funded by construction.
  if new.status <> 'held' then
    return new;
  end if;

  if new.order_id is not null then
    v_order := new.order_id;
  elsif new.delivery_id is not null then
    select d.order_id into v_order from public.deliveries d where d.id = new.delivery_id;
  else
    return new;
  end if;

  if v_order is not null
     and exists (select 1 from public.orders o where o.id = v_order and o.paid_at is null) then
    new.status := 'unfunded';
  end if;

  return new;
end;
$fn$;

-- "unfunded" sorts after "apply_settings": commission and release_after are
-- already set when this runs, and both are kept for when the money arrives.
drop trigger if exists escrow_holds_unfunded on public.escrow_holds;
create trigger escrow_holds_unfunded
  before insert on public.escrow_holds
  for each row execute function private.start_unfunded_if_unpaid();


-- ── 3. Payment funds them ───────────────────────────────────────────────────
create or replace function private.fund_order_escrow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.escrow_holds h
     set status        = 'held',
         -- The maturity window apply_escrow_settings chose, restarted from
         -- now. Otherwise an order paid 23h after checkout would mature an hour
         -- after the student paid for it.
         release_after = case
                           when h.release_after is null then null
                           else now() + (h.release_after - h.created_at)
                         end,
         payee_id      = coalesce(
                           h.payee_id,
                           (select d.rider_id from public.deliveries d where d.id = h.delivery_id)
                         ),
         updated_at    = now()
   where h.status = 'unfunded'
     and (h.order_id = new.id
          or h.delivery_id in (select d.id from public.deliveries d where d.order_id = new.id));
  return null;
end;
$fn$;

drop trigger if exists orders_fund_escrow on public.orders;
create trigger orders_fund_escrow
  after update of paid_at on public.orders
  for each row
  when (old.paid_at is null and new.paid_at is not null)
  execute function private.fund_order_escrow();


-- ── 4. Backfill ─────────────────────────────────────────────────────────────
-- "Unpaid" means BOTH no paid_at and no ORDER_<id> ledger transaction - the
-- reference pay_order_from_wallet posts under - so an order paid by some older
-- path that forgot paid_at is not mistaken for an unpaid one.
do $$
declare
  v_unfunded integer;
  v_damage   integer;
begin
  with unpaid as (
    select o.id
      from public.orders o
     where o.paid_at is null
       and not exists (
         select 1 from private.ledger_transactions t
          where t.reference = 'ORDER_' || o.id::text
       )
  )
  update public.escrow_holds h
     set status = 'unfunded', updated_at = now()
   where h.status = 'held'
     and (h.order_id in (select id from unpaid)
          or h.delivery_id in (select d.id from public.deliveries d
                                where d.order_id in (select id from unpaid)));
  get diagnostics v_unfunded = row_count;
  raise notice 'unfunded_order_escrow: % live hold(s) on unpaid orders set to unfunded', v_unfunded;

  -- Money that already moved for an order nobody paid. Counted for a person to
  -- review; see the header for why this does not reverse it.
  select count(*) into v_damage
    from public.escrow_holds h
    left join public.deliveries d on d.id = h.delivery_id
    join public.orders o on o.id = coalesce(h.order_id, d.order_id)
   where h.status in ('released', 'refunded')
     and o.paid_at is null
     and not exists (
       select 1 from private.ledger_transactions t
        where t.reference = 'ORDER_' || o.id::text
     );
  if v_damage > 0 then
    raise notice 'AUDIT: % hold(s) already released or refunded for unpaid orders', v_damage;
  end if;
end;
$$;


-- ── 5. Verify ───────────────────────────────────────────────────────────────
do $$
declare
  v_src text;
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'escrow_holds_unfunded'
                    and tgrelid = 'public.escrow_holds'::regclass) then
    raise exception 'escrow_holds_unfunded trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'orders_fund_escrow'
                    and tgrelid = 'public.orders'::regclass) then
    raise exception 'orders_fund_escrow trigger is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.escrow_holds'::regclass
       and conname = 'escrow_holds_status_check'
       and pg_get_constraintdef(oid) like '%unfunded%'
  ) then
    raise exception 'escrow_holds_status_check does not permit unfunded';
  end if;

  -- THE INVARIANT THIS MIGRATION LEANS ON: every money mover ignores anything
  -- that is not exactly 'held'. If one of these lines is ever rewritten away,
  -- an unfunded hold becomes payable again, and this is where that is caught.
  select prosrc into v_src from pg_proc where oid = 'public.release_order_escrow(uuid)'::regprocedure;
  if v_src !~ 'v_hold\.status\s*<>\s*''held''' then
    raise exception 'release_order_escrow no longer refuses non-held holds';
  end if;

  select prosrc into v_src from pg_proc where oid = 'public.release_delivery_escrow(uuid)'::regprocedure;
  if v_src !~ 'v_hold\.status\s*<>\s*''held''' then
    raise exception 'release_delivery_escrow no longer refuses non-held holds';
  end if;

  select prosrc into v_src from pg_proc where oid = 'public.release_matured_escrow(integer)'::regprocedure;
  if v_src !~ 'h\.status\s*=\s*''held''' then
    raise exception 'release_matured_escrow no longer selects only held holds';
  end if;

  select prosrc into v_src from pg_proc where oid = 'public.cancel_order(uuid, text)'::regprocedure;
  if v_src !~ 'v_hold\.status\s*<>\s*''held''' then
    raise exception 'cancel_order no longer skips non-held holds';
  end if;

  select prosrc into v_src from pg_proc where oid = 'public.resolve_dispute(uuid, text, bigint, text)'::regprocedure;
  if v_src !~ 'v_hold\.status\s*<>\s*''held''' then
    raise exception 'resolve_dispute no longer refuses non-held holds';
  end if;

  select prosrc into v_src from pg_proc where oid = 'private.sync_wallet_pending()'::regprocedure;
  if v_src !~ 'h\.status\s*=\s*''held''' then
    raise exception 'sync_wallet_pending would count unfunded holds as pending';
  end if;

  -- And the state it was written to produce.
  if exists (
    select 1
      from public.escrow_holds h
      left join public.deliveries d on d.id = h.delivery_id
      join public.orders o on o.id = coalesce(h.order_id, d.order_id)
     where h.status = 'held'
       and o.paid_at is null
       and not exists (select 1 from private.ledger_transactions t
                        where t.reference = 'ORDER_' || o.id::text)
  ) then
    raise exception 'a held hold still exists for an unpaid order';
  end if;
end;
$$;
