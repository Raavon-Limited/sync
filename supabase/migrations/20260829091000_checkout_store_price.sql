-- ============================================================================
-- checkout_store_price
--
-- Two changes to the money path, folded into one restatement of checkout_cart
-- because Postgres has no way to patch a function body and restating it twice
-- would leave two versions to keep in step.
--   1. Price and stock come from the store (20260829090000).
--   2. A store inside a cooldown refuses new orders (20260829090500).
--   3. Stock is nullable and null means untracked, so only stores that
--      actually count portions can be short of them.
--
-- `checkout_cart` prices and stocks from `listings`, which stopped being the
-- right table in 20260829090000. Now that one catalogue item can be carried by
-- several stores, `listings.price_kobo` is the catalogue price and
-- `storefront_listings` holds what each store actually charges and holds.
--
-- Leaving checkout on the old columns would mean a store's price override was
-- shown on the storefront page and silently ignored at the till, and stock
-- would decrement on the catalogue rather than at the store that has to hand
-- the food over. Both are the sort of bug that only shows up as an argument
-- with a customer.
--
-- WHAT CHANGES, EXACTLY
--   price   public.store_price(cart.storefront_id, listing) — the store
--           override if set, else the catalogue price.
--   stock   checked and decremented on `storefront_listings` for the cart's
--           store. `listings.sold` still increments: that is a lifetime
--           catalogue counter, and it is the one number that is genuinely
--           about the item rather than about a location.
--   lock    `for update of sl` — the per-store row is now the contended one.
--           Locking the catalogue row would serialise every store of a
--           storefront against each other for no reason.
--
-- THE COOLDOWN IS ENFORCED HERE, NOT IN THE UI
--   A greyed-out button is a suggestion. Anything that can post a checkout —
--   a stale tab, a resumed session, a replayed request — has to be refused by
--   the thing that creates the order. `store_accepting_orders()` is the same
--   function the storefront page calls, so the button and the till cannot
--   disagree about whether a store is open.
--
--   Checked AFTER the cart is locked, so two simultaneous taps cannot both
--   read "open" and both get through.
--
-- Everything else is 20260822120000 verbatim.
--
-- ROLLBACK
--   Re-run 20260822120000_checkout_carries_storefront.sql.
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
  v_missing    text;
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

  -- The store may have paused between filling the cart and paying for it.
  if v_cart.storefront_id is not null
     and not public.store_accepting_orders(v_cart.storefront_id) then
    raise exception 'This store has paused new orders. Try again shortly.'
      using errcode = 'P0001';
  end if;

  -- An item this store has stopped carrying must fail loudly rather than
  -- vanish from the order being paid for. It is checked HERE, separately,
  -- because the locking loop below needs an inner join: Postgres refuses
  -- FOR UPDATE on the nullable side of an outer join, so a left join that
  -- found the missing row could not also lock the present ones.
  select l.name into v_missing
    from public.cart_items ci
    join public.listings l on l.id = ci.listing_id
   where ci.cart_id = p_cart_id
     and not exists (
       select 1 from public.storefront_listings sl
        where sl.listing_id    = ci.listing_id
          and sl.storefront_id = v_cart.storefront_id
          -- is_available covers both halves: not carried here, or sold out.
          and sl.is_available
     )
   limit 1;

  if v_missing is not null then
    raise exception '% is not available at this store', v_missing
      using errcode = 'P0001';
  end if;

  -- Live prices win over captured ones, and "live" now means the price at the
  -- store this cart belongs to.
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
    -- Null stock is untracked — cooked to order, no count to run down. Only a
    -- store that actually counts can be short.
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
  select v_order_id,
         ci.listing_id,
         ci.quantity,
         -- The price actually charged, which is the store's, not the
         -- catalogue's. A snapshot of the wrong number is worse than no
         -- snapshot: it survives into the receipt and the dispute.
         public.store_price(v_cart.storefront_id, ci.listing_id),
         l.name,
         l.image_url
    from public.cart_items ci
    join public.listings l on l.id = ci.listing_id
   where ci.cart_id = p_cart_id;

  -- Reserve stock at the store that has to fulfil it. Untracked items have no
  -- count to decrement, and `null - 1` would silently leave them null anyway —
  -- being explicit is cheaper than relying on that.
  update public.storefront_listings sl
     set stock = sl.stock - ci.quantity,
         updated_at = now()
    from public.cart_items ci
   where ci.cart_id = p_cart_id
     and sl.listing_id = ci.listing_id
     and sl.storefront_id = v_cart.storefront_id
     and sl.stock is not null;

  -- `sold` is a lifetime count for the item across every store, so it stays on
  -- the catalogue row.
  update public.listings l
     set sold = l.sold + ci.quantity
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
