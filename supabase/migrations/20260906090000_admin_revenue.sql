-- ============================================================================
-- admin_revenue
--
-- What Sync actually earned, as opposed to what moved through it.
--
-- THE DISTINCTION THIS EXISTS TO MAKE
--   /admin already charts revenue, and that chart is `orders.total_kobo`   the
--   value of everything sold. It is the right number for "how busy is the
--   platform" and the wrong one for "what did we make": a ₦150,000 rent payment
--   moves ₦150,000 through Sync and earns Sync ₦3,750 of it. Reading the first
--   as income overstates it by a factor of forty, and it is the kind of mistake
--   that only shows up when somebody tries to pay a bill with it.
--
-- THE LEDGER ALREADY KNOWS
--   `private.ledger_entries` is double-entry, and every charge the platform
--   takes is a line against the internal `platform_revenue` account: the
--   commission frozen onto an escrow hold, a plan subscription, a ticket fee, a
--   commission handed back when an order is refunded. Nothing new is recorded
--   here and nothing is recomputed   this reads what the money system already
--   wrote, which is the only version that can be reconciled.
--
-- SIGNED, SO REFUNDS SUBTRACT
--   Entries are signed: a refund posts a negative line to platform_revenue
--   because the commission went back. Summing absolute values would report a
--   month of cancellations as a record month.
--
-- WHY AN RPC AND NOT A VIEW
--   The ledger lives in `private` and no client role can read it   which is
--   correct, it is the money. A SECURITY DEFINER function is the only way to
--   answer the question without granting anybody standing access to the rows,
--   and the guard is the same one the other admin RPCs use.
--
-- ROLLBACK
--   drop function if exists public.admin_revenue(timestamptz, timestamptz);
-- ============================================================================

create or replace function public.admin_revenue(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_from timestamptz := coalesce(p_from, now() - interval '12 months');
  v_to   timestamptz := coalesce(p_to, now());
  v_out  jsonb;
begin
  if not private.is_platform_reader() then
    raise exception 'Only staff can read platform revenue' using errcode = '42501';
  end if;

  with lines as (
    -- Every charge the platform has taken or given back, with the kind of
    -- transaction that produced it. The join is what turns "a credit" into
    -- "a commission on an order" or "a plan subscription".
    select t.kind,
           t.narrative,
           t.created_at,
           t.order_id,
           t.booking_id,
           e.amount_kobo
      from private.ledger_entries e
      join private.ledger_transactions t on t.id = e.transaction_id
     where e.account = 'platform_revenue'
  ),
  ranged as (
    select * from lines where created_at >= v_from and created_at <= v_to
  ),

  -- ── Headline ────────────────────────────────────────────────────────────
  totals as (
    select
      coalesce(sum(amount_kobo), 0)                                   as earned_kobo,
      coalesce(sum(amount_kobo) filter (where amount_kobo > 0), 0)    as charged_kobo,
      -- Kept separate rather than netted away: "we earned ₦400k and returned
      -- ₦90k of it" is a different month from "we earned ₦310k", and only one
      -- of them prompts anybody to ask why.
      coalesce(-sum(amount_kobo) filter (where amount_kobo < 0), 0)   as returned_kobo,
      count(*)                                                        as line_count
      from ranged
  ),
  -- The all-time balance of the account, which is the number that has to agree
  -- with the books. Not filtered by the range   a balance for a date window is
  -- not a balance.
  balance as (
    select coalesce(sum(amount_kobo), 0) as balance_kobo from lines
  ),

  -- ── Where it came from ──────────────────────────────────────────────────
  by_kind as (
    select coalesce(
             jsonb_agg(jsonb_build_object(
               'kind',        k.kind,
               'amount_kobo', k.amount_kobo,
               'count',       k.n
             ) order by k.amount_kobo desc),
             '[]'::jsonb
           ) as j
      from (
        select kind, sum(amount_kobo) as amount_kobo, count(*) as n
          from ranged
         group by kind
      ) k
  ),

  -- ── Month by month, in Africa/Lagos ─────────────────────────────────────
  months as (
    select generate_series(
             date_trunc('month', (v_from at time zone 'Africa/Lagos')::date),
             date_trunc('month', (v_to   at time zone 'Africa/Lagos')::date),
             interval '1 month'
           )::date as m
  ),
  monthly as (
    select date_trunc('month', (created_at at time zone 'Africa/Lagos'))::date as m,
           sum(amount_kobo) as amount_kobo
      from ranged
     group by 1
  ),
  series as (
    select coalesce(
             jsonb_agg(jsonb_build_object(
               'month',       to_char(months.m, 'Mon YYYY'),
               'amount_kobo', coalesce(monthly.amount_kobo, 0)
             ) order by months.m),
             '[]'::jsonb
           ) as j
      from months left join monthly on monthly.m = months.m
  ),

  -- ── The most recent lines, so a total can be interrogated ───────────────
  recent as (
    select coalesce(
             jsonb_agg(jsonb_build_object(
               'kind',        r.kind,
               'narrative',   r.narrative,
               'amount_kobo', r.amount_kobo,
               'at',          r.created_at
             ) order by r.created_at desc),
             '[]'::jsonb
           ) as j
      from (select * from ranged order by created_at desc limit 50) r
  )

  select jsonb_build_object(
           'from',           v_from,
           'to',             v_to,
           'earned_kobo',    t.earned_kobo,
           'charged_kobo',   t.charged_kobo,
           'returned_kobo',  t.returned_kobo,
           'line_count',     t.line_count,
           'balance_kobo',   b.balance_kobo,
           'by_kind',        k.j,
           'monthly',        s.j,
           'recent',         rc.j
         )
    into v_out
    from totals t, balance b, by_kind k, series s, recent rc;

  return v_out;
end;
$fn$;

revoke all on function public.admin_revenue(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_revenue(timestamptz, timestamptz) to authenticated, service_role;

comment on function public.admin_revenue(timestamptz, timestamptz) is
  'What the platform earned, from private.ledger_entries against the platform_revenue account. NOT order value - see the header. Staff or service_role only.';
