-- ============================================================================
-- store_cooldown
--
-- VOCABULARY: storefront = the business (vendor_profiles); store = one
-- location (public.storefronts, legacy name). See modules/storefronts/README.
--
-- A store that is drowning needs to stop taking orders for ten minutes, not
-- close for the day.
--
-- WHY is_accepting_orders IS NOT ENOUGH
--   It already exists and it is a manual switch with no expiry. A kitchen with
--   fourteen tickets on the rail does not have a spare hand to flip it back,
--   so it either never gets flipped off or never gets flipped on again. Both
--   failures are silent and both cost money: one buries the kitchen, the other
--   closes the shop until someone notices.
--
--   The cooldown is a DEADLINE, not a switch. `paused_until` is a timestamp;
--   the pause ends because the time passes. There is no cron, no sweep, no
--   job that can fail to run and leave a store shut overnight. A store that
--   nobody touches again reopens on its own.
--
-- TWO WAYS IN, ONE WAY OUT
--   manual        the vendor or their staff taps "Pause 10 minutes".
--   auto_backlog  the store has more unfinished orders than it said it can
--                 hold, so it pauses itself.
--   Both write the same column, so everything downstream — checkout, the
--   storefront page, the store switcher — asks one question and does not care
--   which happened.
--
-- BACKLOG, NOT RATE
--   "Too many orders" measured as orders-per-minute punishes a store that got
--   a burst and cleared it instantly, and misses one that took four orders an
--   hour ago and has not started any of them. What actually means "cannot keep
--   up" is the number of orders accepted and not yet out the door, so that is
--   what `auto_pause_after` counts.
--
-- OPT-IN
--   `auto_pause_after` is null by default: nothing auto-pauses until a vendor
--   says what their limit is. A platform guessing a kitchen's capacity and
--   silently closing it is worse than not having the feature.
--
-- WHAT THIS DOES NOT DO
--   A pause stops NEW orders. It does not touch orders already placed, it does
--   not empty carts, and it does not hide the store — students can still see
--   it, read the menu and message the vendor. Hiding it would lose the vendor
--   the customer entirely for the sake of ten minutes.
--
-- ROLLBACK
--   drop trigger if exists orders_auto_pause_busy_store on public.orders;
--   drop function if exists public.auto_pause_busy_store();
--   drop function if exists public.pause_store(uuid, integer);
--   drop function if exists public.resume_store(uuid);
--   drop function if exists public.store_accepting_orders(uuid);
--   alter table public.storefronts
--     drop column if exists paused_until,
--     drop column if exists pause_reason,
--     drop column if exists auto_pause_after,
--     drop column if exists auto_pause_minutes;
-- ============================================================================

alter table public.storefronts
  -- The deadline. Null, or in the past, means open.
  add column if not exists paused_until       timestamptz,
  add column if not exists pause_reason       text
    check (pause_reason in ('manual', 'auto_backlog')),
  -- Null = never auto-pause. Opt-in, per store: a two-hand kitchen and a
  -- supermarket do not have the same number.
  add column if not exists auto_pause_after   integer
    check (auto_pause_after is null or auto_pause_after > 0),
  add column if not exists auto_pause_minutes integer not null default 10
    check (auto_pause_minutes between 1 and 120);
-- Finding the stores that are open right now is the single most common read on
-- this table, and it is a partial index because paused stores are the rare case.
create index if not exists storefronts_paused_idx
  on public.storefronts (paused_until) where paused_until is not null;
-- ── One definition of "open" ────────────────────────────────────────────────
-- Checkout, the storefront page, discovery and the vendor's own switcher all
-- ask this. Three implementations of "is it open" is three chances for the
-- button to disagree with the till.
create or replace function public.store_accepting_orders(p_storefront_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
           s.is_accepting_orders
             and s.archived_at is null
             and (s.paused_until is null or s.paused_until <= now()),
           false
         )
    from public.storefronts s
   where s.id = p_storefront_id;
$$;
grant execute on function public.store_accepting_orders(uuid) to anon, authenticated, service_role;
comment on function public.store_accepting_orders(uuid) is
  'Whether a store takes orders right now: switched on, not archived, and not inside a cooldown. The only definition — do not re-implement it in a query.';
-- ── Manual pause and resume ─────────────────────────────────────────────────
-- Staff can pause. They are the ones being buried, and a manager who has to
-- phone the owner to stop the tickets will simply not stop them.
create or replace function public.pause_store(p_storefront_id uuid, p_minutes integer default 10)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_until timestamptz;
begin
  if not private.can_manage_storefront(p_storefront_id, (select auth.uid())) then
    raise exception 'Not allowed to pause this store' using errcode = '42501';
  end if;

  if p_minutes is null or p_minutes < 1 or p_minutes > 120 then
    raise exception 'Pause must be between 1 and 120 minutes' using errcode = 'P0001';
  end if;

  -- Extends from NOW, not from an existing deadline: tapping "10 minutes"
  -- twice means ten more minutes, which is what the person tapping it means.
  v_until := now() + make_interval(mins => p_minutes);

  update public.storefronts
     set paused_until = v_until,
         pause_reason = 'manual',
         updated_at   = now()
   where id = p_storefront_id;

  return v_until;
end;
$fn$;
create or replace function public.resume_store(p_storefront_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not private.can_manage_storefront(p_storefront_id, (select auth.uid())) then
    raise exception 'Not allowed to resume this store' using errcode = '42501';
  end if;

  -- Clearing the reason too, so a resumed store does not keep explaining a
  -- pause that is over.
  update public.storefronts
     set paused_until = null,
         pause_reason = null,
         updated_at   = now()
   where id = p_storefront_id;
end;
$fn$;
revoke all on function public.pause_store(uuid, integer)  from public, anon;
revoke all on function public.resume_store(uuid)          from public, anon;
grant execute on function public.pause_store(uuid, integer) to authenticated, service_role;
grant execute on function public.resume_store(uuid)         to authenticated, service_role;
-- ── Auto-pause on backlog ───────────────────────────────────────────────────
create or replace function public.auto_pause_busy_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_store   public.storefronts%rowtype;
  v_backlog integer;
begin
  if new.storefront_id is null then
    return new;
  end if;

  select * into v_store from public.storefronts where id = new.storefront_id;

  -- Not opted in, or already inside a cooldown. Re-pausing an already-paused
  -- store would extend the cooldown with every order that slipped through,
  -- which is how ten minutes quietly becomes an hour.
  if v_store.auto_pause_after is null
     or (v_store.paused_until is not null and v_store.paused_until > now()) then
    return new;
  end if;

  -- Accepted and not yet out the door. 'picked_up' and 'on_the_way' are the
  -- rider's problem, not the kitchen's, so they do not count against capacity.
  select count(*) into v_backlog
    from public.orders o
   where o.storefront_id = new.storefront_id
     and o.status in ('pending', 'preparing');

  if v_backlog >= v_store.auto_pause_after then
    update public.storefronts
       set paused_until = now() + make_interval(mins => v_store.auto_pause_minutes),
           pause_reason = 'auto_backlog',
           updated_at   = now()
     where id = new.storefront_id;
  end if;

  return new;
exception
  when others then
    -- A failure to pause must never fail the order that is already paid for.
    raise warning 'auto_pause_busy_store failed for store %: %', new.storefront_id, sqlerrm;
    return new;
end;
$fn$;
drop trigger if exists orders_auto_pause_busy_store on public.orders;
-- AFTER insert: the order that tips the store over its limit is still accepted.
-- The cooldown applies to the NEXT one.
create trigger orders_auto_pause_busy_store
  after insert on public.orders
  for each row execute function public.auto_pause_busy_store();
-- ── Let a manager set their own limit ───────────────────────────────────────
-- `guard_storefront_privileged_cols` freezes structural columns for non-owners.
-- Capacity is an operational setting, like trading hours, so it is deliberately
-- NOT added to that list: the person running the store sets it.

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'storefronts'
       and column_name = 'paused_until'
  ) then
    raise exception 'paused_until missing';
  end if;

  if to_regprocedure('public.store_accepting_orders(uuid)') is null then
    raise exception 'store_accepting_orders missing';
  end if;
end $$;
