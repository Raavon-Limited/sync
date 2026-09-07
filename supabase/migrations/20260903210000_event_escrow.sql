-- ============================================================================
-- event_escrow
--
-- Ticket money is HELD until the event has happened, then released to the
-- organiser unless somebody disputed that it happened at all.
--
-- WHAT IT REPLACES
--   `purchase_tickets` (20260826090000) moved the whole ticket price straight
--   to `platform_revenue`. Its own comment said so: "organiser payout is not
--   modelled". So Sync took 100% of every ticket and there was no path by
--   which an organiser could ever be paid. That is not a fee policy anybody
--   chose; it is what a placeholder looks like once it ships.
--
-- WHY ESCROW AND NOT PAY-ON-PURCHASE
--   A ticket is bought for something that has not happened yet, sometimes
--   weeks out. That is the same exposure as rent paid before a move-in, and
--   the platform already answers it the same way: hold the money, release it
--   once the thing is delivered, and let a dispute pause the release. Paying an
--   organiser at checkout would mean a cancelled event is money Sync has
--   already given away and has to chase.
--
-- WHEN IT RELEASES
--   `starts_at + 24 hours`. There is no end time on an event, and a day is long
--   enough that somebody who turned up to a locked gate has had a chance to say
--   so. An open dispute holds it indefinitely: release checks for one every
--   time, so raising a dispute an hour before the window closes still works.
--
-- THE CHARGE IS FROZEN ON THE HOLD AT CREATION
--   The same rule the rest of the money model follows: `commission_kobo` is
--   computed when the hold is made and deducted at release, so an organiser
--   sees what they will actually receive before the event, and a later change
--   to the rate cannot reach back into holds already taken.
--
--   THE RATE IS AN ASSUMPTION, STATED SO IT CAN BE CHANGED. 5% capped at
--   ₦2,000, the same as a vendor, on the grounds that an organiser selling
--   tickets is a business selling a thing. The money model does not name events
--   specifically. If it should be different, change EVENT_RATE below - it is
--   deliberately one expression in one place.
--
-- ROLLBACK
--   drop function if exists public.sweep_event_escrow();
--   drop function if exists public.release_event_escrow(uuid);
--   alter table public.disputes drop column if exists event_id;
--   alter table public.escrow_holds drop column if exists event_id;
--   (and restore purchase_tickets from 20260826090000)
-- ============================================================================

-- === 1. An event is a subject of a hold, and of a dispute ===================
alter table public.escrow_holds
  add column if not exists event_id uuid references public.events (id) on delete set null;

comment on column public.escrow_holds.event_id is
  'Ticket money for this event, held until it has happened. Like delivery_id, an event hold carries NO order_id - three money functions select a single hold by order_id and a second row would make them pick one at random.';

create index if not exists escrow_holds_event_idx
  on public.escrow_holds (event_id) where event_id is not null;

alter table public.disputes
  add column if not exists event_id uuid references public.events (id) on delete set null;

comment on column public.disputes.event_id is
  'Raised against an event - in practice "it never happened". An unresolved one blocks release_event_escrow.';

-- === 2. Releasing ===========================================================
-- Returns how many holds it released, so the sweep can log something true.
create or replace function public.release_event_escrow(p_event uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_event    public.events%rowtype;
  v_hold     public.escrow_holds%rowtype;
  v_wallet   uuid;
  v_net      bigint;
  v_count    integer := 0;
begin
  select * into v_event from public.events where id = p_event;
  if not found then
    raise exception 'no such event' using errcode = 'P0002';
  end if;

  if v_event.organizer_id is null then
    -- A seeded event with no organiser has nobody to pay. Left held rather than
    -- swept into revenue, because "we could not find who to pay" is a thing
    -- somebody should look at, not something to resolve silently.
    return 0;
  end if;

  -- THE DISPUTE CHECK IS THE WHOLE POINT, and it is here rather than in the
  -- sweep so that a direct call cannot skip it.
  if exists (
    select 1 from public.disputes d
     where d.event_id = p_event
       and d.resolved_at is null
  ) then
    return 0;
  end if;

  select id into v_wallet from public.wallets where owner_id = v_event.organizer_id;
  if v_wallet is null then
    return 0;
  end if;

  for v_hold in
    select * from public.escrow_holds
     where event_id = p_event
       and status = 'held'
       and release_after is not null
       and release_after <= now()
     for update
  loop
    v_net := v_hold.amount_kobo - coalesce(v_hold.commission_kobo, 0);

    perform private.post_transaction(
      'event_payout',
      'Tickets for ' || coalesce(v_event.name, 'an event'),
      jsonb_build_array(
        jsonb_build_object('account', 'platform_escrow', 'amount_kobo', -v_hold.amount_kobo),
        jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet, 'amount_kobo', v_net),
        jsonb_build_object('account', 'platform_revenue',
                           'amount_kobo', coalesce(v_hold.commission_kobo, 0))
      ),
      'event-release-' || v_hold.id::text
    );

    update public.escrow_holds
       set status = 'released', released_at = now(), updated_at = now()
     where id = v_hold.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

revoke all on function public.release_event_escrow(uuid) from public, anon;
grant execute on function public.release_event_escrow(uuid) to authenticated, service_role;

-- === 3. The sweep ===========================================================
-- Everything due, in one pass, for the cron. Separate from the per-event
-- function so a failure on one event does not stop the rest.
create or replace function public.sweep_event_escrow()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_event uuid;
  v_total integer := 0;
begin
  for v_event in
    select distinct h.event_id
      from public.escrow_holds h
     where h.event_id is not null
       and h.status = 'held'
       and h.release_after is not null
       and h.release_after <= now()
  loop
    begin
      v_total := v_total + public.release_event_escrow(v_event);
    exception when others then
      -- One bad event must not strand every other organiser's money.
      raise warning 'event escrow release failed for %: %', v_event, sqlerrm;
    end;
  end loop;

  return v_total;
end;
$fn$;

revoke all on function public.sweep_event_escrow() from public, anon;
grant execute on function public.sweep_event_escrow() to service_role;

-- === 4. Buying a ticket now creates a hold ==================================
-- Reproduced from 20260826090000 with the money branch changed and everything
-- else - the quantity bound, the idempotent reference, the stock check, the
-- row-level lock - left exactly as it was.
create or replace function public.purchase_tickets(
  p_tier_id   uuid,
  p_quantity  integer default 1,
  p_reference text    default null
)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid      uuid := auth.uid();
  v_tier     public.event_ticket_tiers%rowtype;
  v_event    public.events%rowtype;
  v_wallet   uuid;
  v_balance  bigint;
  v_total    bigint;
  v_fee      bigint;
  v_ref      text;
  v_i        integer;
  v_id       uuid;
  v_hold     uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'quantity must be between 1 and 10' using errcode = '22023';
  end if;

  v_ref := coalesce(nullif(btrim(coalesce(p_reference, '')), ''),
                    'tix-' || gen_random_uuid()::text);

  -- Idempotent by reference: a replayed request returns the tickets it already
  -- issued rather than issuing more.
  if exists (select 1 from public.tickets where reference like v_ref || '-%') then
    return query select id from public.tickets where reference like v_ref || '-%';
    return;
  end if;

  select * into v_tier from public.event_ticket_tiers where id = p_tier_id for update;
  if not found then
    raise exception 'no such ticket tier' using errcode = 'P0002';
  end if;
  if not v_tier.is_active then
    raise exception 'that tier is not on sale' using errcode = 'P0001';
  end if;
  if v_tier.quantity is not null and v_tier.sold + p_quantity > v_tier.quantity then
    raise exception 'only % left', greatest(0, v_tier.quantity - v_tier.sold)
      using errcode = 'P0001';
  end if;

  select * into v_event from public.events where id = v_tier.event_id;
  if not found then
    raise exception 'no such event' using errcode = 'P0002';
  end if;

  v_total := v_tier.price_kobo * p_quantity;

  -- Free tiers still issue tickets; they just do not move money, and a
  -- zero-kobo ledger transaction would not balance meaningfully.
  if v_total > 0 then
    select id, balance_kobo into v_wallet, v_balance
      from public.wallets where owner_id = v_uid for update;
    if v_wallet is null then
      raise exception 'no wallet' using errcode = 'P0002';
    end if;
    if v_balance < v_total then
      raise exception 'insufficient balance: wallet has % kobo, tickets cost %',
        v_balance, v_total using errcode = 'P0001';
    end if;

    -- EVENT_RATE: 5% capped at ₦2,000, frozen onto the hold now and deducted at
    -- release. One expression, one place - see the header on why it is an
    -- assumption rather than a decision.
    v_fee := least((v_total * 5) / 100, 200000);

    -- Into escrow, NOT into revenue. This is the whole change.
    perform private.post_transaction(
      'ticket_purchase',
      p_quantity || ' x ' || v_tier.name,
      jsonb_build_array(
        jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet, 'amount_kobo', -v_total),
        jsonb_build_object('account', 'platform_escrow', 'amount_kobo', v_total)
      ),
      v_ref
    );

    insert into public.escrow_holds
      (payer_id, payee_id, event_id, amount_kobo, commission_kobo, status, release_after)
    values
      (v_uid, v_event.organizer_id, v_event.id, v_total, v_fee, 'held',
       -- A day after it starts. There is no end time on an event, and a day is
       -- long enough for somebody who found a locked gate to say so.
       v_event.starts_at + interval '24 hours')
    returning id into v_hold;
  end if;

  for v_i in 1 .. p_quantity loop
    insert into public.tickets (event_id, owner_id, reference, tier, price_kobo, status)
    values (
      v_tier.event_id,
      v_uid,
      -- Prefixed with the attempt reference so a replay can find them again.
      v_ref || '-' || v_i,
      v_tier.name,
      v_tier.price_kobo,
      'valid'
    )
    returning id into v_id;
    return next v_id;
  end loop;

  return;
end;
$fn$;

grant execute on function public.purchase_tickets(uuid, integer, text) to authenticated, service_role;

comment on function public.purchase_tickets is
  'Buys tickets from wallet balance. Idempotent by caller-supplied reference. Money goes to platform_escrow and is released to the organiser 24h after the event starts, less the Sync charge, unless a dispute is open. See 20260903210000.';

-- === Verify =================================================================
do $$
begin
  if to_regprocedure('public.release_event_escrow(uuid)') is null then
    raise exception 'release_event_escrow missing';
  end if;
  if to_regprocedure('public.sweep_event_escrow()') is null then
    raise exception 'sweep_event_escrow missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'escrow_holds' and column_name = 'event_id'
  ) then
    raise exception 'escrow_holds.event_id missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'disputes' and column_name = 'event_id'
  ) then
    raise exception 'disputes.event_id missing';
  end if;

  -- The point of the whole file: ticket money must no longer go straight to
  -- revenue.
  if position('platform_escrow' in
       (select prosrc from pg_proc where proname = 'purchase_tickets' limit 1)) = 0 then
    raise exception 'purchase_tickets still pays revenue directly - escrow not wired';
  end if;
end $$;
