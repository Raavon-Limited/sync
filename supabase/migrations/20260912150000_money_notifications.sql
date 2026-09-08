-- ============================================================================
-- money_notifications
--
-- WHY
--   NOT ONE MONEY EVENT ON SYNC NOTIFIES ANYBODY. Every producer in
--   20260823100000 is about a STATUS - a message, an order, a booking, a
--   delivery - and none of them is about money moving. `credit_wallet_topup`,
--   `confirm_inspection_payment`, every `release_*_escrow`, every refund: zero
--   calls to `private.notify` between them. A student paid ₦300,000 and Sync
--   told them nothing; a landlord's rent was released and they found out by
--   opening the wallet and noticing.
--
-- WHY A TRIGGER ON THE LEDGER, AND NOT A LINE IN EACH FUNCTION
--   There are at least eight functions that move money into a wallet
--   (release_order_escrow, release_delivery_escrow, release_event_escrow,
--   release_matured_escrow, credit_wallet_topup, the refund paths...), several
--   of them redefined across three or four migrations. Adding a notify to each
--   means reproducing eight money-function bodies exactly and getting every one
--   right, and it means the ninth - written next month - is silent again.
--
--   Every one of them ends in `private.post_transaction`, which writes
--   `private.ledger_entries`. One trigger there covers all of them, including
--   the ones that do not exist yet. This is the same reasoning that put booking
--   alerts on a trigger rather than inside `acceptBookingRequest`.
--
-- BOTH DIRECTIONS ARE WORTH TELLING
--   Money in is the obvious one. Money out matters just as much: it is the
--   receipt for a payment somebody just authorised, and it is the first thing
--   they would want if they had NOT authorised it. A wallet debit nobody was
--   told about is how a compromised account stays unnoticed.
--
-- THE ACTOR IS TOLD, WHICH `private.notify` DELIBERATELY WILL NOT DO
--   That function drops any alert whose recipient is `auth.uid()`, on the sound
--   general principle that you do not need telling about what you just did. For
--   money that principle is wrong: a payment confirmation is a record, not
--   news, and it is the thing people look for when they are unsure whether a
--   press went through. `private.notify_money` below is the same insert without
--   that check - and it is the ONLY exception; do not widen it.
--
--   (It is also why a landlord who books a room in their own hostel saw
--   nothing at all: they were the actor on both sides, so both alerts were
--   dropped, and messaging plus notifications both looked broken when neither
--   was.)
--
-- ROLLBACK
--   drop trigger if exists ledger_entries_notify on private.ledger_entries;
--   drop trigger if exists inspections_notify_paid on public.hostel_inspections;
--   drop function if exists private.notify_wallet_movement();
--   drop function if exists private.notify_inspection_paid();
--   drop function if exists private.notify_money(uuid, text, text, text, text, uuid, text);
-- ============================================================================

-- ── 1. The one exception to "do not tell people what they just did" ──────────
create or replace function private.notify_money(
  p_user_id     uuid,
  p_title       text,
  p_body        text,
  p_href        text default 'wallet',
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_kind        text default 'payment'
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_user_id is null then
    return;
  end if;

  -- NO auth.uid() CHECK. See the header: the payer is exactly who wants this.
  --
  -- `role` is left null on purpose. A wallet is one wallet across every role a
  -- person holds, so a payment alert is not a landlord alert or a student
  -- alert - scoping it to one dashboard would hide a debit from the same
  -- person on the other.
  insert into public.notifications
    (user_id, kind, title, body, href, entity_type, entity_id, role)
  values
    (p_user_id, p_kind, p_title, p_body, p_href, p_entity_type, p_entity_id, null);
exception
  when others then
    -- An alert must never take down the money write that caused it. This is
    -- the same contract private.notify holds, and it matters more here.
    raise warning 'notify_money failed for % (%): %', p_user_id, p_title, sqlerrm;
end;
$fn$;

comment on function private.notify_money is
  'Wallet movement alerts. Unlike private.notify this DOES tell the actor: a payment confirmation is a record, not news.';

-- ── 2. Every wallet movement, whatever moved it ──────────────────────────────
create or replace function private.notify_wallet_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_owner  uuid;
  v_kind   text;
  v_naira  text;
  v_title  text;
  v_body   text;
begin
  -- Only the user-facing half of a transaction. Every entry has a matching
  -- internal one (payment_gateway, platform_escrow) and nobody is notified
  -- about the platform's own books.
  if new.account <> 'user_wallet' or new.wallet_id is null or new.amount_kobo = 0 then
    return new;
  end if;

  select w.owner_id into v_owner from public.wallets w where w.id = new.wallet_id;
  if v_owner is null then
    return new;
  end if;

  select t.kind into v_kind
    from private.ledger_transactions t where t.id = new.transaction_id;

  -- Whole naira. Kobo precision in an alert is noise on every amount Sync
  -- actually moves, and "₦300,000.00" reads worse than "₦300,000".
  v_naira := '₦' || to_char(round(abs(new.amount_kobo) / 100.0), 'FM999,999,999,999');

  if new.amount_kobo > 0 then
    case v_kind
      when 'wallet_topup' then
        v_title := v_naira || ' added to your wallet';
        v_body  := 'Your top-up went through. It is ready to spend across Sync.';
      when 'escrow_release' then
        v_title := v_naira || ' released to your wallet';
        v_body  := 'Money that was held in escrow has now been paid out to you.';
      when 'order_refund' then
        v_title := v_naira || ' refunded';
        v_body  := 'The refund has landed in your wallet.';
      when 'payout' then
        v_title := v_naira || ' paid out';
        v_body  := 'Your payout has been processed.';
      else
        v_title := v_naira || ' received';
        v_body  := 'Money has arrived in your Sync wallet.';
    end case;
  else
    case v_kind
      when 'escrow_hold' then
        v_title := v_naira || ' paid';
        v_body  := 'It is held safely in escrow and released to the other side once the deal is done.';
      when 'wallet_withdrawal' then
        v_title := v_naira || ' withdrawn';
        v_body  := 'Your withdrawal is on its way to your bank.';
      when 'order_payment' then
        v_title := v_naira || ' paid';
        v_body  := 'Your order has been paid for.';
      when 'subscription_charge' then
        v_title := v_naira || ' charged';
        v_body  := 'Your subscription has renewed.';
      else
        v_title := v_naira || ' left your wallet';
        -- Worded so an unexpected one reads as something to act on. This alert
        -- is the only chance somebody has to notice a debit they did not make.
        v_body  := 'If this was not you, contact support straight away.';
    end case;
  end if;

  perform private.notify_money(v_owner, v_title, v_body, 'wallet', 'wallet', new.wallet_id);
  return new;
end;
$fn$;

drop trigger if exists ledger_entries_notify on private.ledger_entries;
create trigger ledger_entries_notify
  after insert on private.ledger_entries
  for each row execute function private.notify_wallet_movement();

-- ── 3. A paid viewing is on the board, which is the thing worth saying ───────
-- Not a wallet movement for the student - the fee goes to Paystack, not out of
-- their balance - so the ledger trigger above never sees it.
create or replace function private.notify_inspection_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hostel text;
begin
  if new.status is not distinct from old.status or new.status <> 'scheduled' then
    return new;
  end if;

  select h.name into v_hostel from public.hostels h where h.id = new.hostel_id;

  perform private.notify_money(
    new.student_id,
    'Your viewing is booked',
    'We have your fee for ' || coalesce(v_hostel, 'the hostel') ||
    '. Agents can see your request now - one will take it and propose a time for you to confirm.',
    'bookings', 'inspection', new.id, 'inspection'
  );
  return new;
end;
$fn$;

drop trigger if exists inspections_notify_paid on public.hostel_inspections;
create trigger inspections_notify_paid
  after update on public.hostel_inspections
  for each row execute function private.notify_inspection_paid();

-- ── Verify ──────────────────────────────────────────────────────────────────
-- The point of all of this is that the PAYER hears about their own payment.
-- A rewrite that routes notify_money back through private.notify would pass
-- every other reading of this file and silently restore the silence.
do $verify$
declare
  v_before bigint;
  v_after  bigint;
  v_user   uuid;
begin
  if to_regprocedure('private.notify_money(uuid, text, text, text, text, uuid, text)') is null then
    raise exception 'notify_money missing';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'ledger_entries_notify' and not tgisinternal
  ) then
    raise exception 'ledger_entries_notify trigger missing';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'inspections_notify_paid' and not tgisinternal
  ) then
    raise exception 'inspections_notify_paid trigger missing';
  end if;

  -- notify_money must NOT inherit the self-suppression. Proven by writing one
  -- for a real profile and counting, rather than by reading the source.
  select id into v_user from public.profiles limit 1;
  if v_user is null then
    raise notice 'no profiles yet - skipping the delivery assertion';
    return;
  end if;

  select count(*) into v_before from public.notifications where user_id = v_user;
  perform private.notify_money(v_user, 'verify', 'verify', 'wallet', null, null, 'payment');
  select count(*) into v_after from public.notifications where user_id = v_user;

  if v_after <> v_before + 1 then
    raise exception 'notify_money did not deliver - the actor is being suppressed again';
  end if;

  delete from public.notifications
   where user_id = v_user and title = 'verify' and kind = 'payment';
end;
$verify$;
