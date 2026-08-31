-- ============================================================================
-- order_customer_snapshot
--
-- PROBLEM FOUND WHILE WIRING /vendor/orders
--   The vendor order queue shows "who ordered this". The vendor cannot read it:
--   `profiles_select_own` restricts that table to the caller's own row, so a
--   vendor joining orders -> profiles gets nothing back. Every customer would
--   render blank.
--
-- THE TEMPTING FIX IS THE WRONG ONE
--   A policy like "a vendor may read the profile of anyone who ordered from
--   them" would work, and would also hand every vendor a standing read on the
--   full profile row - phone, address, every field - for every customer they
--   have ever served, forever. That is far larger than the problem needs, and
--   it re-opens the PII exposure that 20260814102248 closed.
--
-- WHAT THIS DOES INSTEAD
--   Snapshots the contact onto the order at checkout, exactly as `order_items`
--   already snapshots name and price. The vendor sees the contact for orders
--   they are actually fulfilling and nothing else. It is also more correct: if a
--   student later changes their number, the order should still show the number
--   the rider was given.
--
-- ROLLBACK
--   alter table public.orders
--     drop column if exists customer_name,
--     drop column if exists customer_phone;
-- ============================================================================

alter table public.orders add column if not exists customer_name  text;
alter table public.orders add column if not exists customer_phone text;
comment on column public.orders.customer_name is
  'Snapshot taken at checkout. Vendors cannot read profiles; this is how they know who ordered.';
-- Freeze the snapshot against client writes. Extends the EXISTING guard rather
-- than adding a second BEFORE UPDATE trigger: two triggers on one table fire in
-- name order and the interaction is easy to get wrong.
create or replace function public.guard_order_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.paid_at           := old.paid_at;
    new.payment_reference := old.payment_reference;
    new.total_kobo        := old.total_kobo;
    new.subtotal_kobo     := old.subtotal_kobo;
    new.customer_name     := old.customer_name;
    new.customer_phone    := old.customer_phone;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
-- ── Populate it at checkout ─────────────────────────────────────────────────
-- Only the orders INSERT changes; the rest is the function as it already was.
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
  v_uid      uuid := auth.uid();
  v_cart     public.carts%rowtype;
  v_order_id uuid;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_promo    public.promotions%rowtype;
  v_item     record;
  v_repriced boolean := false;
  v_name     text;
  v_phone    text;
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

  -- Readable here only because this function is SECURITY DEFINER. The caller
  -- could read their own row anyway; the vendor reading it later could not.
  select p.full_name, p.phone into v_name, v_phone
    from public.profiles p where p.id = v_uid;

  for v_item in
    select ci.listing_id, ci.quantity, ci.unit_price_kobo as captured,
           l.price_kobo as live, l.name, l.stock
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
    v_subtotal := v_subtotal + (v_item.live * v_item.quantity);
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
        when v_promo.discount_type = 'percent' then (v_subtotal * v_promo.discount_value) / 100
        else least(v_promo.discount_value::bigint, v_subtotal)
      end;
      update public.promotions set redemption_count = redemption_count + 1 where id = v_promo.id;
    end if;
  end if;

  insert into public.orders (
    student_id, vendor_id, status, subtotal_kobo, total_kobo, delivery_address,
    customer_name, customer_phone
  )
  values (
    v_uid, v_cart.vendor_id, 'pending', v_subtotal, v_subtotal - v_discount,
    p_delivery_address, v_name, v_phone
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, listing_id, qty, price_kobo, name, image_url)
  select v_order_id, ci.listing_id, ci.quantity, l.price_kobo, l.name, l.image_url
    from public.cart_items ci
    join public.listings l on l.id = ci.listing_id
   where ci.cart_id = p_cart_id;

  update public.listings l
     set stock = l.stock - ci.quantity,
         sold  = l.sold  + ci.quantity
    from public.cart_items ci
   where ci.cart_id = p_cart_id and l.id = ci.listing_id;

  insert into public.escrow_holds (order_id, payer_id, payee_id, amount_kobo, release_after)
  values (v_order_id, v_uid, v_cart.vendor_id, v_subtotal - v_discount, now() + interval '24 hours');

  insert into public.conversations (kind, subject_type, subject_id, created_by)
  values ('order', 'order', v_order_id, v_uid);

  insert into public.conversation_participants (conversation_id, user_id, role)
  select c.id, u.uid, u.r
    from public.conversations c
    cross join (values (v_uid, 'member'), (v_cart.vendor_id, 'owner')) as u(uid, r)
   where c.subject_type = 'order' and c.subject_id = v_order_id
  on conflict do nothing;

  insert into public.deliveries (order_id, dropoff_address, status)
  values (v_order_id, p_delivery_address, 'pending');

  update public.carts set status = 'ordered', updated_at = now() where id = p_cart_id;

  return query select v_order_id, (v_subtotal - v_discount), v_repriced;
end;
$$;
revoke all on function public.checkout_cart(uuid, text, text, text) from public, anon;
grant execute on function public.checkout_cart(uuid, text, text, text) to authenticated, service_role;
-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'orders' and column_name = 'customer_name'
  ) then
    raise exception 'orders.customer_name was not created';
  end if;

  -- profiles must still be own-row only; this migration exists precisely so
  -- that stays true.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'
       and qual not like '%auth.uid()%'
  ) then
    raise exception 'a profiles SELECT policy no longer scopes to the caller';
  end if;

  raise notice 'order customer snapshot in place; profiles remains own-row.';
end $$;
