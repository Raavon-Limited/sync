-- ============================================================================
-- overview_counts_accounts
--
-- /admin said "PENDING VERIFICATIONS 5" while /admin/verification   the page
-- that IS the pending queue   listed two. Neither number was wrong. They were
-- answers to different questions.
--
-- WHAT THE CARD WAS COUNTING
--   Rows in `verification_documents` with status 'under_review'. That is a
--   count of FILES: one account that uploads a live photo, a government ID and
--   a school ID is three of them. It is a real number, and nothing on the
--   platform asks for it   there is no screen that lists loose documents,
--   because a document is never reviewed alone. It is reviewed as part of the
--   account that uploaded it, on that account's page.
--
--   So the front door showed a queue depth that could not be opened, matched
--   no list anywhere, and grew several times faster than the work it stood for.
--
-- WHAT IT COUNTS NOW
--   Accounts sitting at verification_status = 'pending'   somebody submitted
--   and is waiting on a human   across the same five sources
--   /admin/verification reads:
--
--     vendor_profiles       businesses, landlords included. A landlord IS a
--                           vendor_profiles row; being reviewed on its own
--                           screen does not make it not a queue item.
--     rider_profiles        riders
--     logistics_companies   fleets
--     student_profiles      students. Their status is NOT the profiles
--                           mirror   see 20260903180000.
--     profiles              event organisers and content creators, who hold no
--                           business row, so for them that column IS the
--                           authority.
--
--   'unverified' is deliberately not counted: it means nobody has submitted
--   anything, which is not work waiting on staff. Archived accounts are out
--   for the same reason   for students through the person, since
--   student_profiles has no archived_at of its own.
--
--   The card now agrees with the Pending chip on /admin/verification, and the
--   card links there, so the number can be clicked and read.
--
-- WHY THE WHOLE FUNCTION IS RESTATED
--   Postgres cannot replace one CTE inside a function. Everything below is
--   identical to 20260828130000 apart from the new `pending_accounts` CTE and
--   the two lines of `cards` that use it.
--
-- ROLLBACK
--   Re-run 20260828130000_fix_admin_rpc_caller_check.sql.
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
  if not private.is_platform_reader() then
    raise exception 'Only staff can read the platform overview'
      using errcode = '42501';
  end if;

  with
  -- ── Every account that has a verification state, flattened ───────────────
  -- One shape for five tables, so the count is one predicate rather than five
  -- that would drift apart the first time a sixth kind of account appears.
  -- The same flattening /admin/verification does in TypeScript.
  accounts as (
    select v.verification_status as status, v.created_at as created_at
      from public.vendor_profiles v
     where v.archived_at is null
    union all
    select r.verification_status, r.created_at
      from public.rider_profiles r
     where r.archived_at is null
    union all
    select c.verification_status, c.created_at
      from public.logistics_companies c
     where c.archived_at is null
    union all
    -- student_profiles has no archive column; the person carries it.
    select s.verification_status, s.created_at
      from public.student_profiles s
      join public.profiles p on p.id = s.id
     where p.archived_at is null
    union all
    select p.verification_status, p.created_at
      from public.profiles p
     where p.archived_at is null
       and p.role in ('event_manager', 'creator')
  ),

  -- ── The four cards, each with its 30-days-ago counterpart ────────────────
  cards as (
    select
      (select count(*) from public.vendor_profiles where archived_at is null)          as vendors,
      (select count(*) from public.vendor_profiles
        where archived_at is null and created_at < v_ago)                              as vendors_prev,
      (select count(*) from public.profiles where archived_at is null)                 as users,
      (select count(*) from public.profiles
        where archived_at is null and created_at < v_ago)                              as users_prev,
      (select count(*) from accounts where status = 'pending')                         as verifications,
      (select count(*) from accounts
        where status = 'pending' and created_at < v_ago)                               as verifications_prev,
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
  'Front-page counts, six-month revenue and signup series, vendor status split and a merged activity feed. "verifications" is accounts awaiting a decision, which is what /admin/verification lists. Staff or service_role only.';
