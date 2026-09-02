-- ============================================================================
-- store_performance
--
-- "Which of my stores is actually working?"   the question multi-store made
-- possible and nothing answered. Earnings are per BUSINESS (money lives on
-- vendor_profiles), so the earnings screen shows one number no matter how many
-- locations produced it. Per-store reporting is a `group by storefront_id`,
-- which is what this file is; it is NOT a second ledger, and deliberately
-- reads the same orders and escrow rows the money screens read.
--
-- THREE FUNCTIONS, ONE SUBJECT
--   store_performance()      one row per store: counts, revenue, average order
--   store_revenue_monthly()  the same revenue, bucketed by month
--   store_transactions()     the orders themselves, filtered by a named bucket
--
-- REVENUE MEANS WHAT ARRIVED, not what was ordered   the same rule
-- my_revenue_series follows. A delivered order whose escrow has been released
-- is money the vendor has; a pending order is a promise. Counting promises as
-- revenue is how a dashboard tells someone they can afford something they
-- cannot. `revenue_kobo` is therefore released escrow, and `booked_kobo` is
-- kept beside it so the difference is visible rather than hidden.
--
-- WHY THE COMMISSION COMES OFF
--   escrow_holds.commission_kobo is the platform's cut, taken at release
--   (20260827090000). A store's revenue is what reached the vendor, so it is
--   `amount_kobo - commission_kobo`. Showing the gross would overstate every
--   figure on the page by the commission rate.
--
-- "RETURNED" IS SPELLED `refunded` HERE
--   There is no returns concept in this schema and inventing one would be a
--   label over nothing. What exists is money going back: escrow_holds.status
--   = 'refunded', written by cancel_order and by resolve_dispute. That is the
--   bucket, and it is named for what it is.
--
-- THE BUCKETS ARE FILTERS, NOT A PARTITION. A cancelled order is usually also
-- a refunded one   cancel_order refunds in the same transaction   so it
-- appears under both. Forcing them apart would mean either hiding cancelled
-- orders from the cancelled tab or hiding refunds from the refunds tab, and
-- both are worse than an honest overlap. Only `all` is the whole set.
--
-- SCOPE: OWNER SEES EVERY STORE, STAFF SEE THEIRS
--   `private.storefront_scope(..., 'orders')` is the same check the order
--   queue's RLS makes, so a manager granted Orders at one store gets that
--   store's figures here and nothing else. Anything money-shaped beyond a
--   store's own takings   the wallet, payouts, the subscription   is
--   untouched: those live on vendor_profiles and nothing here reads it.
--
-- ROLLBACK
--   drop function if exists public.store_performance();
--   drop function if exists public.store_revenue_monthly(integer);
--   drop function if exists public.store_transactions(uuid, text, integer, integer);
-- ============================================================================

-- The stores the caller may see order figures for. Factored out because all
-- three functions below need exactly the same answer, and three copies of a
-- permission predicate is three chances for one of them to drift open.
create or replace function private.readable_order_stores(p_user uuid)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.id, s.name
    from public.storefronts s
   where s.vendor_id = p_user
   union
  select s.id, s.name
    from public.storefronts s
    join public.storefront_staff st on st.storefront_id = s.id
   where st.user_id    = p_user
     and st.revoked_at is null
     and s.archived_at is null
     and 'orders' = any (st.scopes);
$fn$;

grant execute on function private.readable_order_stores(uuid) to authenticated, service_role;

-- ── 1. One row per store ────────────────────────────────────────────────────
-- Archived stores are INCLUDED. A store closed in March still made money in
-- February, and dropping it would silently change last quarter's totals every
-- time a vendor tidies up.
create or replace function public.store_performance()
returns table (
  storefront_id    uuid,
  store_name       text,
  is_archived      boolean,
  orders_total     integer,
  orders_completed integer,
  orders_active    integer,
  orders_cancelled integer,
  orders_refunded  integer,
  -- Released escrow, net of commission. What the vendor actually has.
  revenue_kobo     bigint,
  -- Everything paid for and not refunded, released or not. The pipeline.
  booked_kobo      bigint,
  refunded_kobo    bigint,
  avg_order_kobo   bigint,
  last_order_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with mine as (
    select * from private.readable_order_stores((select auth.uid()))
  ),
  o as (
    select
      ord.storefront_id,
      ord.id,
      ord.status,
      ord.total_kobo,
      ord.placed_at,
      -- One hold per order in practice, but aggregated rather than joined so a
      -- duplicate could never multiply the order count.
      coalesce(sum(eh.amount_kobo) filter (where eh.status = 'released'), 0)
        - coalesce(sum(eh.commission_kobo) filter (where eh.status = 'released'), 0) as net_released,
      coalesce(sum(eh.amount_kobo) filter (where eh.status in ('held', 'released', 'disputed')), 0) as booked,
      coalesce(sum(eh.amount_kobo) filter (where eh.status = 'refunded'), 0) as refunded,
      count(*) filter (where eh.status = 'refunded') > 0 as was_refunded
    from public.orders ord
    join mine m on m.id = ord.storefront_id
    left join public.escrow_holds eh on eh.order_id = ord.id
    group by ord.storefront_id, ord.id, ord.status, ord.total_kobo, ord.placed_at
  )
  select
    m.id,
    m.name,
    exists (select 1 from public.storefronts s where s.id = m.id and s.archived_at is not null),
    coalesce(count(o.id), 0)::integer,
    coalesce(count(o.id) filter (where o.status = 'delivered'), 0)::integer,
    coalesce(count(o.id) filter (where o.status in ('pending', 'preparing', 'picked_up', 'on_the_way')), 0)::integer,
    coalesce(count(o.id) filter (where o.status = 'cancelled'), 0)::integer,
    coalesce(count(o.id) filter (where o.was_refunded), 0)::integer,
    coalesce(sum(o.net_released), 0)::bigint,
    coalesce(sum(o.booked), 0)::bigint,
    coalesce(sum(o.refunded), 0)::bigint,
    -- Averaged over DELIVERED orders only. Dividing revenue by every order
    -- ever placed, cancellations included, produces a number that drops when
    -- a customer changes their mind and means nothing to anybody.
    case
      when count(o.id) filter (where o.status = 'delivered') > 0
      then (coalesce(sum(o.net_released), 0)
            / count(o.id) filter (where o.status = 'delivered'))::bigint
      else 0
    end,
    max(o.placed_at)
  from mine m
  left join o on o.storefront_id = m.id
  group by m.id, m.name
  order by coalesce(sum(o.net_released), 0) desc, m.name;
$fn$;

revoke all on function public.store_performance() from public, anon;
grant execute on function public.store_performance() to authenticated, service_role;

comment on function public.store_performance() is
  'Per-store order counts and takings for the caller. Revenue is released escrow net of commission   what arrived, not what was ordered. Includes archived stores: they still made money before they closed.';

-- ── 2. The monthly track ────────────────────────────────────────────────────
-- Buckets are generated, not derived from the data, so a month with no orders
-- is a zero rather than a gap. A line chart that skips empty months draws a
-- flat trend through a dead quarter.
create or replace function public.store_revenue_monthly(p_months integer default 6)
returns table (
  month         date,
  storefront_id uuid,
  store_name    text,
  revenue_kobo  bigint,
  orders_count  integer
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with mine as (
    select * from private.readable_order_stores((select auth.uid()))
  ),
  span as (
    select generate_series(
             date_trunc('month', now())
               - make_interval(months => greatest(1, least(coalesce(p_months, 6), 24)) - 1),
             date_trunc('month', now()),
             interval '1 month'
           )::date as month
  ),
  grid as (
    select span.month, mine.id, mine.name from span cross join mine
  ),
  rev as (
    select
      date_trunc('month', ord.placed_at)::date as month,
      ord.storefront_id,
      sum(eh.amount_kobo - eh.commission_kobo) as revenue_kobo,
      count(distinct ord.id)                   as orders_count
    from public.orders ord
    join mine m           on m.id = ord.storefront_id
    join public.escrow_holds eh on eh.order_id = ord.id and eh.status = 'released'
    group by 1, 2
  )
  select
    grid.month,
    grid.id,
    grid.name,
    coalesce(rev.revenue_kobo, 0)::bigint,
    coalesce(rev.orders_count, 0)::integer
  from grid
  left join rev on rev.month = grid.month and rev.storefront_id = grid.id
  order by grid.month, grid.name;
$fn$;

revoke all on function public.store_revenue_monthly(integer) from public, anon;
grant execute on function public.store_revenue_monthly(integer) to authenticated, service_role;

-- ── 3. The transactions themselves ──────────────────────────────────────────
-- Paged in SQL rather than filtered in the client: a vendor's order history is
-- the one table here that grows without bound, and "fetch everything and
-- filter in memory" is the pattern that works in testing and dies in December.
create or replace function public.store_transactions(
  p_storefront_id uuid     default null,
  p_bucket        text     default 'all',
  p_limit         integer  default 25,
  p_offset        integer  default 0
)
returns table (
  order_id       uuid,
  storefront_id  uuid,
  store_name     text,
  status         text,
  is_refunded    boolean,
  total_kobo     bigint,
  net_kobo       bigint,
  item_count     integer,
  placed_at      timestamptz,
  delivered_at   timestamptz,
  -- Enough to recognise the order without a second round trip, and nothing
  -- more: the student's contact details are not part of a takings report.
  student_name   text,
  total_rows     bigint
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with mine as (
    select * from private.readable_order_stores((select auth.uid()))
  ),
  rows_ as (
    select
      ord.id,
      ord.storefront_id,
      m.name as store_name,
      ord.status,
      coalesce(bool_or(eh.status = 'refunded'), false) as is_refunded,
      ord.total_kobo,
      coalesce(sum(eh.amount_kobo) filter (where eh.status = 'released'), 0)
        - coalesce(sum(eh.commission_kobo) filter (where eh.status = 'released'), 0) as net_kobo,
      (select coalesce(count(*), 0) from public.order_items oi where oi.order_id = ord.id) as item_count,
      ord.placed_at,
      ord.delivered_at,
      coalesce(nullif(trim(p.full_name), ''), 'Customer') as student_name
    from public.orders ord
    join mine m on m.id = ord.storefront_id
    left join public.escrow_holds eh on eh.order_id = ord.id
    left join public.profiles p on p.id = ord.student_id
    where (p_storefront_id is null or ord.storefront_id = p_storefront_id)
    group by ord.id, ord.storefront_id, m.name, ord.status, ord.total_kobo,
             ord.placed_at, ord.delivered_at, p.full_name
  ),
  filtered as (
    select * from rows_ r
     where case coalesce(p_bucket, 'all')
             when 'completed' then r.status = 'delivered'
             when 'pending'   then r.status in ('pending', 'preparing', 'picked_up', 'on_the_way')
             when 'cancelled' then r.status = 'cancelled'
             when 'refunded'  then r.is_refunded
             else true
           end
  )
  select
    f.id, f.storefront_id, f.store_name, f.status, f.is_refunded,
    f.total_kobo::bigint, f.net_kobo::bigint, f.item_count::integer,
    f.placed_at, f.delivered_at, f.student_name,
    -- The count travels with the page so the pager knows how far it can go
    -- without a second, differently-filtered query that could disagree.
    count(*) over () as total_rows
  from filtered f
  order by f.placed_at desc
  limit  greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$fn$;

revoke all on function public.store_transactions(uuid, text, integer, integer) from public, anon;
grant execute on function public.store_transactions(uuid, text, integer, integer)
  to authenticated, service_role;

comment on function public.store_transactions(uuid, text, integer, integer) is
  'One store''s orders, or every store''s, filtered by bucket: all | completed | pending | cancelled | refunded. Buckets are filters and overlap   a cancelled order is usually also refunded.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.store_performance()') is null then
    raise exception 'store_performance missing';
  end if;
  if to_regprocedure('public.store_revenue_monthly(integer)') is null then
    raise exception 'store_revenue_monthly missing';
  end if;
  if to_regprocedure('public.store_transactions(uuid, text, integer, integer)') is null then
    raise exception 'store_transactions missing';
  end if;
end $$;
