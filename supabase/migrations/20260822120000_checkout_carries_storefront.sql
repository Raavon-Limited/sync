-- ============================================================================
-- checkout_carries_storefront
--
-- checkout_cart() predates branches. It copies the cart's vendor onto the new
-- order but not the cart's STOREFRONT, so every order created after the
-- storefronts migration lands with storefront_id null.
--
-- WHY THIS DID NOT FAIL LOUDLY
--   orders.storefront_id is deliberately nullable (a branch forced out in a
--   data repair must not destroy order history), so the insert succeeded and
--   the attribution was simply lost. That is the worst kind of breakage: a
--   vendor's per-branch order queue would quietly show nothing, and the cause
--   would look like a UI bug rather than a missing column value.
--
--   The cart already knows the branch - carts.storefront_id is NOT NULL - so
--   this is a copy, not a lookup.
--
-- WHY THE BODY IS RESTATED RATHER THAN PATCHED
--   The first version of this migration read the live definition with
--   pg_get_functiondef() and string-replaced the orders INSERT, so that any
--   other change made to the function since it was written would survive. The
--   match failed - the stored text and the migration's literal differ in
--   whitespace, and this repo's SQL files are CRLF, so a text match has to be
--   byte-exact across two encodings to work. It correctly refused rather than
--   applying a silent no-op, which is what the guard was for.
--
--   Restating the whole body is the honest fix: it is verifiable by reading,
--   it cannot half-apply, and checkout_cart has not been modified since
--   20260817090600 created it. The ONE difference from that definition is the
--   orders INSERT, marked inline below.
--
-- ROLLBACK
--   Restore the definition from 20260817090600_rpc_helpers.sql verbatim.
-- ============================================================================

create or replace function public.checkout_cart(
  p_cart_id          uuid,
  p_delivery_address text,
  p_note             text default null,
  p_promotion_code   text default null
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
  v_promo      public.promotions%rowtype;
  v_item       record;
  v_repriced   boolean := false;
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

  -- Live prices win over captured ones.
  for v_item in
    select ci.listing_id, ci.quantity, ci.unit_price_kobo as captured, l.price_kobo as live, l.name, l.stock
      from public.cart_items ci
      join public.listings l on l.id = ci.listing_id
     where ci.cart_id = p_cart_id
     for update of l
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

  -- Promotion, validated server-side. A client-supplied discount is not a
  -- discount, it is a request.
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

  -- 'pending' - NOT 'pending_payment'. 0006's status check admits exactly
  -- ('pending','preparing','picked_up','on_the_way','delivered','cancelled');
  -- anything else violates the constraint at insert time.
  --
  -- THE ONLY CHANGE FROM 20260817090600: storefront_id is carried from the
  -- cart. Without it the order cannot be attributed to the branch that has to
  -- fulfil it, and a vendor's per-branch queue is empty.
  insert into public.orders (
    student_id, vendor_id, storefront_id, status, subtotal_kobo, total_kobo, delivery_address
  )
  values (
    v_uid, v_cart.vendor_id, v_cart.storefront_id, 'pending', v_subtotal, v_subtotal - v_discount, p_delivery_address
  )
  returning id into v_order_id;

  -- Column names follow 0006: qty / price_kobo / name, and these are SNAPSHOTS.
  -- listing_id is ON DELETE SET NULL there precisely so order history survives
  -- a deleted listing - which is why the name and price are copied, not joined.
  insert into public.order_items (order_id, listing_id, qty, price_kobo, name, image_url)
  select v_order_id, ci.listing_id, ci.quantity, l.price_kobo, l.name, l.image_url
    from public.cart_items ci
    join public.listings l on l.id = ci.listing_id
   where ci.cart_id = p_cart_id;

  -- Reserve stock now that the order exists.
  update public.listings l
     set stock = l.stock - ci.quantity,
         sold  = l.sold  + ci.quantity
    from public.cart_items ci
   where ci.cart_id = p_cart_id and l.id = ci.listing_id;

  -- Open the order thread so "Message vendor" works from the first screen.
  insert into public.conversations (kind, subject_type, subject_id, created_by)
  values ('order', 'order', v_order_id, v_uid);

  insert into public.conversation_participants (conversation_id, user_id, role)
  select c.id, u.uid, u.r
    from public.conversations c
    cross join (values (v_uid, 'member'), (v_cart.vendor_id, 'owner')) as u(uid, r)
   where c.subject_type = 'order' and c.subject_id = v_order_id
  on conflict do nothing;

  -- Queue the delivery. No rider yet - dispatch offers it separately.
  insert into public.deliveries (order_id, dropoff_address, status)
  values (v_order_id, p_delivery_address, 'pending');

  -- Escrow the money owed. Released to the vendor on delivery.
  insert into public.escrow_holds (order_id, payer_id, payee_id, amount_kobo, release_after)
  values (v_order_id, v_uid, v_cart.vendor_id, v_subtotal - v_discount, now() + interval '24 hours');

  update public.carts set status = 'ordered', updated_at = now() where id = p_cart_id;

  return query select v_order_id, (v_subtotal - v_discount), v_repriced;
end;
$$;
grant execute on function public.checkout_cart(uuid, text, text, text) to authenticated, service_role;
-- Backfill orders placed after the storefronts migration but before this fix.
update public.orders o
   set storefront_id = s.id
  from public.storefronts s
 where o.storefront_id is null
   and s.vendor_id = o.vendor_id
   and s.is_primary
   and s.archived_at is null;
