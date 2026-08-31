-- ============================================================================
-- my_revenue_series
--
-- The revenue chart on every role dashboard is real until you touch it.
--
--   <RevenueChartPanel initialData={chart} initialPeriod="weekly" />
--
-- RoleDashboard passes real weekly figures and no `fetchRevenue`, and the
-- panel defaults that prop to `fetchRevenueMock` — a file whose whole body is
-- `Math.random()`. So the chart loads honest and turns fictional the moment a
-- vendor switches to Daily, Monthly or All Time. Real first, fabricated on
-- interaction, no error anywhere. This is the query that replaces it.
--
-- REVENUE MEANS WHAT ARRIVED
--   Escrow releases into the caller's own wallet, which is the same definition
--   `landlord-data.ts` and the vendor dashboard already use for the weekly
--   figure. If this RPC counted anything else, switching period would change
--   the number for a reason that has nothing to do with the period.
--
-- WHY SQL AND NOT A SELECT FROM THE ACTION
--   'all' is precisely the case a PostgREST select cannot serve: unbounded
--   reads stop at 1000 rows, so a long-lived vendor's all-time chart would
--   quietly plot only their most recent thousand transactions and read low.
--
-- NOT SECURITY DEFINER
--   It does not need to be. `private.ledger_entries` is unreachable from
--   `authenticated`, so the function is owner-run to reach it — but it scopes
--   every read to `auth.uid()` itself and takes no owner parameter. There is
--   no argument a caller could pass to see somebody else's money.
--
-- EMPTY BUCKETS ARE KEPT
--   generate_series supplies the quiet days. A chart that omits them draws a
--   flat line through a week with no sales and reads as steady trade.
--
-- ROLLBACK
--   drop function if exists public.my_revenue_series(text);
-- ============================================================================

create or replace function public.my_revenue_series(p_period text default 'weekly')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_grain  text;        -- day | week | month | year
  v_points integer;     -- how many buckets back, null for 'all'
  v_fmt    text;
  v_first  timestamptz;
  v_out    jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- The seven options in revenue-period.ts collapse to four granularities.
  -- An unknown period falls back to weekly rather than erroring: the chart
  -- asking a question we do not understand should still draw something true.
  case p_period
    when 'daily'   then v_grain := 'day';   v_points := 30;
    when 'weekly'  then v_grain := 'week';  v_points := 12;
    when '3m'      then v_grain := 'week';  v_points := 13;
    when 'monthly' then v_grain := 'month'; v_points := 12;
    when '6m'      then v_grain := 'month'; v_points := 6;
    when 'yearly'  then v_grain := 'month'; v_points := 12;
    when 'all'     then v_grain := 'year';  v_points := null;
    else                v_grain := 'week';  v_points := 12;
  end case;

  -- Labels match what the chart already renders, so the axis does not change
  -- shape when the data stops being fake: "Aug 14", "Aug W2", "Aug", "2026".
  v_fmt := case v_grain
             when 'day'   then 'Mon DD'
             when 'week'  then 'Mon'      -- the W-number is appended below
             when 'month' then 'Mon'
             else              'YYYY'
           end;

  -- 'all' starts at the caller's first transaction, not at a fixed offset.
  if v_points is null then
    select min(e.created_at) into v_first
      from private.ledger_entries e
      join public.wallets w on w.id = e.wallet_id
     where w.owner_id = v_uid;

    -- Nobody has ever been paid. One empty bucket for this year beats an
    -- empty array, which the chart would divide by.
    if v_first is null then
      v_first := now();
    end if;
  end if;

  with
  buckets as (
    select generate_series(
             case
               when v_points is null
                 then date_trunc('year', v_first at time zone 'Africa/Lagos')
               else date_trunc(v_grain, now() at time zone 'Africa/Lagos')
                    - make_interval(days  => case when v_grain = 'day'   then v_points - 1 else 0 end,
                                    weeks => case when v_grain = 'week'  then v_points - 1 else 0 end,
                                    months => case when v_grain = 'month' then v_points - 1 else 0 end)
             end,
             date_trunc(v_grain, now() at time zone 'Africa/Lagos'),
             ('1 ' || v_grain)::interval
           ) as b
  ),
  paid as (
    select date_trunc(v_grain, e.created_at at time zone 'Africa/Lagos') as b,
           sum(e.amount_kobo)                                            as revenue_kobo
      from private.ledger_entries e
      join public.wallets w              on w.id = e.wallet_id
      join private.ledger_transactions t on t.id = e.transaction_id
     where w.owner_id = v_uid
       and t.kind = 'escrow_release'
       -- Inflows only. A negative entry on the same transaction is the other
       -- side of the double entry, and adding it in nets the vendor to zero.
       and e.amount_kobo > 0
     group by 1
  )
  select jsonb_agg(
           jsonb_build_object(
             'label',
             case
               when v_grain = 'week'
                 -- "Aug W2": the week-of-month the chart's mock labels used.
                 then to_char(buckets.b, 'Mon') || ' W' ||
                      ceil(extract(day from buckets.b) / 7.0)::int
               else to_char(buckets.b, v_fmt)
             end,
             'revenue_kobo', coalesce(paid.revenue_kobo, 0)
           ) order by buckets.b
         )
    into v_out
    from buckets left join paid on paid.b = buckets.b;

  return coalesce(v_out, '[]'::jsonb);
end;
$fn$;
revoke all on function public.my_revenue_series(text) from public, anon;
grant execute on function public.my_revenue_series(text) to authenticated;
comment on function public.my_revenue_series(text) is
  'The calling user''s own escrow-release revenue, bucketed for the dashboard chart. Takes no owner argument: scoped to auth.uid() inside. Aggregates in SQL so an all-time series cannot be truncated by a PostgREST page size.';
