-- ############################################################################
-- DO NOT APPLY. SUPERSEDED BEFORE IT EVER RAN.
--
-- This file removes the vendor commission outright. That is NOT the model:
-- the vendor pays 5% capped at N2,000, the rider pays 5% capped, the student
-- pays 5% capped, and a landlord pays 2.5%. Every one of them is DEDUCTED AT
-- ESCROW RELEASE rather than at checkout, and the delivery fee is escrowed too
-- rather than paid out directly.
--
-- Rewrite against that model before applying anything here. The delivery
-- pricing and the quote function below are still right; the charge logic is
-- not.
-- ############################################################################

-- ============================================================================
-- money_model
--
-- Sync stops taking a cut of what a vendor sells, and starts charging for the
-- two things it actually provides on top: the platform, and the delivery.
--
-- WHAT WAS WRONG
--   `apply_escrow_settings` (20260827090000) took 10% of EVERY order out of the
--   vendor's payout, frozen onto the hold at creation. That was the model when
--   vendors paid nothing else. They now pay a subscription, so the commission
--   was charging twice for the same thing.
--
-- WHO PAYS WHAT NOW
--   vendor, landlord   a subscription. Nothing per order. No commission.
--   student            a service charge on what they buy - food, tickets,
--                      rent - at 5%, capped. The cap is the point: a ₦4,000
--                      lunch and a ₦400,000 year's rent are the same amount of
--                      platform, and 5% uncapped on the rent would be absurd.
--   rider              5% of the delivery fee, capped, per completed job,
--                      because riders do not subscribe. Deducted from what they
--                      earn rather than added to what the student pays.
--
-- COMMISSION IS SET TO 0, NOT DELETED
--   `private.setting_int('commission_pct', 10)` falls back to 10 when the key is
--   MISSING, so deleting the row would restore the very charge this migration
--   removes. It is written to 0 explicitly, and the trigger stops computing it
--   at all.
--
--   Holds that already carry a commission KEEP it. They were created under the
--   old arrangement, the vendor was told that at the time, and rewriting
--   settled money to match a new policy is not a migration, it is an
--   adjustment somebody has to explain.
--
-- THE DELIVERY FEE IS PRICED FROM DISTANCE THE SERVER MEASURES
--   The caller passes the dropoff COORDINATES, not a distance. A client that
--   hands over "1.2 km" is quoting its own fee; one that hands over a point is
--   stating where it wants the food, which is checkable and is what the rider
--   is going to ride to anyway.
--
-- ROLLBACK
--   drop function if exists public.quote_delivery(uuid, double precision, double precision);
--   drop function if exists private.capped_charge(bigint, text, text, integer, bigint);
--   alter table public.deliveries drop column if exists platform_fee_kobo;
--   update public.app_settings set value = '10'::jsonb where key = 'commission_pct';
--   -- and restore apply_escrow_settings and checkout_cart from
--   -- 20260827090000 and 20260829091000 respectively.
-- ============================================================================

-- ── 1. The settings ─────────────────────────────────────────────────────────
insert into public.app_settings (key, value) values
  ('service_charge_pct',      '5'::jsonb),
  ('service_charge_cap_kobo', '200000'::jsonb),   -- ₦2,000
  ('rider_charge_pct',        '5'::jsonb),
  ('rider_charge_cap_kobo',   '200000'::jsonb),   -- ₦2,000
  -- Delivery: a flag-fall plus a per-kilometre rate, with a floor. The floor
  -- exists because a 200-metre delivery still costs a rider a trip.
  ('delivery_base_kobo',      '30000'::jsonb),    -- ₦300
  ('delivery_per_km_kobo',    '10000'::jsonb),    -- ₦100 / km
  ('delivery_min_kobo',       '30000'::jsonb),    -- ₦300
  -- Beyond this a campus delivery is not a campus delivery. Priced at the cap
  -- rather than refused, so an edge-of-town address does not dead-end checkout.
  ('delivery_max_km',         '20'::jsonb)
on conflict (key) do nothing;

-- Explicit 0, for the fallback reason in the header.
update public.app_settings set value = '0'::jsonb where key = 'commission_pct';

-- ── 2. Stop charging commission ─────────────────────────────────────────────
create or replace function public.apply_escrow_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hours integer;
begin
  -- COMMISSION IS NO LONGER APPLIED. The column stays, and rows written before
  -- this migration keep the value they were created with — release_order_escrow
  -- and resolve_dispute still subtract it, which is correct for those rows and
  -- a no-op for every new one.
  if new.release_after is null then
    v_hours := private.setting_int('escrow_hold_hours', 24);
    new.release_after := now() + make_interval(hours => v_hours);
  end if;

  return new;
end;
$fn$;

comment on function public.apply_escrow_settings is
  'Stamps the maturity window onto a new escrow hold. No longer applies commission - vendors pay a subscription instead (see 20260902090000).';

-- ── 3. A percentage with a ceiling ──────────────────────────────────────────
-- Both charges are the same shape, and the cap is the part that matters: 5% of
-- a year's rent is not a service charge, it is a share of the rent.
create or replace function private.capped_charge(
  p_amount_kobo bigint,
  p_pct_key     text,
  p_cap_key     text,
  p_pct_default integer,
  p_cap_default bigint
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_pct integer := private.setting_int(p_pct_key, p_pct_default);
  v_cap bigint  := private.setting_int(p_cap_key, p_cap_default::integer);
begin
  if p_amount_kobo <= 0 then
    return 0;
  end if;
  -- Integer division floors, which rounds in the payer's favour. On a ₦3,500
  -- order that is a few kobo, and favouring the person being charged is the
  -- right direction to be wrong in.
  return least((p_amount_kobo * v_pct) / 100, v_cap);
end;
$fn$;

grant execute on function private.capped_charge(bigint, text, text, integer, bigint) to service_role;

-- ── 4. What a delivery to this point costs ──────────────────────────────────
-- Callable before checkout, so the fee is on screen BEFORE somebody pays it.
-- A delivery fee that first appears on the receipt is a complaint.
create or replace function public.quote_delivery(
  p_storefront uuid,
  p_lat        double precision,
  p_lng        double precision
)
returns table (distance_meters integer, fee_kobo bigint)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_geo      extensions.geography;
  v_metres   double precision;
  v_base     integer := private.setting_int('delivery_base_kobo', 30000);
  v_per_km   integer := private.setting_int('delivery_per_km_kobo', 10000);
  v_min      integer := private.setting_int('delivery_min_kobo', 30000);
  v_max_km   integer := private.setting_int('delivery_max_km', 20);
  v_fee      bigint;
begin
  select s.geo into v_geo from public.storefronts s where s.id = p_storefront;

  -- No pin on the store, or no point from the caller: the flag-fall stands in.
  -- Refusing here would block checkout over a branch whose owner never dropped
  -- a pin, which is the store's gap and not the student's problem.
  if v_geo is null or p_lat is null or p_lng is null then
    distance_meters := null;
    fee_kobo := greatest(v_base, v_min);
    return next;
    return;
  end if;

  v_metres := extensions.ST_Distance(
    v_geo,
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography
  );

  -- Clamped, not refused. An address the geocoder placed in the next state
  -- should cost the ceiling and get a phone call, not end the order.
  v_metres := least(v_metres, v_max_km * 1000.0);

  v_fee := v_base + ((v_metres / 1000.0) * v_per_km)::bigint;
  distance_meters := round(v_metres)::integer;
  fee_kobo := greatest(v_fee, v_min);
  return next;
end;
$fn$;

revoke all on function public.quote_delivery(uuid, double precision, double precision) from public, anon;
grant execute on function public.quote_delivery(uuid, double precision, double precision)
  to authenticated, service_role;

comment on function public.quote_delivery is
  'What a delivery from this branch to this point costs, and how far it is. Safe to call before checkout so the fee is visible before it is charged.';

-- ── 5. The rider's cut, recorded on the delivery ────────────────────────────
alter table public.deliveries
  add column if not exists platform_fee_kobo bigint not null default 0
    check (platform_fee_kobo >= 0);

comment on column public.deliveries.platform_fee_kobo is
  'Sync''s 5% (capped) of the delivery fee. Deducted from the rider''s earnings, not added to what the student pays. Stamped at creation and frozen, so a later rate change cannot alter a job already taken.';

-- Frozen at creation, for the same reason the old commission was: a rider who
-- accepted a job at one rate must not be paid at another.
create or replace function public.apply_delivery_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.platform_fee_kobo is null or new.platform_fee_kobo = 0 then
    new.platform_fee_kobo := private.capped_charge(
      new.fee_kobo, 'rider_charge_pct', 'rider_charge_cap_kobo', 5, 200000
    );
  end if;
  return new;
end;
$fn$;

drop trigger if exists deliveries_apply_charge on public.deliveries;
create trigger deliveries_apply_charge
  before insert on public.deliveries
  for each row execute function public.apply_delivery_charge();

-- ── 6. Checkout, priced ─────────────────────────────────────────────────────
-- DROPPED FIRST, NOT REPLACED. Adding two arguments with defaults would leave
-- the four-argument form in place beside this one, and PostgREST resolves an
-- RPC by the exact set of argument names it is given — every existing call
-- would become ambiguous rather than picking up the new behaviour.
drop function if exists public.checkout_cart(uuid, text, text, text);

create or replace function public.checkout_cart(
  p_cart_id          uuid,
  p_delivery_address text,
  p_note             text default null,
  p_promotion_code   text default null,
  -- Where it is going. Optional, because an address typed by hand has no point
  -- attached; the quote falls back to the flag-fall in that case.
  p_dropoff_lat      double precision default null,
  p_dropoff_lng      double precision default null
)
returns table (order_id uuid, total_kobo bigint, repriced boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_cart       public.carts%rowtype;
  v_order_id   uuid;
  v_subtotal   bigint := 0;
  v_cart_total bigint := 0;
  v_discount   bigint := 0;
  v_goods      bigint := 0;
  v_delivery   bigint := 0;
  v_distance   integer;
  v_sync_fee   bigint := 0;
  v_total      bigint := 0;
  v_promo      public.promotions%rowtype;
  v_item       record;
  v_repriced   boolean := false;
  v_missing    text;
  v_pickup     text;
  v_pickup_geo extensions.geography;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lock the cart so two taps on "Pay" cannot both produce an order.
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

  -- THE THREE NUMBERS, AND THEY ARE NOT INTERCHANGEABLE.
  --   v_goods     what the vendor is owed. This and only this is escrowed.
  --   v_delivery  what the ride costs. The rider's, less Sync's capped cut.
  --   v_sync_fee  the platform's charge to the student, on the goods.
  -- The service charge is levied on the GOODS, not on the total: charging a
  -- percentage of the delivery fee as well would be charging twice for the
  -- same trip, once through the rider's cut and once through the student's.
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

  -- THE DELIVERY NOW CARRIES WHAT A RIDER NEEDS TO DECIDE ON IT.
  -- It used to be inserted with an order id, an address and nothing else, so
  -- the open board advertised every job at ₦0 with no pickup and no distance.
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
  );

  -- ESCROW HOLDS THE GOODS ONLY. The delivery fee is the rider's and the
  -- service charge is Sync's; neither is the vendor's to be released.
  insert into public.escrow_holds (order_id, payer_id, payee_id, amount_kobo, release_after)
  values (v_order_id, v_uid, v_cart.vendor_id, v_goods, now() + interval '24 hours');

  update public.carts set status = 'ordered', updated_at = now() where id = p_cart_id;

  return query select v_order_id, v_total, v_repriced;
end;
$$;

revoke all on function public.checkout_cart(uuid, text, text, text, double precision, double precision)
  from public, anon;
grant execute on function public.checkout_cart(uuid, text, text, text, double precision, double precision)
  to authenticated, service_role;

comment on function public.checkout_cart is
  'Cart -> order -> items -> delivery -> escrow. Prices the delivery from the dropoff point and charges the student a capped service charge. Escrow holds the goods only; no vendor commission (see 20260902090000).';
