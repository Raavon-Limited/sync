-- ============================================================================
-- rpc_helpers
--
-- The operations that must not be assembled from several client round-trips.
--
-- WHAT BELONGS HERE, AND WHAT DOES NOT
--   A function earns its place in the database when it is either (a) atomic —
--   several writes that must all land or none — or (b) a race that only a
--   constraint can settle. Everything else stays in TypeScript, where it is far
--   easier to read, test and change.
--
--   So: checkout is here (order + items + escrow + cart close, all-or-nothing).
--   Accepting a delivery is here (two riders, one job, decided by a unique
--   index). Formatting a price is not.
--
-- SECURITY DEFINER IS A LOADED GUN
--   Every function below that uses it re-checks authorisation itself, because
--   DEFINER means RLS no longer will. Each one starts by establishing who the
--   caller is and refusing if they are not entitled. `set search_path = ''` is
--   on all of them: without it a caller can create a schema that shadows
--   `public` and hijack the function's own table references.
--
-- ROLLBACK
--   drop function if exists public.checkout_cart, public.accept_delivery_offer,
--     public.toggle_favorite, public.mark_notifications_read,
--     public.get_unread_counts, public.open_order_conversation,
--     public.vendor_earnings_summary, public.submit_review;
-- ============================================================================

-- ── 1. checkout_cart ────────────────────────────────────────────────────────
-- Cart -> order -> items -> escrow -> cart closed. Any failure rolls the whole
-- thing back, so there is no state where an order exists without its items or a
-- cart is consumed without producing an order.
--
-- Prices are re-read from `listings` HERE, not trusted from the cart. The cart
-- captured them when the item was added; if the vendor has repriced since, the
-- order must use the real price and the caller must be told. That is the entire
-- reason this is not a client-side insert.
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

  -- 'pending' — NOT 'pending_payment'. 0006's status check admits exactly
  -- ('pending','preparing','picked_up','on_the_way','delivered','cancelled');
  -- anything else violates the constraint at insert time.
  insert into public.orders (
    student_id, vendor_id, status, subtotal_kobo, total_kobo, delivery_address
  )
  values (
    v_uid, v_cart.vendor_id, 'pending', v_subtotal, v_subtotal - v_discount, p_delivery_address
  )
  returning id into v_order_id;

  -- Column names follow 0006: qty / price_kobo / name, and these are SNAPSHOTS.
  -- listing_id is ON DELETE SET NULL there precisely so order history survives
  -- a deleted listing — which is why the name and price are copied, not joined.
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

  -- Queue the delivery. No rider yet — dispatch offers it separately.
  insert into public.deliveries (order_id, dropoff_address, status)
  values (v_order_id, p_delivery_address, 'pending');

  -- Escrow the money owed. Released to the vendor on delivery.
  insert into public.escrow_holds (order_id, payer_id, payee_id, amount_kobo, release_after)
  values (v_order_id, v_uid, v_cart.vendor_id, v_subtotal - v_discount, now() + interval '24 hours');

  update public.carts set status = 'ordered', updated_at = now() where id = p_cart_id;

  return query select v_order_id, (v_subtotal - v_discount), v_repriced;
end;
$$;
-- ── 2. accept_delivery_offer ────────────────────────────────────────────────
-- Two riders tap Accept at the same instant. Exactly one must win, and the
-- loser must get a clean "taken" rather than a constraint-violation stack
-- trace. The unique index delivery_offers_one_accepted_idx is the referee; this
-- function just translates its verdict into something the app can render.
create or replace function public.accept_delivery_offer(p_offer_id uuid)
returns table (accepted boolean, reason text, delivery_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_offer    public.delivery_offers%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_offer from public.delivery_offers
   where id = p_offer_id and rider_id = v_uid
   for update;

  if not found then
    return query select false, 'offer not found', null::uuid;
    return;
  end if;

  if v_offer.status <> 'offered' then
    return query select false, 'offer already ' || v_offer.status, v_offer.delivery_id;
    return;
  end if;

  if v_offer.expires_at < now() then
    update public.delivery_offers set status = 'expired', responded_at = now()
     where id = p_offer_id;
    return query select false, 'offer expired', v_offer.delivery_id;
    return;
  end if;

  begin
    update public.delivery_offers
       set status = 'accepted', responded_at = now()
     where id = p_offer_id;

    update public.deliveries
       set rider_id = v_uid, status = 'assigned', assigned_at = now(), updated_at = now()
     where id = v_offer.delivery_id
       and status in ('pending', 'offered');

    -- Every other rider's offer on this job is dead.
    update public.delivery_offers
       set status = 'expired', responded_at = now()
     where delivery_id = v_offer.delivery_id
       and id <> p_offer_id
       and status = 'offered';

  exception when unique_violation then
    -- The partial unique index fired: another rider got there first.
    return query select false, 'another rider accepted first', v_offer.delivery_id;
    return;
  end;

  return query select true, null::text, v_offer.delivery_id;
end;
$$;
-- ── 3. toggle_favorite ──────────────────────────────────────────────────────
-- Returns the resulting state so the client can render without a second fetch.
create or replace function public.toggle_favorite(p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.favorites
   where user_id = v_uid and entity_type = p_entity_type and entity_id = p_entity_id;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    return false;
  end if;

  insert into public.favorites (user_id, entity_type, entity_id)
  values (v_uid, p_entity_type, p_entity_id)
  on conflict do nothing;

  return true;
end;
$$;
-- ── 4. Notifications ────────────────────────────────────────────────────────
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.notifications
     set read_at = now()
   where user_id = v_uid
     and read_at is null
     and (p_ids is null or id = any (p_ids));

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
-- One round trip for every badge in the shell.
create or replace function public.get_unread_counts()
returns table (notifications integer, messages integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from public.notifications n
      where n.user_id = auth.uid() and n.read_at is null),
    (select count(*)::int
       from public.messages m
       join public.conversation_participants cp
         on cp.conversation_id = m.conversation_id and cp.user_id = auth.uid()
      where m.sender_id is distinct from auth.uid()
        and m.deleted_at is null
        and (cp.last_read_at is null or m.created_at > cp.last_read_at))
$$;
-- ── 5. open_order_conversation ──────────────────────────────────────────────
-- Idempotent: returns the existing thread if there is one. Called when a
-- student taps "Message vendor" on an order.
create or replace function public.open_order_conversation(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_order  public.orders%rowtype;
  v_convo  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  -- Authorisation, restated because SECURITY DEFINER turned RLS off.
  if v_uid not in (v_order.student_id, v_order.vendor_id) then
    raise exception 'not a party to this order' using errcode = '42501';
  end if;

  select id into v_convo from public.conversations
   where subject_type = 'order' and subject_id = p_order_id
   limit 1;

  if v_convo is not null then
    return v_convo;
  end if;

  insert into public.conversations (kind, subject_type, subject_id, created_by)
  values ('order', 'order', p_order_id, v_uid)
  returning id into v_convo;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_convo, v_order.student_id, 'member'),
         (v_convo, v_order.vendor_id,  'owner')
  on conflict do nothing;

  return v_convo;
end;
$$;
-- ── 6. submit_review ────────────────────────────────────────────────────────
-- Enforces the rule the UI cannot: you may only review something you actually
-- transacted, and only once per transaction.
create or replace function public.submit_review(
  p_subject_type text,
  p_subject_id   uuid,
  p_source_type  text,
  p_source_id    uuid,
  p_rating       integer,
  p_title        text default null,
  p_body         text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ok  boolean := false;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Prove the caller was party to the thing they are reviewing.
  if p_source_type = 'order' then
    select exists (select 1 from public.orders o
                    where o.id = p_source_id and o.student_id = v_uid
                      and o.status = 'delivered') into v_ok;
  elsif p_source_type = 'booking' then
    select exists (select 1 from public.bookings b
                    where b.id = p_source_id and b.student_id = v_uid) into v_ok;
  elsif p_source_type = 'service_request' then
    select exists (select 1 from public.service_requests r
                    where r.id = p_source_id and r.student_id = v_uid
                      and r.status = 'completed') into v_ok;
  elsif p_source_type = 'delivery' then
    select exists (select 1 from public.deliveries d
                     join public.orders o on o.id = d.order_id
                    where d.id = p_source_id and o.student_id = v_uid
                      and d.status = 'delivered') into v_ok;
  end if;

  if not v_ok then
    raise exception 'you can only review a completed transaction you were part of'
      using errcode = '42501';
  end if;

  insert into public.reviews (author_id, subject_type, subject_id, source_type, source_id, rating, title, body)
  values (v_uid, p_subject_type, p_subject_id, p_source_type, p_source_id, p_rating, p_title, p_body)
  on conflict (author_id, subject_type, subject_id, source_type, source_id)
  do update set rating = excluded.rating,
                title  = excluded.title,
                body   = excluded.body,
                updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;
-- ── 7. vendor_earnings_summary ──────────────────────────────────────────────
-- Powers /vendor/earnings. Mirrors EarningsData in src/modules/vendor/types.ts.
-- Aggregating in the database is the difference between one round trip and one
-- per card.
create or replace function public.vendor_earnings_summary()
returns table (
  available_kobo   bigint,
  pending_kobo     bigint,
  lifetime_kobo    bigint,
  withdrawn_kobo   bigint,
  total_payouts    integer,
  orders_count     integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select w.balance_kobo from public.wallets w where w.owner_id = auth.uid()), 0),
    coalesce((select sum(e.amount_kobo) from public.escrow_holds e
               where e.payee_id = auth.uid() and e.status = 'held'), 0),
    coalesce((select sum(e.amount_kobo) from public.escrow_holds e
               where e.payee_id = auth.uid() and e.status = 'released'), 0),
    coalesce((select sum(p.amount_kobo) from public.payouts p
               where p.owner_id = auth.uid() and p.status = 'paid'), 0),
    coalesce((select count(*)::int from public.payouts p
               where p.owner_id = auth.uid() and p.status = 'paid'), 0),
    coalesce((select count(*)::int from public.orders o
               where o.vendor_id = auth.uid()), 0)
$$;
-- ── 8. Grants ───────────────────────────────────────────────────────────────
-- Callable by signed-in users only. Every one of them re-derives auth.uid()
-- internally, so `anon` calling them would get an authentication error anyway —
-- but not granting is cheaper than relying on that.
revoke all on function public.checkout_cart(uuid, text, text, text)                    from public, anon;
revoke all on function public.accept_delivery_offer(uuid)                              from public, anon;
revoke all on function public.toggle_favorite(text, uuid)                              from public, anon;
revoke all on function public.mark_notifications_read(uuid[])                          from public, anon;
revoke all on function public.get_unread_counts()                                      from public, anon;
revoke all on function public.open_order_conversation(uuid)                            from public, anon;
revoke all on function public.submit_review(text, uuid, text, uuid, integer, text, text) from public, anon;
revoke all on function public.vendor_earnings_summary()                                from public, anon;
grant execute on function public.checkout_cart(uuid, text, text, text)                    to authenticated, service_role;
grant execute on function public.accept_delivery_offer(uuid)                              to authenticated, service_role;
grant execute on function public.toggle_favorite(text, uuid)                              to authenticated, service_role;
grant execute on function public.mark_notifications_read(uuid[])                          to authenticated, service_role;
grant execute on function public.get_unread_counts()                                      to authenticated, service_role;
grant execute on function public.open_order_conversation(uuid)                            to authenticated, service_role;
grant execute on function public.submit_review(text, uuid, text, uuid, integer, text, text) to authenticated, service_role;
grant execute on function public.vendor_earnings_summary()                                to authenticated, service_role;
-- ── 9. Verify ───────────────────────────────────────────────────────────────
do $$
declare
  unsafe int;
begin
  -- Every SECURITY DEFINER function this project owns must pin search_path.
  -- Without it, a caller-created schema can shadow `public` and the function
  -- will happily operate on the attacker's tables.
  select count(*) into unsafe
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
        where cfg like 'search\_path=%'
     );

  if unsafe > 0 then
    raise exception
      '% SECURITY DEFINER function(s) do not pin search_path', unsafe;
  end if;

  raise notice 'rpc helpers ready: checkout, dispatch, favorites, reviews, earnings.';
end $$;
