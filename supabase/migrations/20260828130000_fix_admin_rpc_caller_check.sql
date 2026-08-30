-- ============================================================================
-- fix_admin_rpc_caller_check
--
-- `admin_analytics` and `admin_overview` both guard themselves with
--
--   if not public.is_staff() and current_user <> 'service_role' then
--
-- and the second half of that can never be true. Inside a SECURITY DEFINER
-- function `current_user` is the function's OWNER, not the caller — that is
-- the whole point of SECURITY DEFINER. So `current_user` is 'postgres' for
-- every caller alive, the service-role branch never fires, and both functions
-- refuse the service role with 42501.
--
-- `session_user` is no better here: PostgREST connects as `authenticator` and
-- then SET ROLEs to anon / authenticated / service_role, so session_user is
-- 'authenticator' for all three and tells them apart not at all.
--
-- WHAT ACTUALLY IDENTIFIES THE CALLER
--   The `role` claim in the request JWT, which PostgREST publishes as the
--   `request.jwt.claims` GUC. That survives into a definer function because it
--   is request state, not session state. `nullif(..., '')` is needed because
--   an absent GUC reads as the empty string, and ''::jsonb raises.
--
--   session_user is still checked for 'postgres' and 'supabase_admin' so a
--   migration, a cron job or a psql session can call these directly.
--
-- WHY THIS WAS NOT CAUGHT BY THE ANON TEST
--   Anon is refused by the function GRANT, before the body runs, so the
--   "unauthorised callers are turned away" half of the check looked correct.
--   Only the authorised caller was broken. A test that asserts on the refusal
--   and never on the success is half a test.
--
-- The bodies below are otherwise identical to 20260828100000 and
-- 20260828120000 — Postgres has no way to replace a guard without restating
-- the function it lives in.
--
-- ROLLBACK
--   Re-run 20260828100000_admin_analytics.sql and 20260828120000_admin_overview.sql,
--   then: drop function if exists private.is_platform_reader();
-- ============================================================================

create or replace function private.is_platform_reader()
returns boolean
language sql
stable
security definer
set search_path = ''
as $reader$
  select public.is_staff()
      or coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) = 'service_role'
      or session_user in ('postgres', 'supabase_admin');
$reader$;

revoke all on function private.is_platform_reader() from public, anon;
grant execute on function private.is_platform_reader() to authenticated, service_role;

comment on function private.is_platform_reader() is
  'True for staff, for the service role, and for direct superuser sessions. Reads the JWT role claim because current_user is the owner inside a SECURITY DEFINER function and session_user is always ''authenticator'' behind PostgREST.';

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
  if not private.is_platform_reader() then
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

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_ago  timestamptz := now() - interval '30 days';
  v_out  jsonb;
begin
  if not private.is_platform_reader() then
    raise exception 'Only staff can read the platform overview'
      using errcode = '42501';
  end if;

  with
  -- ── The four cards, each with its 30-days-ago counterpart ────────────────
  cards as (
    select
      (select count(*) from public.vendor_profiles where archived_at is null)          as vendors,
      (select count(*) from public.vendor_profiles
        where archived_at is null and created_at < v_ago)                              as vendors_prev,
      (select count(*) from public.profiles where archived_at is null)                 as users,
      (select count(*) from public.profiles
        where archived_at is null and created_at < v_ago)                              as users_prev,
      (select count(*) from public.verification_documents where status = 'under_review') as verifications,
      (select count(*) from public.verification_documents
        where status = 'under_review' and created_at < v_ago)                          as verifications_prev,
      (select count(*) from public.disputes
        where status in ('open', 'investigating', 'awaiting_response'))                as disputes,
      (select count(*) from public.disputes
        where status in ('open', 'investigating', 'awaiting_response')
          and created_at < v_ago)                                                      as disputes_prev
  ),

  -- ── Six months of revenue and signups, in Africa/Lagos ───────────────────
  months as (
    select generate_series(
             date_trunc('month', (now() at time zone 'Africa/Lagos')::date) - interval '5 months',
             date_trunc('month', (now() at time zone 'Africa/Lagos')::date),
             interval '1 month'
           )::date as m
  ),
  revenue as (
    select date_trunc('month', (o.paid_at at time zone 'Africa/Lagos'))::date as m,
           sum(o.total_kobo) as revenue_kobo
      from public.orders o
     where o.paid_at is not null
       and o.status <> 'cancelled'
     group by 1
  ),
  -- Signups are cumulative: the chart is platform size over time, so each
  -- month carries everyone who had joined by the end of it, not that month's
  -- arrivals. A per-month count would make a growing platform look flat.
  growth as (
    select m.m,
           (select count(*) from public.profiles p
             where p.archived_at is null
               and p.created_at < ((m.m + interval '1 month') at time zone 'Africa/Lagos'))
             as users
      from months m
  ),
  series as (
    select
      (select jsonb_agg(
                jsonb_build_object(
                  'month',        to_char(months.m, 'Mon'),
                  'revenue_kobo', coalesce(revenue.revenue_kobo, 0)
                ) order by months.m
              )
         from months left join revenue on revenue.m = months.m) as rev,
      (select jsonb_agg(
                jsonb_build_object('month', to_char(growth.m, 'Mon'), 'users', growth.users)
                order by growth.m
              )
         from growth) as grw
  ),

  -- ── Vendor status split. "Suspended" is an archived account: there is no
  --    suspension flag, and archived is what actually stops someone trading.
  status as (
    select jsonb_build_object(
             'active',    count(*) filter (where archived_at is null and verification_status = 'verified'),
             'pending',   count(*) filter (where archived_at is null and verification_status in ('pending', 'unverified')),
             'suspended', count(*) filter (where archived_at is not null or verification_status = 'rejected')
           ) as j
      from public.vendor_profiles
  ),

  -- ── Activity feed ────────────────────────────────────────────────────────
  -- Each arm caps itself at ten so no single busy source can crowd the others
  -- out before the merge, and the merge takes the ten most recent overall.
  -- Each arm is parenthesised: a bare ORDER BY / LIMIT after UNION ALL binds
  -- to the whole union, not to the arm it is written under.
  events as (
    (select 'vendor'::text as kind,
            'New vendor: ' || v.business_name as label,
            v.created_at as at
       from public.vendor_profiles v
      where v.archived_at is null
      order by v.created_at desc
      limit 10)
    union all
    (select 'dispute'::text,
            'Dispute ' || d.code || ' ' || d.status,
            coalesce(d.resolved_at, d.created_at)
       from public.disputes d
      where d.status in ('resolved', 'rejected')
      order by coalesce(d.resolved_at, d.created_at) desc
      limit 10)
    union all
    (select 'verification'::text,
            'Verified: ' || v.business_name,
            v.verified_at
       from public.vendor_profiles v
      where v.verified_at is not null
      order by v.verified_at desc
      limit 10)
    union all
    (select 'user'::text,
            'New ' || p.role || ': ' || coalesce(p.full_name, 'unnamed account'),
            p.created_at
       from public.profiles p
      where p.archived_at is null
      order by p.created_at desc
      limit 10)
  ),
  feed as (
    select jsonb_agg(
             jsonb_build_object('type', e.kind, 'text', e.label, 'at', e.at)
             order by e.at desc
           ) as j
      from (select * from events order by at desc limit 10) e
  )

  select jsonb_build_object(
           'vendors',            c.vendors,
           'vendors_prev',       c.vendors_prev,
           'users',              c.users,
           'users_prev',         c.users_prev,
           'verifications',      c.verifications,
           'verifications_prev', c.verifications_prev,
           'disputes',           c.disputes,
           'disputes_prev',      c.disputes_prev,
           'revenue',            coalesce(s.rev, '[]'::jsonb),
           'growth',             coalesce(s.grw, '[]'::jsonb),
           'vendor_status',      st.j,
           'activities',         coalesce(f.j, '[]'::jsonb)
         )
    into v_out
    from cards c, series s, status st, feed f;

  return v_out;
end;
$fn$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated, service_role;

comment on function public.admin_overview() is
  'Front-page counts, six-month revenue and signup series, vendor status split and a merged activity feed. Staff or service_role only.';
