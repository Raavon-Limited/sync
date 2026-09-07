-- ============================================================================
-- inspection_ledger_and_pending
--
-- Two halves of the same omission: money that arrives is not recorded, and
-- money that is owed is not shown.
--
-- 1. THE INSPECTION FEE NEVER ENTERS THE LEDGER
--    `platform_escrow` is credited in exactly three places   pay_order_from_wallet
--    and the two purchase_tickets revisions   and an inspection is none of them.
--    An inspection is a DIRECT Paystack charge: `confirm_inspection_payment`
--    runs from the charge.success webhook, opens the escrow hold, and posts no
--    ledger transaction at all.
--
--    `settle_inspection` then DEBITS platform_escrow to pay the agent. So every
--    paid inspection drives that account further negative, and nothing catches
--    it: assert_ledger_balanced only checks that each transaction sums to zero,
--    and settlement does (-amount, +amount, commission 0). The books balance
--    entry by entry while the account itself becomes fiction   after forty
--    inspections the ledger claims platform_escrow holds -₦200,000.
--
--    `payment_gateway` already exists as an account for exactly this, and
--    `credit_wallet_topup` (20260825110000) already established the convention
--    for money arriving from Paystack:
--        payment_gateway  -amount
--        <destination>    +amount
--
-- 2. `wallets.pending_kobo` IS READ AND NEVER WRITTEN
--    The column has existed since 20260817090300, commented "Money earned but
--    not yet released from escrow". `request_withdrawal` reasons about it in
--    prose - "held money is counted in pending_kobo" - and the wallet screens
--    render it. Nothing has ever set it. It is 0 for everybody, always.
--
--    So an agent with four held viewings sees an empty wallet and no reason to
--    believe the work is going to pay. The number they are owed exists in
--    `escrow_holds` the whole time.
--
-- WHY A TRIGGER THAT RECOMPUTES RATHER THAN ADDS AND SUBTRACTS
--    A hold's payee arrives late (an unclaimed inspection or delivery has none),
--    changes on reassignment, and clears on release. Delta arithmetic across
--    insert/update/delete has to get every one of those right and drifts
--    permanently the first time it does not. Recomputing that owner's total from
--    `escrow_holds` cannot drift, cannot go negative, and the row counts here are
--    tens, not millions.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--    It does not make a release fail when the Paystack balance is short. Release
--    is bookkeeping   it moves a number from platform_escrow to a wallet and is
--    always able to. What a thin balance actually breaks is the PAYOUT, which is
--    a Transfers call that does not exist yet: `request_withdrawal` inserts a
--    `payout_requests` row and a human settles it. That gap is real and is not
--    this migration's to close.
--
-- ROLLBACK
--   drop trigger if exists escrow_holds_sync_pending on public.escrow_holds;
--   drop function if exists private.sync_wallet_pending();
--   -- and restore confirm_inspection_payment from 20260906180000.
-- ============================================================================

-- ── 1. The money arrives, and the ledger says so ────────────────────────────
create or replace function public.confirm_inspection_payment(
  p_inspection  uuid,
  p_reference   text,
  p_amount_kobo bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_i    public.hostel_inspections%rowtype;
  v_hold uuid;
begin
  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  -- Replay: this exact charge already landed. Return the existing hold rather
  -- than raising   a webhook retry is a normal event, not a failure.
  if v_i.payment_reference = p_reference then
    select id into v_hold from public.escrow_holds where inspection_id = p_inspection;
    return v_hold;
  end if;

  if v_i.payment_reference is not null then
    raise exception 'That inspection was already paid under another reference'
      using errcode = 'P0001';
  end if;

  if v_i.status <> 'pending_payment' then
    raise exception 'That inspection is not awaiting payment' using errcode = 'P0001';
  end if;

  -- The amount is Paystack's, re-verified by the caller. Anything short of the
  -- snapshotted fee is not a paid inspection   underpaying must not schedule
  -- an agent's day.
  if p_amount_kobo < v_i.fee_kobo then
    raise exception 'Paid % but the fee is %',
      (p_amount_kobo / 100)::text, (v_i.fee_kobo / 100)::text using errcode = 'P0001';
  end if;

  update public.hostel_inspections
     set payment_reference = p_reference,
         paid_at           = now(),
         status            = 'scheduled',
         updated_at        = now()
   where id = p_inspection;

  -- payee_id is the assigned agent, and may still be null: an inspection can
  -- be paid for before anyone is assigned, exactly as an unclaimed delivery
  -- hold has no rider. Assignment fills it in.
  --
  -- The hold is for the SNAPSHOTTED fee, not the amount paid   an overpayment
  -- is not the agent's windfall. commission_kobo and release_after are left to
  -- apply_escrow_settings, which zeroes the first and nulls the second.
  insert into public.escrow_holds (inspection_id, payer_id, payee_id, amount_kobo)
  values (p_inspection, v_i.student_id, v_i.ambassador_id, v_i.fee_kobo)
  on conflict (inspection_id) where inspection_id is not null do nothing
  returning id into v_hold;

  if v_hold is null then
    select id into v_hold from public.escrow_holds where inspection_id = p_inspection;
  end if;

  -- THE LEG THAT WAS MISSING. Same shape as credit_wallet_topup: money coming
  -- in from the gateway, landing somewhere. Here it lands in escrow rather than
  -- a wallet, because it is not the agent's until the visit happens.
  --
  -- Held for the SNAPSHOTTED fee, matching the hold. An overpayment is not
  -- escrowed   it stays with the gateway leg and is a support question, not a
  -- silent credit to anybody.
  --
  -- Idempotent on its own reference, separate from the INSPECTION_<id> that
  -- settlement uses: a retried webhook must not post the money twice, and the
  -- inbound and the release are two different events on one inspection.
  perform private.post_transaction(
    'escrow_hold',
    'Inspection fee held',
    jsonb_build_array(
      jsonb_build_object('account', 'payment_gateway',  'amount_kobo', -v_i.fee_kobo),
      jsonb_build_object('account', 'platform_escrow',  'amount_kobo',  v_i.fee_kobo)
    ),
    'INSPECTION_FEE_' || p_inspection::text
  );

  return v_hold;
end;
$fn$;

revoke all on function public.confirm_inspection_payment(uuid, text, bigint) from public, anon;
grant execute on function public.confirm_inspection_payment(uuid, text, bigint) to service_role;

-- ── 2. What a wallet is owed, kept true ─────────────────────────────────────
create or replace function private.sync_wallet_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_owners uuid[] := array[]::uuid[];
  v_owner  uuid;
begin
  -- BOTH SIDES OF THE CHANGE. A reassignment moves money off one wallet and on
  -- to another, and touching only the new one leaves the old one wrong for ever.
  --
  -- Explicit branches rather than a CASE over tg_op: NEW is not readable in a
  -- DELETE trigger and OLD is not readable in an INSERT, and reaching for
  -- either raises regardless of how the expression is guarded.
  if tg_op in ('UPDATE', 'DELETE') and old.payee_id is not null then
    v_owners := v_owners || old.payee_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.payee_id is not null then
    v_owners := v_owners || new.payee_id;
  end if;

  -- Duplicates are harmless: the update below is a recompute, so running it
  -- twice for the same owner lands on the same number.
  foreach v_owner in array v_owners loop
    update public.wallets w
       set pending_kobo = (
             -- NET of the platform's cut, because that is what will actually
             -- arrive. Showing the gross would promise money nobody receives.
             select coalesce(sum(greatest(h.amount_kobo - h.commission_kobo, 0)), 0)
               from public.escrow_holds h
              where h.payee_id = w.owner_id
                and h.status = 'held'
           ),
           updated_at = now()
     where w.owner_id = v_owner;
  end loop;

  return null;
end;
$fn$;

-- AFTER, and only on the columns that can change the answer. `status` and
-- `payee_id` are the whole of it; an updated_at touch must not re-run this.
drop trigger if exists escrow_holds_sync_pending on public.escrow_holds;
create trigger escrow_holds_sync_pending
  after insert or delete or update of payee_id, status, amount_kobo, commission_kobo
  on public.escrow_holds
  for each row execute function private.sync_wallet_pending();

comment on function private.sync_wallet_pending is
  'Keeps wallets.pending_kobo equal to the sum of that owner''s held escrow, net of commission. Recomputes rather than adjusts, so it cannot drift.';

-- ── 3. Backfill ─────────────────────────────────────────────────────────────
-- Every wallet, not just the ones with holds: a wallet whose holds were all
-- released should be corrected to 0 rather than left at whatever it was.
update public.wallets w
   set pending_kobo = (
         select coalesce(sum(greatest(h.amount_kobo - h.commission_kobo, 0)), 0)
           from public.escrow_holds h
          where h.payee_id = w.owner_id
            and h.status = 'held'
       ),
       updated_at = now();

-- The inbound leg for inspections ALREADY PAID before this migration.
--
-- Written one transaction per inspection, on the same reference the function
-- above uses, so a replayed webhook cannot double-post afterwards. Only holds
-- that are still 'held' or already 'released' are covered   a cancelled hold
-- never had its money kept.
do $$
declare
  r record;
begin
  for r in
    select h.inspection_id, h.amount_kobo
      from public.escrow_holds h
     where h.inspection_id is not null
       and not exists (
         select 1 from private.ledger_transactions t
          where t.reference = 'INSPECTION_FEE_' || h.inspection_id::text
       )
  loop
    perform private.post_transaction(
      'escrow_hold',
      'Inspection fee held (backfilled)',
      jsonb_build_array(
        jsonb_build_object('account', 'payment_gateway', 'amount_kobo', -r.amount_kobo),
        jsonb_build_object('account', 'platform_escrow', 'amount_kobo',  r.amount_kobo)
      ),
      'INSPECTION_FEE_' || r.inspection_id::text
    );
  end loop;
end $$;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_src     text;
  v_escrow  bigint;
  v_pending bigint;
begin
  select prosrc into v_src from pg_proc where proname = 'confirm_inspection_payment' limit 1;
  if position('post_transaction' in v_src) = 0 then
    raise exception 'confirm_inspection_payment still posts no ledger entry';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'escrow_holds_sync_pending'
  ) then
    raise exception 'escrow_holds_sync_pending missing';
  end if;

  -- THE INVARIANT THIS MIGRATION EXISTS FOR. platform_escrow is money Sync is
  -- holding for somebody else; it cannot be negative, and it was.
  select coalesce(sum(amount_kobo), 0) into v_escrow
    from private.ledger_entries where account = 'platform_escrow';
  if v_escrow < 0 then
    raise exception 'platform_escrow is still negative (% kobo) after backfill', v_escrow;
  end if;

  -- And the cache agrees with the holds it is a cache of.
  select coalesce(sum(w.pending_kobo), 0) into v_pending from public.wallets w;
  select coalesce(sum(greatest(h.amount_kobo - h.commission_kobo, 0)), 0) into v_escrow
    from public.escrow_holds h
    join public.wallets w on w.owner_id = h.payee_id
   where h.status = 'held';
  if v_pending <> v_escrow then
    raise exception 'pending_kobo (%) does not match held escrow (%)', v_pending, v_escrow;
  end if;
end $$;
