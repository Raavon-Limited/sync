-- ============================================================================
-- inspection_escrow
--
-- A student pays to have an agent walk them through a hostel. That money has
-- never been modelled: `hostel_inspections` has carried `fee_kobo`,
-- `payment_reference` and `paid_at` since 0006, and nothing has ever written a
-- ledger entry against them. The fee could be charged and could never be paid
-- out, refunded, or forfeited.
--
-- THE TABLE ALREADY EXISTS, SO THIS EXTENDS RATHER THAN REPLACES
--   `hostel_inspections` predates all of this and already has the two columns
--   that matter for a webhook   `payment_reference` is UNIQUE, so replay
--   safety on the charge is already in the schema. A second inspections table
--   would have split one concept across two, which is the bug class the
--   verification-visit split exists to avoid.
--
-- AN INSPECTION HOLD TAKES NO COMMISSION
--   Every other hold deducts something at release. This one does not: the fee
--   is the agent's work, not a transaction Sync intermediates, so the whole
--   ₦5,000 reaches them. `commission_kobo = 0` is the entire difference   the
--   mechanism is the delivery hold's, unchanged.
--
-- THE FEE IS SNAPSHOTTED, AND STAYS SNAPSHOTTED
--   `hostel_inspections.fee_kobo` is already copied from
--   `hostels.inspection_fee_kobo` at booking (see scheduleInspection). The hold
--   reads the INSPECTION's copy, never the hostel's, so a landlord repricing
--   their listing cannot reprice a visit somebody has already paid for.
--
-- release_after IS DELIBERATELY LEFT NULL AT CREATION
--   Every other hold knows its own maturity the moment it is made. This one
--   does not: the clock starts when the agent FILES THEIR REPORT, and at
--   payment time nobody knows when that will be. `release_matured_escrow`
--   matches on `release_after <= now()`, so a null is simply never swept   the
--   money waits, which is the correct behaviour for a visit that has not
--   happened yet.
--
--   The alternative   maturing from `scheduled_for`   pays an agent who never
--   turned up, because nothing in that clock knows whether they did.
--
-- WHY 'no_show' SPLITS IN TWO
--   The status could say a no-show happened and not who caused it, which is
--   exactly the fact that decides where the money goes. `student_no_show`
--   forfeits, `agent_no_show` refunds; one value cannot express both. The old
--   value stays permitted and unused: nothing in the app reads or writes it
--   (only a type union names it), so rewriting live rows to a meaning we would
--   have to guess buys nothing.
--
-- ONE FREE RESCHEDULE, THEN THE FEE IS SYNC'S
--   `reschedule_count` with an allowance of 1. This is the ONE case where Sync
--   takes money from an inspection while taking no commission, so the copy
--   shown to a student rescheduling has to say so   otherwise the forfeit
--   reads as a bug at the worst possible moment.
--
-- ROLLBACK
--   drop function if exists public.settle_inspection(uuid, text);
--   drop function if exists public.file_inspection_report(uuid, text);
--   drop function if exists public.reschedule_inspection(uuid, timestamptz);
--   drop index if exists public.escrow_holds_one_per_inspection_idx;
--   alter table public.escrow_holds drop column if exists inspection_id;
--   alter table public.hostel_inspections
--     drop column if exists reschedule_count,
--     drop column if exists report_filed_at,
--     drop column if exists report_notes;
--   -- and restore escrow_holds_one_subject / apply_escrow_settings from
--   -- 20260902090000_money_model.sql.
-- ============================================================================

-- ── 1. Settings ─────────────────────────────────────────────────────────────
insert into public.app_settings (key, value) values
  -- How long after the agent files before the money releases without the
  -- student saying anything. Short enough that an agent is not financing the
  -- platform, long enough that a student who felt misled can speak up.
  ('inspection_release_hours', '24'::jsonb),
  -- Reschedules a student gets before the fee is forfeit. 1 = one free move.
  ('inspection_free_reschedules', '1'::jsonb)
on conflict (key) do nothing;

-- ── 2. The fifth subject ────────────────────────────────────────────────────
alter table public.escrow_holds
  add column if not exists inspection_id uuid
    references public.hostel_inspections (id) on delete cascade;

alter table public.escrow_holds drop constraint if exists escrow_holds_one_subject;
alter table public.escrow_holds add constraint escrow_holds_one_subject check (
  (order_id is not null)::int
  + (booking_id is not null)::int
  + (request_id is not null)::int
  + (delivery_id is not null)::int
  + (inspection_id is not null)::int = 1
);

-- One hold per inspection. The same protection every other subject relies on.
create unique index if not exists escrow_holds_one_per_inspection_idx
  on public.escrow_holds (inspection_id) where inspection_id is not null;

comment on column public.escrow_holds.inspection_id is
  'The agent''s inspection fee, held until the visit is settled. commission_kobo is always 0: Sync takes no cut of an inspection.';

-- ── 3. What the inspection row has to remember ──────────────────────────────
alter table public.hostel_inspections
  add column if not exists reschedule_count integer not null default 0
    check (reschedule_count >= 0),
  add column if not exists report_filed_at timestamptz,
  add column if not exists report_notes text;

alter table public.hostel_inspections drop constraint if exists hostel_inspections_status_check;
alter table public.hostel_inspections add constraint hostel_inspections_status_check
  check (status in ('pending_payment','scheduled','completed','cancelled',
                    -- Deprecated. Kept permitted so existing rows stay valid;
                    -- nothing writes it any more.
                    'no_show',
                    'student_no_show','agent_no_show'));

comment on column public.hostel_inspections.reschedule_count is
  'Student-initiated moves. Past inspection_free_reschedules, a no-show forfeits the fee to Sync.';

-- ── 4. An inspection hold costs nothing and matures on nothing ──────────────
create or replace function public.apply_escrow_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hours integer;
begin
  -- Frozen at creation, deducted at release. An explicit value survives   a
  -- negotiated rate or a correction must not be overwritten.
  if new.commission_kobo is null or new.commission_kobo = 0 then
    new.commission_kobo := case
      -- Sync takes no cut of an agent's inspection fee. Explicit rather than
      -- falling through to the 5%, so the rule is visible where it applies.
      when new.inspection_id is not null then 0
      when new.delivery_id is not null then
        private.capped_charge(new.amount_kobo, 'rider_charge_pct',
                              'rider_charge_cap_kobo', 5, 200000)
      when new.booking_id is not null then
        private.rent_charge(new.amount_kobo)
      else
        private.capped_charge(new.amount_kobo, 'service_charge_pct',
                              'service_charge_cap_kobo', 5, 200000)
    end;
  end if;

  if new.release_after is null then
    if new.inspection_id is not null then
      -- Left null on purpose: the clock starts when the agent files their
      -- report (file_inspection_report), not when the student pays. A null is
      -- never swept by release_matured_escrow, so the money waits for the
      -- visit rather than maturing on a visit that may not have happened.
      new.release_after := null;
    elsif new.booking_id is not null then
      -- Rent settles a week after move-in, not a day after payment: the student
      -- has to actually get the room. `move_in` is a date, so this is set from
      -- the booking rather than from now().
      select coalesce(b.move_in::timestamptz, now()) + interval '7 days'
        into new.release_after
        from public.bookings b where b.id = new.booking_id;
      new.release_after := coalesce(new.release_after, now() + interval '7 days');
    else
      v_hours := private.setting_int('escrow_hold_hours', 24);
      new.release_after := now() + make_interval(hours => v_hours);
    end if;
  end if;

  return new;
end;
$fn$;

-- ── 5. The agent files, and the clock starts ────────────────────────────────
create or replace function public.file_inspection_report(
  p_inspection uuid,
  p_notes      text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_i     public.hostel_inspections%rowtype;
  v_hours integer := private.setting_int('inspection_release_hours', 24);
  v_due   timestamptz;
begin
  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  -- The agent on the visit, or staff cleaning up after one.
  if v_i.ambassador_id is distinct from (select auth.uid()) and not public.is_staff() then
    raise exception 'That inspection is not yours' using errcode = '42501';
  end if;

  if v_i.status <> 'scheduled' then
    raise exception 'That inspection is not scheduled' using errcode = 'P0001';
  end if;

  v_due := now() + make_interval(hours => v_hours);

  update public.hostel_inspections
     set report_filed_at = coalesce(report_filed_at, now()),
         report_notes    = coalesce(p_notes, report_notes),
         updated_at      = now()
   where id = p_inspection;

  -- Filing twice must not push the release out again   an agent editing their
  -- notes should not delay their own money, nor extend the student's window.
  update public.escrow_holds
     set release_after = coalesce(release_after, v_due),
         updated_at    = now()
   where inspection_id = p_inspection and status = 'held';

  return v_due;
end;
$fn$;

revoke all on function public.file_inspection_report(uuid, text) from public, anon;
grant execute on function public.file_inspection_report(uuid, text) to authenticated, service_role;

-- ── 6. One free move ────────────────────────────────────────────────────────
create or replace function public.reschedule_inspection(
  p_inspection uuid,
  p_new_time   timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_i     public.hostel_inspections%rowtype;
  v_free  integer := private.setting_int('inspection_free_reschedules', 1);
begin
  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  if v_i.student_id is distinct from (select auth.uid()) and not public.is_staff() then
    raise exception 'That inspection is not yours' using errcode = '42501';
  end if;

  if v_i.status <> 'scheduled' then
    raise exception 'Only a scheduled inspection can be moved' using errcode = 'P0001';
  end if;

  if p_new_time <= now() then
    raise exception 'Pick a time in the future' using errcode = 'P0001';
  end if;

  -- The allowance is on MOVES, not on attendance: using the free move is fine,
  -- it is the no-show AFTER it that forfeits. Refusing the move here would
  -- push the student into a no-show, which costs them more.
  if v_i.reschedule_count >= v_free then
    raise exception 'You have used your free reschedule. Missing this visit forfeits the fee.'
      using errcode = 'P0001';
  end if;

  update public.hostel_inspections
     set scheduled_for   = p_new_time,
         reschedule_count = reschedule_count + 1,
         updated_at      = now()
   where id = p_inspection;

  return v_i.reschedule_count + 1;
end;
$fn$;

revoke all on function public.reschedule_inspection(uuid, timestamptz) from public, anon;
grant execute on function public.reschedule_inspection(uuid, timestamptz) to authenticated, service_role;

-- ── 7. Three ways this ends ─────────────────────────────────────────────────
-- completed         -> the agent is paid in full
-- student_no_show   -> the fee is Sync's, but only past the free reschedule
-- agent_no_show     -> the student gets their money back
create or replace function public.settle_inspection(
  p_inspection uuid,
  p_outcome    text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_i       public.hostel_inspections%rowtype;
  v_hold    public.escrow_holds%rowtype;
  v_wallet  uuid;
  v_ref     text;
  v_txn     uuid;
  v_entries jsonb;
  v_who     uuid;
begin
  if p_outcome not in ('completed', 'student_no_show', 'agent_no_show') then
    raise exception 'unknown outcome %', p_outcome using errcode = 'P0001';
  end if;

  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  select * into v_hold from public.escrow_holds
   where inspection_id = p_inspection for update;
  if not found then
    -- Inspections booked before the fee was escrowed have no hold. Not an
    -- error: there is simply nothing to settle.
    return null;
  end if;

  v_ref := 'INSPECTION_' || p_inspection::text;

  -- Idempotent on the reference. A student confirming and the sweep firing in
  -- the same minute are both normal, and must not pay twice.
  select id into v_txn from private.ledger_transactions where reference = v_ref;
  if v_txn is not null then
    return v_txn;
  end if;

  if v_hold.status <> 'held' then
    return null;
  end if;

  -- A student may confirm their own visit; an agent may not declare themselves
  -- paid, and neither party may declare the other a no-show. Everything except
  -- the student's own confirmation is staff or the sweep.
  v_who := (select auth.uid());
  if v_who is not null and not public.is_staff() then
    if not (p_outcome = 'completed' and v_who = v_i.student_id) then
      raise exception 'You cannot settle that inspection' using errcode = '42501';
    end if;
  end if;

  -- The free reschedule is an allowance against the forfeit, so a student who
  -- never used it is refunded rather than charged for missing one visit.
  if p_outcome = 'student_no_show'
     and v_i.reschedule_count < private.setting_int('inspection_free_reschedules', 1) then
    raise exception 'That student still has a free reschedule   move the visit rather than forfeiting it'
      using errcode = 'P0001';
  end if;

  if p_outcome = 'completed' then
    if v_hold.payee_id is null then
      raise exception 'That inspection has no agent to pay' using errcode = 'P0001';
    end if;
    select id into v_wallet from public.wallets where owner_id = v_hold.payee_id;
    if v_wallet is null then
      raise exception 'agent has no wallet' using errcode = 'P0002';
    end if;
    -- commission_kobo is 0 on an inspection, so the agent receives the whole
    -- fee. Written as the subtraction anyway, so a future negotiated rate
    -- needs no change here.
    v_entries := jsonb_build_array(
      jsonb_build_object('account', 'platform_escrow', 'amount_kobo', -v_hold.amount_kobo),
      jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet,
                         'amount_kobo', v_hold.amount_kobo - v_hold.commission_kobo)
    );
    if v_hold.commission_kobo > 0 then
      v_entries := v_entries || jsonb_build_array(
        jsonb_build_object('account', 'platform_revenue', 'amount_kobo', v_hold.commission_kobo)
      );
    end if;

  elsif p_outcome = 'student_no_show' then
    v_entries := jsonb_build_array(
      jsonb_build_object('account', 'platform_escrow', 'amount_kobo', -v_hold.amount_kobo),
      jsonb_build_object('account', 'platform_revenue', 'amount_kobo', v_hold.amount_kobo)
    );

  else -- agent_no_show
    select id into v_wallet from public.wallets where owner_id = v_hold.payer_id;
    if v_wallet is null then
      raise exception 'student has no wallet' using errcode = 'P0002';
    end if;
    v_entries := jsonb_build_array(
      jsonb_build_object('account', 'platform_escrow', 'amount_kobo', -v_hold.amount_kobo),
      jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet,
                         'amount_kobo', v_hold.amount_kobo)
    );
  end if;

  v_txn := private.post_transaction(
    case when p_outcome = 'agent_no_show' then 'order_refund' else 'escrow_release' end,
    case p_outcome
      when 'completed'       then 'Inspection fee'
      when 'student_no_show' then 'Inspection missed   fee forfeited'
      else                        'Inspection not attended   fee refunded'
    end,
    v_entries,
    v_ref
  );

  update public.escrow_holds
     set status      = case when p_outcome = 'agent_no_show' then 'refunded' else 'released' end,
         released_at = case when p_outcome = 'agent_no_show' then released_at else now() end,
         refunded_at = case when p_outcome = 'agent_no_show' then now() else refunded_at end,
         updated_at  = now()
   where id = v_hold.id;

  update public.hostel_inspections
     set status = p_outcome, updated_at = now()
   where id = p_inspection;

  return v_txn;
end;
$fn$;

revoke all on function public.settle_inspection(uuid, text) from public, anon;
grant execute on function public.settle_inspection(uuid, text) to authenticated, service_role;

comment on function public.settle_inspection is
  'Ends an inspection three ways: paid to the agent, forfeited to Sync after a student no-show past the free reschedule, or refunded when the agent did not attend. Idempotent by reference.';

-- ── 8. The sweep learns the third subject ───────────────────────────────────
-- Without this, `release_after` on an inspection hold is a date nothing reads,
-- and "auto-release after the agent files" never happens   the student's
-- confirmation becomes the ONLY way an agent is ever paid, which is precisely
-- the button-nobody-taps failure the auto-release exists to avoid.
create or replace function public.release_matured_escrow(p_limit integer default 200)
returns table (order_id uuid, transaction_id uuid)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r     record;
  v_txn uuid;
  v_cap integer := greatest(1, least(coalesce(p_limit, 200), 1000));
begin
  for r in
    select h.order_id
      from public.escrow_holds h
     where h.status = 'held'
       and h.order_id is not null
       and h.release_after is not null
       and h.release_after <= now()
     order by h.release_after
     limit v_cap
  loop
    begin
      v_txn := public.release_order_escrow(r.order_id);
      order_id := r.order_id;
      transaction_id := v_txn;
      return next;
    exception
      -- One bad hold must not stop the batch. The next run retries it, and
      -- release_order_escrow is idempotent so a retry is free.
      when others then
        raise warning 'escrow release failed for order %: %', r.order_id, sqlerrm;
    end;
  end loop;

  for r in
    select h.delivery_id, d.order_id as ord
      from public.escrow_holds h
      join public.deliveries d on d.id = h.delivery_id
     where h.status = 'held'
       and h.delivery_id is not null
       -- Only a delivered job is owed. An unclaimed or in-flight one has a
       -- null payee or an unfinished delivery, and release_delivery_escrow
       -- would refuse both anyway.
       and d.status = 'delivered'
       and h.payee_id is not null
     order by d.delivered_at
     limit v_cap
  loop
    begin
      v_txn := public.release_delivery_escrow(r.delivery_id);
      order_id := r.ord;
      transaction_id := v_txn;
      return next;
    exception
      when others then
        raise warning 'delivery release failed for delivery %: %', r.delivery_id, sqlerrm;
    end;
  end loop;

  -- NEW: inspections whose report was filed and whose window has passed. The
  -- filter is `release_after is not null`, which is only true once the agent
  -- filed   an unattended visit has a null and is never picked up here, so the
  -- sweep cannot pay an agent who did not turn up.
  --
  -- `order_id` comes back null: an inspection is not an order. The column is
  -- the caller's correlation handle, and there is nothing honest to put in it.
  for r in
    select h.inspection_id
      from public.escrow_holds h
      join public.hostel_inspections i on i.id = h.inspection_id
     where h.status = 'held'
       and h.inspection_id is not null
       and h.release_after is not null
       and h.release_after <= now()
       and h.payee_id is not null
       and i.status = 'scheduled'
     order by h.release_after
     limit v_cap
  loop
    begin
      -- Runs as service_role, so auth.uid() is null and settle_inspection's
      -- caller check falls through to the sweep path deliberately.
      v_txn := public.settle_inspection(r.inspection_id, 'completed');
      order_id := null;
      transaction_id := v_txn;
      return next;
    exception
      when others then
        raise warning 'inspection release failed for inspection %: %', r.inspection_id, sqlerrm;
    end;
  end loop;

  return;
end;
$fn$;

revoke all on function public.release_matured_escrow(integer) from public, anon, authenticated;
grant execute on function public.release_matured_escrow(integer) to service_role;

comment on function public.release_matured_escrow is
  'Releases every matured order hold, every delivered-but-unpaid delivery hold, and every inspection whose post-report window has passed. Service role only, called by the escrow cron. Safe to re-run: each release is idempotent.';

-- ── 9. The webhook's way in ─────────────────────────────────────────────────
-- "Paid before booking" means the CLIENT cannot create a scheduled inspection.
-- The row is written `pending_payment`, and only a charge Paystack has
-- confirmed moves it   the same shape as the wallet top-up, where the browser
-- never credits anything.
--
-- IDEMPOTENT ON payment_reference, WHICH IS ALREADY UNIQUE
--   Paystack retries. The second delivery must not create a second hold, and
--   the unique constraint from 0006 is what guarantees it: the update that
--   claims the reference either wins once or matches nothing.
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

  return v_hold;
end;
$fn$;

revoke all on function public.confirm_inspection_payment(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.confirm_inspection_payment(uuid, text, bigint) to service_role;

comment on function public.confirm_inspection_payment is
  'Called by the verified Paystack webhook only. Marks an inspection paid and opens its escrow hold. Idempotent on payment_reference.';
