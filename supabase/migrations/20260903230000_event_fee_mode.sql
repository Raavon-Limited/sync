-- ============================================================================
-- event_fee_mode
--
-- Two changes to the ticket charge, both decided by the product rather than
-- inherited from the vendor model:
--
--   1. IT IS NOT CAPPED. 20260903210000 borrowed the vendor rule - 5% capped at
--      ₦2,000 - because the money model did not name events. It is a flat 5%.
--      The cap is why it was wrong: a ₦200,000 concert and a ₦40,000 party would
--      have paid Sync the same ₦2,000, which is not a percentage, it is a fee
--      that happens to look like one below the ceiling.
--
--   2. THE ORGANISER DECIDES WHO BEARS IT.
--        'absorb'   the buyer pays the ticket price; Sync's 5% comes out of the
--                   organiser's takings. A ₦5,000 ticket costs ₦5,000 and the
--                   organiser nets ₦4,750.
--        'pass_on'  the 5% is added to the buyer's total; the organiser keeps
--                   the full ticket price. A ₦5,000 ticket costs the buyer
--                   ₦5,250 and the organiser nets ₦5,000.
--
--      Either way the hold carries what the buyer actually paid and
--      `commission_kobo` carries Sync's share, so release_event_escrow needs no
--      change at all: it already pays out amount minus commission.
--
-- THE DEFAULT IS 'absorb'
--   It is the one that cannot surprise a buyer. Passing the charge on changes
--   the advertised price at the last step, so it should be a thing an organiser
--   turns on deliberately, not a thing that happens because nobody looked.
--
-- ROUNDING FAVOURS THE PAYER. Integer division floors, so a fee is never
-- rounded up against whoever is bearing it. On a ₦5,000 ticket that is exact;
-- on odd amounts it costs Sync at most one kobo per purchase.
--
-- ROLLBACK
--   alter table public.events drop column if exists fee_mode;
--   drop function if exists public.quote_tickets(uuid, integer);
--   (and restore purchase_tickets from 20260903210000)
-- ============================================================================

alter table public.events
  add column if not exists fee_mode text not null default 'absorb'
    check (fee_mode in ('absorb', 'pass_on'));

comment on column public.events.fee_mode is
  'Who bears the 5% Sync charge on tickets. absorb = the organiser, out of takings. pass_on = the buyer, added at checkout. Default absorb, because it cannot surprise a buyer.';

-- === Quoting ================================================================
-- What a purchase will cost, BEFORE anybody pays. The buyer's screen needs this
-- to itemise the charge, which the money model requires, and it must be the
-- same arithmetic the purchase uses - so it is one function, not a number the
-- UI works out for itself and hopes matches.
create or replace function public.quote_tickets(p_tier_id uuid, p_quantity integer default 1)
returns table (
  gross_kobo bigint,
  fee_kobo   bigint,
  total_kobo bigint,
  fee_mode   text
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_tier  public.event_ticket_tiers%rowtype;
  v_event public.events%rowtype;
  v_gross bigint;
  v_fee   bigint;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'quantity must be between 1 and 10' using errcode = '22023';
  end if;

  select * into v_tier from public.event_ticket_tiers where id = p_tier_id;
  if not found then
    raise exception 'no such ticket tier' using errcode = 'P0002';
  end if;

  select * into v_event from public.events where id = v_tier.event_id;
  if not found then
    raise exception 'no such event' using errcode = 'P0002';
  end if;

  v_gross := v_tier.price_kobo::bigint * p_quantity;
  -- Flat 5%, no ceiling. Floored, so it is never rounded up against the payer.
  v_fee := (v_gross * 5) / 100;

  return query select
    v_gross,
    v_fee,
    case when v_event.fee_mode = 'pass_on' then v_gross + v_fee else v_gross end,
    v_event.fee_mode;
end;
$fn$;

revoke all on function public.quote_tickets(uuid, integer) from public;
grant execute on function public.quote_tickets(uuid, integer) to anon, authenticated, service_role;

comment on function public.quote_tickets is
  'What buying p_quantity of a tier costs, itemised. Same arithmetic purchase_tickets uses - callers must not compute the charge themselves.';

-- === The organiser sets it ==================================================
create or replace function public.set_event_fee_mode(p_event uuid, p_mode text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_mode not in ('absorb', 'pass_on') then
    raise exception 'Unknown fee mode: %', p_mode using errcode = '22023';
  end if;

  if not private.owns_event(p_event) and not public.is_staff() then
    raise exception 'That event is not yours' using errcode = '42501';
  end if;

  update public.events set fee_mode = p_mode where id = p_event;
  return p_mode;
end;
$fn$;

revoke all on function public.set_event_fee_mode(uuid, text) from public, anon;
grant execute on function public.set_event_fee_mode(uuid, text) to authenticated, service_role;

-- === Buying =================================================================
-- Third revision of this function. Everything except the money branch is
-- unchanged from 20260826090000: the quantity bound, the idempotent reference,
-- the stock check, the row-level lock.
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
  v_gross    bigint;
  v_fee      bigint;
  v_charged  bigint;
  v_ref      text;
  v_i        integer;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'quantity must be between 1 and 10' using errcode = '22023';
  end if;

  v_ref := coalesce(nullif(btrim(coalesce(p_reference, '')), ''),
                    'tix-' || gen_random_uuid()::text);

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

  v_gross := v_tier.price_kobo::bigint * p_quantity;
  -- Flat 5%, uncapped, floored. See the header.
  v_fee := (v_gross * 5) / 100;

  -- WHO PAYS IT IS THE ONLY BRANCH. The hold always holds what the buyer was
  -- charged and the commission is always Sync's share, so the release function
  -- is identical for both modes.
  v_charged := case when v_event.fee_mode = 'pass_on' then v_gross + v_fee else v_gross end;

  if v_charged > 0 then
    select id, balance_kobo into v_wallet, v_balance
      from public.wallets where owner_id = v_uid for update;
    if v_wallet is null then
      raise exception 'no wallet' using errcode = 'P0002';
    end if;
    if v_balance < v_charged then
      raise exception 'insufficient balance: wallet has % kobo, tickets cost %',
        v_balance, v_charged using errcode = 'P0001';
    end if;

    perform private.post_transaction(
      'ticket_purchase',
      p_quantity || ' x ' || v_tier.name,
      jsonb_build_array(
        jsonb_build_object('account', 'user_wallet', 'wallet_id', v_wallet,
                           'amount_kobo', -v_charged),
        jsonb_build_object('account', 'platform_escrow', 'amount_kobo', v_charged)
      ),
      v_ref
    );

    insert into public.escrow_holds
      (payer_id, payee_id, event_id, amount_kobo, commission_kobo, status, release_after)
    values
      (v_uid, v_event.organizer_id, v_event.id, v_charged, v_fee, 'held',
       v_event.starts_at + interval '24 hours');
  end if;

  for v_i in 1 .. p_quantity loop
    insert into public.tickets (event_id, owner_id, reference, tier, price_kobo, status)
    values (
      v_tier.event_id,
      v_uid,
      v_ref || '-' || v_i,
      v_tier.name,
      -- The TICKET records the ticket price, not what was charged. A pass-on
      -- surcharge is Sync's fee, not part of what the ticket was worth, and a
      -- refund of the face value has to be able to find that number.
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
  'Buys tickets from wallet balance. Idempotent by reference. Money goes to platform_escrow, released to the organiser 24h after the event unless disputed. Sync takes a flat uncapped 5%, borne by the organiser or added to the buyer depending on events.fee_mode.';

-- === Verify =================================================================
do $$
declare
  v_src text;
begin
  if to_regprocedure('public.quote_tickets(uuid, integer)') is null then
    raise exception 'quote_tickets missing';
  end if;
  if to_regprocedure('public.set_event_fee_mode(uuid, text)') is null then
    raise exception 'set_event_fee_mode missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'events' and column_name = 'fee_mode'
  ) then
    raise exception 'events.fee_mode missing';
  end if;

  -- The cap must be gone. 200000 was the ceiling in kobo; if it is still in the
  -- body, the old capped version is what is installed.
  select prosrc into v_src from pg_proc where proname = 'purchase_tickets' limit 1;
  if position('200000' in v_src) > 0 then
    raise exception 'purchase_tickets still caps the fee - the old version is installed';
  end if;
  if position('fee_mode' in v_src) = 0 then
    raise exception 'purchase_tickets does not read fee_mode';
  end if;
end $$;
