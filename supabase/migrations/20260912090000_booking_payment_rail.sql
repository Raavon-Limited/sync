-- ============================================================================
-- booking_payment_rail
--
-- A student could be told "pay within 24 hours" and had no way to pay.
--
-- Nothing in the product created an escrow hold for a booking, the Paystack
-- webhook handled only `wallet_topup` and `inspection_fee`, and there was no
-- wallet-debit path. So the whole hold system built above it terminated in a
-- deadline nobody could satisfy: every accepted booking could only ever expire.
--
-- WALLET FIRST, which is the model already chosen for this platform: every
-- payment lands in a user wallet and every payout leaves from one. Topping the
-- wallet up is an existing, working Paystack flow (`wallet_topup`), so rent does
-- not need a second gateway integration - it needs a debit.
--
-- ── MOVE-IN IS SET AT PAYMENT, AND THAT FIXES THE ESCROW CLOCK ───────────────
--   `apply_escrow_settings` already dates a rent hold as `move_in + 7 days`,
--   with the comment "rent settles a week after move-in, not a day after
--   payment: the student has to actually get the room". Correct - and it has
--   never once happened, because `move_in` is null on every booking and the
--   fallback silently made it `now() + 7 days`.
--
--   Nothing ever collected a move-in date. Asking at request time would be
--   asking someone to commit to a date for a room they might not get; asking at
--   payment is the first moment it is real. So `pay_booking_from_wallet` takes
--   it, writes it BEFORE the hold is inserted (the trigger reads the booking),
--   and the seven days finally anchor where they were always meant to.
--
-- ── THE 72-HOUR REFUND WINDOW ───────────────────────────────────────────────
--   Cooling off, not arbitration. A student who pays and immediately realises
--   they picked the wrong hostel gets their money back without needing staff,
--   and a landlord knows the position is final after three days rather than
--   open until escrow matures.
--
--   It closes EARLY the moment the student confirms they moved in, because at
--   that point they have the thing they paid for. The landlord marking move-in
--   does not close it on its own - only the student's own confirmation does.
--   Marking is the prompt; confirming is the act.
--
--   After 72 hours, or after confirmation, the only route is `disputes` and
--   `resolve_dispute`, which is staff-arbitrated and already exists.
-- ============================================================================

alter table public.bookings
  add column if not exists moved_in_at          timestamptz,
  add column if not exists move_in_confirmed_at timestamptz;

comment on column public.bookings.moved_in_at is
  'The LANDLORD says this tenant has moved in. A prompt, not a gate: it does not close the refund window on its own.';
comment on column public.bookings.move_in_confirmed_at is
  'The STUDENT confirms they moved in. This is what closes the 72h refund window early - they have what they paid for.';

/** How long after paying a student may still walk away without arbitration. */
create or replace function public.refund_window()
returns interval language sql immutable as $$ select interval '72 hours' $$;

-- ── 1. Pay ──────────────────────────────────────────────────────────────────

create or replace function public.pay_booking_from_wallet(
  p_booking uuid,
  p_move_in date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_b        public.bookings%rowtype;
  v_uid      uuid := (select auth.uid());
  v_landlord uuid;
  v_total    bigint;
  v_wallet   uuid;
  v_balance  bigint;
  v_hold     uuid;
begin
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'That booking does not exist' using errcode = 'P0002';
  end if;

  -- Only the student on the row, and only their own money.
  if v_b.student_id is distinct from v_uid then
    raise exception 'That is not your booking' using errcode = '42501';
  end if;

  -- Already paid is not an error worth failing a double-click over: return the
  -- existing hold and let the caller carry on.
  if v_b.status = 'confirmed' then
    select id into v_hold from public.escrow_holds where booking_id = p_booking;
    return v_hold;
  end if;

  if v_b.status <> 'awaiting_payment' then
    raise exception 'This booking is not waiting on payment' using errcode = 'P0001';
  end if;

  -- The hold is the whole reason there is a deadline. Paying against a lapsed
  -- one would take money for a room `expire_stale_holds` is about to release.
  if v_b.reserved_until is null or v_b.reserved_until <= now() then
    raise exception 'That hold has expired and the room is back on the market'
      using errcode = 'P0001';
  end if;

  select h.landlord_id into v_landlord from public.hostels h where h.id = v_b.hostel_id;

  -- `quote_rent` owns fee_mode: on 'pass_on' the student's total includes our
  -- charge, on 'absorb' it does not. Recomputed here rather than trusted from
  -- the client, which is the only place it can be trusted.
  select q.total_kobo into v_total from public.quote_rent(v_b.hostel_id) q;
  if v_total is null or v_total <= 0 then
    raise exception 'That hostel has no price set' using errcode = 'P0001';
  end if;

  select id, balance_kobo into v_wallet, v_balance
    from public.wallets where owner_id = v_uid for update;
  if v_wallet is null then
    raise exception 'You do not have a wallet yet' using errcode = 'P0002';
  end if;
  if v_balance < v_total then
    raise exception 'Your wallet has % but the rent is %. Top up and try again.',
      (v_balance / 100)::text, (v_total / 100)::text using errcode = 'P0001';
  end if;

  /*
   * MOVE-IN BEFORE THE HOLD, and the order is load-bearing.
   *
   * `apply_escrow_settings` is a BEFORE trigger on escrow_holds that reads
   * `bookings.move_in` to date the release. Insert the hold first and it reads
   * a null and falls back to now() + 7 days, which is the bug this migration
   * exists to close.
   */
  update public.bookings
     set move_in    = p_move_in,
         status     = 'confirmed',
         paid_at    = now(),
         updated_at = now()
   where id = p_booking;

  -- Student's wallet out, platform escrow in. Balanced, or post_transaction
  -- raises before writing anything.
  perform private.post_transaction(
    'escrow_hold',
    'Rent held',
    jsonb_build_array(
      jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet, 'amount_kobo', -v_total),
      jsonb_build_object('account', 'platform_escrow', 'amount_kobo', v_total)
    ),
    'BOOKING_RENT_' || p_booking::text
  );

  -- commission_kobo and release_after are left to apply_escrow_settings: 2.5%
  -- of rent, uncapped, and move_in + 7 days.
  insert into public.escrow_holds (booking_id, payer_id, payee_id, amount_kobo)
  values (p_booking, v_uid, v_landlord, v_total)
  returning id into v_hold;

  return v_hold;
end;
$fn$;

revoke all on function public.pay_booking_from_wallet(uuid, date) from public, anon;
grant execute on function public.pay_booking_from_wallet(uuid, date) to authenticated, service_role;

comment on function public.pay_booking_from_wallet is
  'The student pays rent from their wallet, sets their move-in date and confirms the booking. Recomputes the price server-side via quote_rent; refuses a lapsed hold.';

-- ── 2. The move-in handshake ────────────────────────────────────────────────

create or replace function public.mark_moved_in(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from public.bookings b
      join public.hostels h on h.id = b.hostel_id
     where b.id = p_booking
       and h.landlord_id = (select auth.uid())
       and b.status = 'confirmed'
  ) into v_ok;

  if not v_ok then
    raise exception 'That is not a confirmed booking on your hostel' using errcode = '42501';
  end if;

  update public.bookings
     set moved_in_at = coalesce(moved_in_at, now()), updated_at = now()
   where id = p_booking;
end;
$fn$;

revoke all on function public.mark_moved_in(uuid) from public, anon;
grant execute on function public.mark_moved_in(uuid) to authenticated, service_role;

create or replace function public.confirm_move_in(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.bookings
     set move_in_confirmed_at = coalesce(move_in_confirmed_at, now()),
         updated_at           = now()
   where id = p_booking
     and student_id = (select auth.uid())
     and status = 'confirmed';

  if not found then
    raise exception 'That is not a confirmed booking of yours' using errcode = '42501';
  end if;
end;
$fn$;

revoke all on function public.confirm_move_in(uuid) from public, anon;
grant execute on function public.confirm_move_in(uuid) to authenticated, service_role;

comment on function public.confirm_move_in is
  'The student says they are in. Closes the 72h refund window early - do not make the landlord able to call this, or the refund could be taken away from the person it protects.';

-- ── 3. Refund inside the window ─────────────────────────────────────────────

create or replace function public.refund_booking(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_b      public.bookings%rowtype;
  v_hold   public.escrow_holds%rowtype;
  v_wallet uuid;
begin
  select * into v_b from public.bookings where id = p_booking for update;
  if not found or v_b.student_id is distinct from (select auth.uid()) then
    raise exception 'That is not your booking' using errcode = '42501';
  end if;
  if v_b.status <> 'confirmed' or v_b.paid_at is null then
    raise exception 'That booking has not been paid for' using errcode = 'P0001';
  end if;

  -- Confirmation closes the window whatever the clock says. They have the room.
  if v_b.move_in_confirmed_at is not null then
    raise exception 'You have confirmed you moved in, so this is settled through a dispute now'
      using errcode = 'P0001';
  end if;
  if now() > v_b.paid_at + public.refund_window() then
    raise exception 'The 72 hours to change your mind have passed. Open a dispute instead.'
      using errcode = 'P0001';
  end if;

  select * into v_hold from public.escrow_holds
   where booking_id = p_booking and status = 'held' for update;
  if not found then
    raise exception 'There is nothing held for this booking' using errcode = 'P0002';
  end if;

  select id into v_wallet from public.wallets where owner_id = v_b.student_id for update;

  -- The exact reverse of the payment leg. The landlord is never debited,
  -- because nothing was ever released to them.
  perform private.post_transaction(
    'refund',
    'Rent refunded inside the 72 hour window',
    jsonb_build_array(
      jsonb_build_object('account', 'platform_escrow', 'amount_kobo', -v_hold.amount_kobo),
      jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet, 'amount_kobo', v_hold.amount_kobo)
    ),
    'BOOKING_REFUND_' || p_booking::text
  );

  update public.escrow_holds
     set status = 'refunded', refunded_at = now(), updated_at = now()
   where id = v_hold.id;

  -- Back to cancelled, which frees the room: `hostel_room_state` only counts
  -- confirmed and live-held bookings.
  update public.bookings
     set status = 'cancelled', updated_at = now()
   where id = p_booking;
end;
$fn$;

revoke all on function public.refund_booking(uuid) from public, anon;
grant execute on function public.refund_booking(uuid) to authenticated, service_role;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc where proname = 'pay_booking_from_wallet' limit 1;
  if v_src is null then
    raise exception 'pay_booking_from_wallet is missing';
  end if;

  -- The ordering that makes the escrow clock correct. If a rewrite moves the
  -- hold insert above the booking update, release_after silently reverts to
  -- now() + 7 days and nobody notices for a week.
  if position('move_in' in v_src) = 0 then
    raise exception 'pay_booking_from_wallet does not set move_in - the escrow clock would fall back';
  end if;
  if position('reserved_until' in v_src) = 0 then
    raise exception 'pay_booking_from_wallet does not check the hold has not lapsed';
  end if;

  -- The refund must never be reachable by the landlord.
  select prosrc into v_src from pg_proc where proname = 'confirm_move_in' limit 1;
  if position('student_id' in v_src) = 0 then
    raise exception 'confirm_move_in is not scoped to the student';
  end if;

  if has_function_privilege('anon', 'public.pay_booking_from_wallet(uuid, date)', 'execute') then
    raise exception 'anon can execute pay_booking_from_wallet';
  end if;
end $$;
