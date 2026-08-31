-- ============================================================================
-- admin_analytics
--
-- /admin/analytics was six charts over a hardcoded array in `data.ts`: a
-- `makeTrend()` that generated 148 days of Math.random(), four invented KPI
-- cards, and five fictional vendors. It has never touched the database.
--
-- WHY AN RPC AND NOT SIX SELECTS FROM THE PAGE
--   PostgREST caps an unbounded select at 1000 rows. A year of orders read
--   into JavaScript and summed there would quietly stop at row 1000 and
--   report a revenue figure that is simply wrong, with no error anywhere. An
--   aggregate that runs in the database cannot be truncated by a page size.
--
-- WHO CAN CALL IT
--   Staff, or the service role. Not "anyone authenticated" — this is
--   platform-wide revenue, every vendor's take, and every customer count. The
--   admin pages already redirect non-staff, but a route guard is a courtesy;
--   this is the actual boundary.
--
-- THE COMPARISON WINDOW
--   Each KPI ships with its previous-period twin so the cards can show change
--   without a second call. "Previous" is the same number of days immediately
--   before the current window, so a 30-day view compares against the 30 days
--   before it — not against a calendar month, which would swing with the
--   length of the month rather than with the business.
--
-- TIME IS Africa/Lagos
--   Day buckets and hour-of-day are computed in the timezone the campus
--   actually lives in. In UTC the evening dinner peak lands in the wrong hour
--   and every day boundary is an hour off.
--
-- REVENUE MEANS PAID
--   Only orders with `paid_at` set and status <> 'cancelled' count, and the
--   time axis is `paid_at`, not `created_at`. An order placed on Monday and
--   paid on Tuesday is Tuesday's money.
--
-- ROLLBACK
--   drop function if exists public.admin_analytics(integer);
-- ============================================================================

create or replace function public.admin_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_days integer     := greatest(1, least(coalesce(p_days, 30), 365));
  v_from timestamptz := now() - make_interval(days => v_days);
  v_prev timestamptz := now() - make_interval(days => v_days * 2);
  v_out  jsonb;
begin
  if not public.is_staff() and current_user <> 'service_role' then
    raise exception 'Only staff can read platform analytics'
      using errcode = '42501';
  end if;

  with paid as (
    select o.id, o.vendor_id, o.student_id, o.total_kobo, o.paid_at
      from public.orders o
     where o.paid_at is not null
       and o.status <> 'cancelled'
       and o.paid_at >= v_prev
  ),
  cur as (select * from paid where paid_at >= v_from),
  prv as (select * from paid where paid_at <  v_from),

  -- KPIs, current and previous window side by side.
  kpis as (
    select
      coalesce((select sum(total_kobo)   from cur), 0) as revenue_kobo,
      (select count(*)                   from cur)     as orders,
      (select count(distinct student_id) from cur)     as customers,
      coalesce((select sum(total_kobo)   from prv), 0) as prev_revenue_kobo,
      (select count(*)                   from prv)     as prev_orders,
      (select count(distinct student_id) from prv)     as prev_customers
  ),

  -- Daily trend. generate_series supplies the days with no orders, so a quiet
  -- Sunday reads as a zero rather than vanishing and pulling the line straight
  -- across it.
  days as (
    select generate_series(
             (v_from at time zone 'Africa/Lagos')::date,
             (now()  at time zone 'Africa/Lagos')::date,
             interval '1 day'
           )::date as d
  ),
  by_day as (
    select (paid_at at time zone 'Africa/Lagos')::date as d,
           sum(total_kobo) as revenue_kobo,
           count(*)        as orders
      from cur
     group by 1
  ),
  trend as (
    select jsonb_agg(
             jsonb_build_object(
               'date',         to_char(days.d, 'Mon DD'),
               'revenue_kobo', coalesce(by_day.revenue_kobo, 0),
               'orders',       coalesce(by_day.orders, 0)
             ) order by days.d
           ) as j
      from days left join by_day on by_day.d = days.d
  ),

  -- Where the money comes from. The vendor's own category is the honest
  -- grouping: an order belongs to one vendor, so nothing is double counted the
  -- way per-line-item categories would be.
  categories as (
    select jsonb_agg(x order by x.revenue_kobo desc) as j
      from (
        select coalesce(v.category, 'other') as label,
               sum(c.total_kobo)             as revenue_kobo
          from cur c
          left join public.vendor_profiles v on v.id = c.vendor_id
         group by 1
      ) x
  ),

  -- Hour of day, all 24 present. A missing 3am is information; an absent 3am
  -- is a hole in the chart.
  hours as (
    select jsonb_agg(
             jsonb_build_object('hour', h.h, 'orders', coalesce(o.n, 0))
             order by h.h
           ) as j
      from generate_series(0, 23) as h(h)
      left join (
        select extract(hour from paid_at at time zone 'Africa/Lagos')::int as h,
               count(*) as n
          from cur group by 1
      ) o on o.h = h.h
  ),

  vendors as (
    select jsonb_agg(x order by x.revenue_kobo desc) as j
      from (
        select coalesce(v.business_name, 'Unknown vendor') as name,
               sum(c.total_kobo)                           as revenue_kobo
          from cur c
          left join public.vendor_profiles v on v.id = c.vendor_id
         group by 1
         order by 2 desc
         limit 6
      ) x
  ),

  -- Top products group by name, not listing_id: a line item keeps its name
  -- after the listing is archived, and dropping those rows would quietly
  -- shrink the totals of anything that stopped being sold.
  products as (
    select jsonb_agg(x order by x.revenue_kobo desc) as j
      from (
        select i.name,
               count(distinct i.order_id) as orders,
               sum(i.qty * i.price_kobo)  as revenue_kobo
          from public.order_items i
          join cur c on c.id = i.order_id
         group by 1
         order by 3 desc
         limit 5
      ) x
  )

  select jsonb_build_object(
           'days',              v_days,
           'revenue_kobo',      k.revenue_kobo,
           'orders',            k.orders,
           'customers',         k.customers,
           'prev_revenue_kobo', k.prev_revenue_kobo,
           'prev_orders',       k.prev_orders,
           'prev_customers',    k.prev_customers,
           'trend',             coalesce(t.j,   '[]'::jsonb),
           'categories',        coalesce(cat.j, '[]'::jsonb),
           'hours',             coalesce(hr.j,  '[]'::jsonb),
           'vendors',           coalesce(vd.j,  '[]'::jsonb),
           'products',          coalesce(pr.j,  '[]'::jsonb)
         )
    into v_out
    from kpis k, trend t, categories cat, hours hr, vendors vd, products pr;

  return v_out;
end;
$fn$;
revoke all on function public.admin_analytics(integer) from public, anon;
grant execute on function public.admin_analytics(integer) to authenticated, service_role;
comment on function public.admin_analytics(integer) is
  'Platform analytics for the last p_days (1-365) with the previous equal window for comparison. Staff or service_role only. Aggregates in SQL so no figure can be truncated by a PostgREST page size.';
