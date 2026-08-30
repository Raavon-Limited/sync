-- ============================================================================
-- admin_overview
--
-- /admin — the page every staff member lands on — was four hardcoded stat
-- cards (1248 vendors, 8542 users, 47 verifications, 23 disputes), six months
-- of invented revenue, six months of invented signups, four fictional activity
-- lines, and a vendor status split of 1024/147/77. Every number on the
-- platform's front door was made up.
--
-- SAME REASONING AS admin_analytics
--   Counting in SQL rather than reading rows and counting them in JavaScript,
--   because an unbounded PostgREST select stops at 1000 rows and would report
--   "1000 vendors" forever once the platform passed a thousand.
--
-- WHAT "CHANGE" MEANS ON EACH CARD
--   Vendors and users compare today's total against the total 30 days ago, so
--   the arrow is growth. Verifications and disputes are queues, not totals:
--   their comparison is the size of the queue 30 days ago, so a rising number
--   is a backlog rather than an achievement. Both are computed from
--   created_at, which is the only history these tables keep.
--
-- THE ACTIVITY FEED IS A UNION, NOT AN EVENT TABLE
--   There is no platform-wide event log. The feed is the most recent rows from
--   the four things staff care about — vendors joining, disputes resolving,
--   vendors being verified, students signing up — merged and cut to ten. It is
--   honest about being a derived view: nothing is invented, but nothing is
--   guaranteed to be there either, and a quiet week shows a short list.
--
-- ROLLBACK
--   drop function if exists public.admin_overview();
-- ============================================================================

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
  if not public.is_staff() and current_user <> 'service_role' then
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
