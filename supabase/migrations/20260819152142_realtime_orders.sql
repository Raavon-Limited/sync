-- ============================================================================
-- realtime_orders
--
-- Extends the realtime publication to the order and delivery pipeline, so the
-- vendor inbox, the student tracking screen and the rider queue all update
-- without polling.
--
-- WHY REPLICA IDENTITY FULL
--   Realtime applies the subscriber's RLS to each change before sending it, and
--   `postgres_changes` filters (`vendor_id=eq.…`) are evaluated against the row
--   in the WAL record. With Postgres's default replica identity, an UPDATE or
--   DELETE only writes the PRIMARY KEY of the old row — every other column is
--   absent. That has two consequences worth stating plainly:
--
--     1. A filter on a non-PK column cannot be evaluated for those events, so
--        subscribers either miss updates or receive ones meant for someone else
--        to discard client-side.
--     2. RLS cannot be checked against columns that are not in the record, so
--        Realtime errs toward not sending — silent missing updates.
--
--   `replica identity full` writes the whole old row, which fixes both. It costs
--   WAL volume proportional to row width. These tables are narrow and low-churn
--   relative to, say, an analytics firehose, so the trade is clearly worth it
--   here — but it is a trade, and it should NOT be applied blanket-wide.
--
-- WHAT IS DELIBERATELY NOT PUBLISHED
--   `wallets`, `ledger_entries`, `escrow_holds`, `payouts`. Money must not
--   stream to a browser: a subscriber that momentarily has a channel open across
--   a token refresh is a wider window than a request-scoped read. Balances are
--   refetched after the mutation that changed them instead.
--
-- ROLLBACK
--   alter publication supabase_realtime drop table public.orders,
--     public.order_events, public.deliveries, public.delivery_offers;
--   alter table public.orders          replica identity default;
--   alter table public.deliveries      replica identity default;
--   alter table public.delivery_offers replica identity default;
-- ============================================================================

do $$
declare
  t text;
  wanted text[] := array['orders', 'order_events', 'deliveries', 'delivery_offers'];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise warning 'publication supabase_realtime not found - enable Realtime in the dashboard';
    return;
  end if;

  foreach t in array wanted loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'realtime: published %', t;
    end if;
  end loop;
end $$;
-- Filtered subscriptions need the full old row (see header).
alter table public.orders          replica identity full;
alter table public.deliveries      replica identity full;
alter table public.delivery_offers replica identity full;
-- order_events is append-only: there are no UPDATEs or DELETEs to reconstruct,
-- so the default identity is sufficient and cheaper.

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  missing int;
  money_leaked text;
begin
  select count(*) into missing
    from unnest(array['orders','order_events','deliveries','delivery_offers']) w
   where not exists (
     select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = w
   );

  if missing > 0 then
    raise exception '% order/delivery table(s) are not published to realtime', missing;
  end if;

  -- Money tables must never stream.
  select string_agg(tablename, ', ') into money_leaked
    from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename in ('wallets', 'escrow_holds', 'payouts', 'bank_accounts');

  if money_leaked is not null then
    raise exception 'money tables are published to realtime: %', money_leaked;
  end if;

  raise notice 'realtime ready: orders, order_events, deliveries, delivery_offers.';
end $$;
