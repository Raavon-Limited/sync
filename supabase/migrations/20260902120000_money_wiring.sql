-- ============================================================================
-- money_wiring
--
-- 20260902090000 defined the rates, the charges and the fourth escrow subject.
-- Nothing called any of it. This is the wiring: the delivery fee is held at
-- checkout, acquires a payee when a rider claims the job, and both holds are
-- released the moment the order is delivered.
--
-- A BUG IN release_delivery_escrow IS FIXED HERE FIRST
--   It inserted straight into private.ledger_transactions with an `entries`
--   column. That column does not exist   the table is (kind, reference,
--   narrative, order_id, …) and `narrative` is NOT NULL   and the entries
--   themselves live in a separate table written by private.post_transaction.
--   plpgsql does not validate a function body at creation, so it was created
--   happily and would have raised the first time a rider was paid.
--
--   Rewritten to post the same double-entry shape release_order_escrow uses:
--   platform_escrow down, the rider's wallet up, platform_revenue the cut.
--
-- WHY THE RIDER MAY RELEASE THE VENDOR'S MONEY
--   "The vendor's fee stays in escrow until the order is delivered by a rider."
--   The rider is the one who marks it delivered, so the rider is the caller  
--   and release_order_escrow refused anybody but the payer or the cron.
--
--   It gains ONE branch: the assigned rider, and only once that delivery is
--   actually 'delivered'. Not "a rider" and not "at any time". Everything else
--   about that function is untouched, because it is live money code that three
--   other paths depend on.
--
-- RELEASING IS BEST-EFFORT, MARKING DELIVERED IS NOT
--   If a release fails   a vendor with no wallet, a ledger that will not
--   balance   the delivery is still delivered. The food arrived; refusing to
--   record that because the money could not move would leave the rider unable
--   to close the job and the student watching a stale screen. The hold stays
--   'held' and the hourly sweep picks it up, which is exactly what that sweep
--   is for.
--
-- ROLLBACK
--   -- restore checkout_cart from 20260829091000 (4-arg) or 20260902090000,
--   -- claim_delivery from 20260901270000, advance_delivery from 20260901280000,
--   -- release_order_escrow from 20260829100000, and release_delivery_escrow
--   -- from 20260902090000.
-- ============================================================================

-- ── 1. Pay the rider through the ledger, not around it ──────────────────────
create or replace function public.release_delivery_escrow(p_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hold    public.escrow_holds%rowtype;
  v_d       public.deliveries%rowtype;
  v_wallet  uuid;
  v_net     bigint;
  v_ref     text;
  v_txn     uuid;
  v_entries jsonb;
begin
  select * into v_d from public.deliveries where id = p_delivery_id;
  if not found then
    raise exception 'no such delivery' using errcode = 'P0002';
  end if;

  if v_d.status <> 'delivered' then
    raise exception 'That delivery is not complete' using errcode = 'P0001';
  end if;

  select * into v_hold from public.escrow_holds
   where delivery_id = p_delivery_id for update;
  if not found then
    -- Orders placed before the delivery hold existed have none. Not an error:
    -- there is simply nothing to release.
    return null;
  end if;

  if v_hold.payee_id is null then
    raise exception 'That delivery has no rider to pay' using errcode = 'P0001';
  end if;

  v_ref := 'DELIVERY_' || p_delivery_id::text;

  -- Idempotent on the reference, same as the order side: a retried sweep and a
  -- rider tapping twice are both normal.
  select id into v_txn from private.ledger_transactions where reference = v_ref;
  if v_txn is not null then
    return v_txn;
  end if;

  if v_hold.status <> 'held' then
    return null;
  end if;

  select id into v_wallet from public.wallets where owner_id = v_hold.payee_id;
  if v_wallet is null then
    raise exception 'rider has no wallet' using errcode = 'P0002';
  end if;

  v_net := v_hold.amount_kobo - v_hold.commission_kobo;

  v_entries := jsonb_build_array(
    jsonb_build_object('account', 'platform_escrow', 'amount_kobo', -v_hold.amount_kobo),
    jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet, 'amount_kobo', v_net)
  );
  -- A zero-kobo line is noise in a statement, and post_transaction requires
  -- every line to mean something.
  if v_hold.commission_kobo > 0 then
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object('account', 'platform_revenue', 'amount_kobo', v_hold.commission_kobo)
    );
  end if;

  v_txn := private.post_transaction(
    'escrow_release',
    'Delivery fee for order ' || upper(left(v_d.order_id::text, 8)),
    v_entries,
    v_ref,
    v_d.order_id
  );

  update public.escrow_holds
     set status = 'released', released_at = now(), updated_at = now()
   where id = v_hold.id;

  return v_txn;
end;
$fn$;

revoke all on function public.release_delivery_escrow(uuid) from public, anon;
grant execute on function public.release_delivery_escrow(uuid) to authenticated, service_role;

-- ── 2. The rider may release the vendor, once delivered ─────────────────────
-- ONE new branch on the authorisation. Everything else in this function is as
-- 20260829100000 left it.
create or replace function public.release_order_escrow(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_hold    public.escrow_holds%rowtype;
  v_order   public.orders%rowtype;
  v_wallet  uuid;
  v_net     bigint;
  v_ref     text;
  v_txn     uuid;
  v_entries jsonb;
  v_by_rider boolean := false;
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

  -- THE NEW BRANCH. The rider who carried this order, once they have marked it
  -- delivered, may release the vendor's money   because "held until delivered"
  -- means the person who delivers it is the one who ends the hold. Narrow on
  -- purpose: this rider, this delivery, and only in the 'delivered' state.
  if v_uid is not null then
    select true into v_by_rider
      from public.deliveries d
     where d.order_id = p_order_id
       and d.rider_id = v_uid
       and d.status = 'delivered'
     limit 1;
    v_by_rider := coalesce(v_by_rider, false);
  end if;

  -- Authorisation, restated because SECURITY DEFINER turned RLS off.
  -- v_uid is null for the service role (the sweep), which may release once the
  -- hold has matured.
  if v_uid is not null and v_uid <> v_hold.payer_id and not v_by_rider then
    raise exception 'only the payer, the rider who delivered it, or the platform can release escrow'
      using errcode = '42501';
  end if;
  if v_uid is null and (v_hold.release_after is null or v_hold.release_after > now()) then
    raise exception 'hold has not matured yet' using errcode = 'P0001';
  end if;

  if v_hold.status <> 'held' then
    -- Already settled. Idempotent rather than an error: a retried sweep and a
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

comment on function public.release_order_escrow is
  'Pays the vendor, less Sync''s frozen cut. Callable by the payer, by the rider who delivered it, or by the maturity sweep. Idempotent on ESCROW_<order id>.';

-- ── 3. Checkout holds the delivery fee too ──────────────────────────────────
-- Everything here is as 20260902090000 left it except the second escrow insert
-- at the end: the rider's fee is money the student has paid and nobody has
-- earned yet, which is the definition of escrow.
create or replace function public.checkout_cart(
  p_cart_id          uuid,
  p_delivery_address text,
  p_note             text default null,
  p_promotion_code   text default null,
  p_dropoff_lat      double precision default null,
  p_dropoff_lng      double precision default null
)
returns table (order_id uuid, total_kobo bigint, repriced boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_cart        public.carts%rowtype;
  v_order_id    uuid;
  v_delivery_id uuid;
  v_subtotal    bigint := 0;
  v_cart_total  bigint := 0;
  v_discount    bigint := 0;
  v_goods       bigint := 0;
  v_delivery    bigint := 0;
  v_distance    integer;
  v_sync_fee    bigint := 0;
  v_total       bigint := 0;
  v_promo       public.promotions%rowtype;
  v_item        record;
  v_repriced    boolean := false;
  v_missing     text;
  v_pickup      text;
  v_pickup_geo  extensions.geography;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_cart from public.carts
   where id = p_cart_id and student_id = v_uid and status = 'open'
   for update;

  if not found then
    raise exception 'no open cart % for this user', p_cart_id using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.cart_items where cart_id = p_cart_id) then
    raise exception 'cart is empty' using errcode = 'P0001';
  end if;

  if v_cart.storefront_id is not null
     and not public.store_accepting_orders(v_cart.storefront_id) then
    raise exception 'This store has paused new orders. Try again shortly.'
      using errcode = 'P0001';
  end if;

  select l.name into v_missing
    from public.cart_items ci
    join public.listings l on l.id = ci.listing_id
   where ci.cart_id = p_cart_id
     and not exists (
       select 1 from public.storefront_listings sl
        where sl.listing_id    = ci.listing_id
          and sl.storefront_id = v_cart.storefront_id
          and sl.is_available
     )
   limit 1;

  if v_missing is not null then
    raise exception '% is not available at this store', v_missing
      using errcode = 'P0001';
  end if;

  for v_item in
    select ci.listing_id,
           ci.quantity,
           ci.unit_price_kobo                                        as captured,
           public.store_price(v_cart.storefront_id, ci.listing_id)   as live,
           l.name,
           sl.stock
      from public.cart_items ci
      join public.listings l on l.id = ci.listing_id
      join public.storefront_listings sl
             on sl.listing_id = ci.listing_id
            and sl.storefront_id = v_cart.storefront_id
     where ci.cart_id = p_cart_id
     for update of sl
  loop
    if v_item.live is distinct from v_item.captured then
      v_repriced := true;
    end if;
    if v_item.stock is not null and v_item.stock < v_item.quantity then
      raise exception '% has only % left', v_item.name, v_item.stock using errcode = 'P0001';
    end if;
    v_subtotal   := v_subtotal   + (v_item.live * v_item.quantity);
    v_cart_total := v_cart_total + (v_item.captured * v_item.quantity);
  end loop;

  if p_promotion_code is not null then
    select * into v_promo from public.promotions
     where vendor_id = v_cart.vendor_id
       and code = p_promotion_code
       and is_active
       and starts_at <= now()
       and (ends_at is null or ends_at > now())
       and (max_redemptions is null or redemption_count < max_redemptions)
     for update;

    if found and v_subtotal >= v_promo.min_order_kobo then
      v_discount := case
        when v_promo.discount_type = 'percent'
          then (v_subtotal * v_promo.discount_value) / 100
        else least(v_promo.discount_value::bigint, v_subtotal)
      end;
      update public.promotions
         set redemption_count = redemption_count + 1
       where id = v_promo.id;
    end if;
  end if;

  -- THREE NUMBERS, AND THEY ARE NOT INTERCHANGEABLE.
  --   v_goods     the vendor's, escrowed to them
  --   v_delivery  the rider's, escrowed with no payee until somebody claims it
  --   v_sync_fee  the student's service charge, on the GOODS only   charging a
  --               percentage of the delivery too would bill the same trip
  --               twice, once through the rider's cut and once through this.
  v_goods := v_subtotal - v_discount;

  select q.distance_meters, q.fee_kobo
    into v_distance, v_delivery
    from public.quote_delivery(v_cart.storefront_id, p_dropoff_lat, p_dropoff_lng) q;

  v_sync_fee := private.capped_charge(
    v_goods, 'service_charge_pct', 'service_charge_cap_kobo', 5, 200000
  );

  v_total := v_goods + coalesce(v_delivery, 0) + v_sync_fee;

  insert into public.orders (
    student_id, vendor_id, storefront_id, status,
    subtotal_kobo, delivery_fee_kobo, sync_fee_kobo, total_kobo, delivery_address
  )
  values (
    v_uid, v_cart.vendor_id, v_cart.storefront_id, 'pending',
    v_subtotal, coalesce(v_delivery, 0), v_sync_fee, v_total, p_delivery_address
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, listing_id, qty, price_kobo, name, image_url)
  select v_order_id,
         ci.listing_id,
         ci.quantity,
         public.store_price(v_cart.storefront_id, ci.listing_id),
         l.name,
         l.image_url
    from public.cart_items ci
    join public.listings l on l.id = ci.listing_id
   where ci.cart_id = p_cart_id;

  update public.storefront_listings sl
     set stock = sl.stock - ci.quantity,
         updated_at = now()
    from public.cart_items ci
   where ci.cart_id = p_cart_id
     and sl.listing_id = ci.listing_id
     and sl.storefront_id = v_cart.storefront_id
     and sl.stock is not null;

  update public.listings l
     set sold = l.sold + ci.quantity
    from public.cart_items ci
   where ci.cart_id = p_cart_id and l.id = ci.listing_id;

  insert into public.conversations (kind, subject_type, subject_id, created_by)
  values ('order', 'order', v_order_id, v_uid);

  insert into public.conversation_participants (conversation_id, user_id, role)
  select c.id, u.uid, u.r
    from public.conversations c
    cross join (values (v_uid, 'member'), (v_cart.vendor_id, 'owner')) as u(uid, r)
   where c.subject_type = 'order' and c.subject_id = v_order_id
  on conflict do nothing;

  select s.address, s.geo into v_pickup, v_pickup_geo
    from public.storefronts s where s.id = v_cart.storefront_id;

  insert into public.deliveries (
    order_id, dropoff_address, dropoff_geo, pickup_address, pickup_geo,
    distance_meters, fee_kobo, status
  )
  values (
    v_order_id,
    p_delivery_address,
    case when p_dropoff_lat is null or p_dropoff_lng is null then null
         else extensions.ST_SetSRID(
                extensions.ST_MakePoint(p_dropoff_lng, p_dropoff_lat), 4326
              )::extensions.geography
    end,
    v_pickup,
    v_pickup_geo,
    v_distance,
    coalesce(v_delivery, 0),
    'pending'
  )
  returning id into v_delivery_id;

  -- The vendor's money.
  insert into public.escrow_holds (order_id, payer_id, payee_id, amount_kobo)
  values (v_order_id, v_uid, v_cart.vendor_id, v_goods);

  -- THE RIDER'S MONEY, WITH NO RIDER YET. A hold with an amount and a null
  -- payee is exactly what an unclaimed job is; claim_delivery fills it in.
  -- Skipped when the fee is zero, because escrow_holds requires amount > 0 and
  -- a free delivery has nothing to hold.
  if coalesce(v_delivery, 0) > 0 then
    insert into public.escrow_holds (delivery_id, payer_id, amount_kobo)
    values (v_delivery_id, v_uid, v_delivery);
  end if;

  update public.carts set status = 'ordered', updated_at = now() where id = p_cart_id;

  return query select v_order_id, v_total, v_repriced;
end;
$$;

revoke all on function public.checkout_cart(uuid, text, text, text, double precision, double precision)
  from public, anon;
grant execute on function public.checkout_cart(uuid, text, text, text, double precision, double precision)
  to authenticated, service_role;

-- ── 4. Claiming a job acquires its money ────────────────────────────────────
create or replace function public.claim_delivery(p_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_rp  public.rider_profiles%rowtype;
  v_d   public.deliveries%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_rp from public.rider_profiles where id = v_uid;
  if not found then
    raise exception 'Only a rider can take a delivery' using errcode = '42501';
  end if;

  if v_rp.verification_status <> 'verified' or v_rp.archived_at is not null then
    raise exception 'Your rider account is not verified yet' using errcode = '42501';
  end if;

  if public.is_suspended(v_uid) then
    raise exception 'Your account is suspended. Contact support@letsyncyou.com.'
      using errcode = '42501';
  end if;

  select * into v_d from public.deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'no such delivery' using errcode = 'P0002';
  end if;

  if v_d.rider_id is not null or v_d.status not in ('pending', 'offered') then
    raise exception 'Somebody already took this one' using errcode = 'P0001';
  end if;

  begin
    insert into public.delivery_offers (delivery_id, rider_id, status, responded_at)
    values (p_delivery_id, v_uid, 'accepted', now())
    on conflict (delivery_id, rider_id)
      do update set status = 'accepted', responded_at = now()
      where delivery_offers.status = 'offered';
  exception
    when unique_violation then
      raise exception 'Somebody already took this one' using errcode = 'P0001';
  end;

  update public.deliveries
     set rider_id    = v_uid,
         status      = 'assigned',
         assigned_at = now(),
         updated_at  = now()
   where id = p_delivery_id;

  -- THE MONEY GETS ITS PAYEE. Held since checkout with nobody to pay; this is
  -- the moment somebody is owed it. In the same transaction that wins the
  -- claim race, so the winner is the payee and there is no window where the
  -- job is taken but the fee still belongs to nobody.
  update public.escrow_holds
     set payee_id = v_uid, updated_at = now()
   where delivery_id = p_delivery_id
     and payee_id is null
     and status = 'held';

  update public.delivery_offers
     set status = 'expired', responded_at = now()
   where delivery_id = p_delivery_id
     and rider_id <> v_uid
     and status = 'offered';

  return p_delivery_id;
end;
$fn$;

revoke all on function public.claim_delivery(uuid) from public, anon;
grant execute on function public.claim_delivery(uuid) to authenticated, service_role;

-- ── 5. Delivered releases both ──────────────────────────────────────────────
create or replace function public.advance_delivery(
  p_delivery_id uuid,
  p_status      text
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := (select auth.uid());
  v_old   text;
  v_ok    boolean;
  v_order uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select status, order_id into v_old, v_order
    from public.deliveries
   where id = p_delivery_id and rider_id = v_uid
     for update;

  if not found then
    raise exception 'That delivery is not yours' using errcode = '42501';
  end if;

  v_ok := case p_status
            when 'picked_up'  then v_old = 'assigned'
            when 'delivering' then v_old = 'picked_up'
            when 'delivered'  then v_old in ('picked_up', 'delivering')
            when 'failed'     then v_old in ('assigned', 'picked_up', 'delivering')
            else false
          end;

  if not v_ok then
    raise exception 'A delivery cannot go from % to %', v_old, p_status
      using errcode = '22023';
  end if;

  update public.deliveries
     set status       = p_status,
         picked_up_at = case when p_status = 'picked_up' then now() else picked_up_at end,
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
         updated_at   = now()
   where id = p_delivery_id;

  if p_status = 'delivered' then
    -- The order is complete, so the vendor's screen should say so.
    update public.orders
       set status = 'delivered', delivered_at = now(), updated_at = now()
     where id = v_order and status <> 'delivered';

    -- BEST EFFORT, BOTH OF THEM. The food arrived; refusing to record that
    -- because money could not move would leave the rider unable to close the
    -- job. A hold that stays 'held' is picked up by the hourly sweep, which is
    -- what that sweep is for.
    begin
      perform public.release_order_escrow(v_order);
    exception when others then
      raise warning 'vendor escrow not released for order %: %', v_order, sqlerrm;
    end;

    begin
      perform public.release_delivery_escrow(p_delivery_id);
    exception when others then
      raise warning 'rider escrow not released for delivery %: %', p_delivery_id, sqlerrm;
    end;
  end if;

  return p_status;
end;
$fn$;

revoke all on function public.advance_delivery(uuid, text) from public, anon;
grant execute on function public.advance_delivery(uuid, text) to authenticated, service_role;

comment on function public.advance_delivery is
  'Move one of your own deliveries to its next state. Marking it delivered also settles both escrows - the vendor''s and your own - best effort, with the hourly sweep as the backstop.';

-- ── 6. The sweep has to reach delivery holds, or the backstop is a fiction ──
-- release_matured_escrow selected `where order_id is not null`, which is every
-- hold EXCEPT a delivery one   a delivery hold carries delivery_id and a null
-- order_id, by design (see 20260902090000). So a rider payout that failed in
-- advance_delivery would never have been retried by anything, and the comment
-- above would have been a lie.
--
-- A delivery hold matures on the JOB being delivered, not on the clock: the
-- rider is owed the moment the food arrives, and `release_after` on that hold
-- is only a fallback. The second loop selects on the delivery's status instead.
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

  return;
end;
$fn$;

revoke all on function public.release_matured_escrow(integer) from public, anon, authenticated;
grant execute on function public.release_matured_escrow(integer) to service_role;

comment on function public.release_matured_escrow is
  'Releases every matured order hold and every delivered-but-unpaid delivery hold. Service role only, called by the escrow cron. Safe to re-run: each release is idempotent.';
