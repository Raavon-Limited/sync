-- ============================================================================
-- resolve_dispute
--
-- `disputes.resolution` allows refund_full, refund_partial, release_vendor and
-- no_action. Three of those move money, and none of them could: there was no
-- refund path at all. `escrow_holds.status` has allowed 'refunded' since the
-- ledger migration and nothing has ever set it.
--
-- So a dispute could be filed and discussed, and the money stayed frozen in
-- escrow whichever way it was decided. The student order tracker even says
-- "the refund goes back to your wallet", which was not true.
--
-- STAFF ONLY, AND NOT THE PARTIES
--   The payer can release escrow (confirming delivery) because that only ever
--   moves money AWAY from them. Resolving a dispute can move money either way,
--   so neither side decides it. is_staff() is the gate.
--
-- COMMISSION IS TAKEN ONLY ON WHAT THE VENDOR ACTUALLY KEEPS
--   A full refund earns the platform nothing — charging commission on an order
--   that was never delivered would mean profiting from the failure. On a
--   partial refund the commission is capped at the vendor's remaining share.
--
-- IDEMPOTENT BY DISPUTE
--   Reference is DISPUTE_<id>. A second click, or a retried request, returns
--   the existing transaction rather than paying out twice.
--
-- ROLLBACK
--   drop function if exists public.resolve_dispute(uuid, text, bigint, text);
-- ============================================================================

create or replace function public.resolve_dispute(
  p_dispute_id  uuid,
  p_resolution  text,
  p_refund_kobo bigint default null,
  p_notes       text   default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_dispute   public.disputes%rowtype;
  v_hold      public.escrow_holds%rowtype;
  v_ref       text;
  v_txn       uuid;
  v_refund    bigint;
  v_vendor    bigint;
  v_commission bigint;
  v_student_w uuid;
  v_vendor_w  uuid;
  v_entries   jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'only staff can resolve a dispute' using errcode = '42501';
  end if;
  if p_resolution not in ('refund_full', 'refund_partial', 'release_vendor', 'no_action') then
    raise exception 'unknown resolution %', p_resolution using errcode = '22023';
  end if;

  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if not found then
    raise exception 'dispute not found' using errcode = 'P0002';
  end if;
  if v_dispute.status in ('resolved', 'rejected') then
    -- Already settled. Return whatever transaction it produced, if any.
    select id into v_txn from private.ledger_transactions
     where reference = 'DISPUTE_' || p_dispute_id::text;
    return v_txn;
  end if;

  v_ref := 'DISPUTE_' || p_dispute_id::text;
  select id into v_txn from private.ledger_transactions where reference = v_ref;

  -- no_action settles the paperwork and leaves the hold exactly as it was, so
  -- the normal release path can still run later.
  if p_resolution = 'no_action' then
    update public.disputes
       set status = 'resolved', resolution = p_resolution, resolved_by = v_uid,
           resolved_at = now(), internal_notes = coalesce(p_notes, internal_notes),
           updated_at = now()
     where id = p_dispute_id;
    return null;
  end if;

  -- Money moves, so there must be a hold to move.
  select * into v_hold from public.escrow_holds
   where (v_dispute.order_id is not null and order_id = v_dispute.order_id)
      or (v_dispute.booking_id is not null and booking_id = v_dispute.booking_id)
      or (v_dispute.request_id is not null and request_id = v_dispute.request_id)
   for update;

  if not found then
    raise exception 'no escrow hold for this dispute' using errcode = 'P0002';
  end if;
  if v_hold.status <> 'held' then
    raise exception 'escrow is already %', v_hold.status using errcode = 'P0001';
  end if;

  if v_txn is null then
    v_refund := case
      when p_resolution = 'refund_full' then v_hold.amount_kobo
      when p_resolution = 'release_vendor' then 0
      else coalesce(p_refund_kobo, 0)
    end;

    if v_refund < 0 or v_refund > v_hold.amount_kobo then
      raise exception 'refund must be between 0 and % kobo', v_hold.amount_kobo
        using errcode = '22023';
    end if;

    v_vendor := v_hold.amount_kobo - v_refund;
    -- Never more commission than the vendor is actually keeping.
    v_commission := least(v_hold.commission_kobo, v_vendor);
    v_vendor := v_vendor - v_commission;

    select id into v_student_w from public.wallets where owner_id = v_hold.payer_id;
    select id into v_vendor_w  from public.wallets where owner_id = v_hold.payee_id;
    if v_student_w is null or v_vendor_w is null then
      raise exception 'both parties need a wallet' using errcode = 'P0002';
    end if;

    -- Escrow always empties completely; the pieces are what differ.
    v_entries := jsonb_build_array(
      jsonb_build_object('account', 'platform_escrow', 'amount_kobo', -v_hold.amount_kobo)
    );
    if v_refund > 0 then
      v_entries := v_entries || jsonb_build_array(
        jsonb_build_object('account', 'user_wallet', 'wallet_id', v_student_w, 'amount_kobo', v_refund));
    end if;
    if v_vendor > 0 then
      v_entries := v_entries || jsonb_build_array(
        jsonb_build_object('account', 'user_wallet', 'wallet_id', v_vendor_w, 'amount_kobo', v_vendor));
    end if;
    if v_commission > 0 then
      v_entries := v_entries || jsonb_build_array(
        jsonb_build_object('account', 'platform_revenue', 'amount_kobo', v_commission));
    end if;

    v_txn := private.post_transaction(
      case when v_refund > 0 then 'order_refund' else 'escrow_release' end,
      'Dispute ' || v_dispute.code || ' - ' || replace(p_resolution, '_', ' '),
      v_entries,
      v_ref,
      v_dispute.order_id
    );
  end if;

  update public.escrow_holds
     set status = case when p_resolution = 'release_vendor' then 'released' else 'refunded' end,
         released_at = case when p_resolution = 'release_vendor' then now() else released_at end,
         refunded_at = case when p_resolution <> 'release_vendor' then now() else refunded_at end,
         updated_at = now()
   where id = v_hold.id;

  update public.disputes
     set status = 'resolved', resolution = p_resolution, refund_kobo = v_refund,
         resolved_by = v_uid, resolved_at = now(),
         internal_notes = coalesce(p_notes, internal_notes), updated_at = now()
   where id = p_dispute_id;

  return v_txn;
end;
$fn$;
grant execute on function public.resolve_dispute(uuid, text, bigint, text) to authenticated, service_role;
comment on function public.resolve_dispute is
  'Staff-only dispute resolution. Empties the escrow hold to the student, the vendor, or both. Idempotent by DISPUTE_<id>.';
