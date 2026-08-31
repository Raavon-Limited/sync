-- ============================================================================
-- escrow_commission_and_maturity
--
-- `app_settings` has seeded `commission_pct = 10` and `escrow_hold_hours = 24`
-- since the conventions migration. NOTHING READS EITHER.
--
-- The consequence is quiet and expensive: `escrow_holds.commission_kobo`
-- defaults to 0 and no code path sets it, so every release pays the vendor the
-- full order value and the platform earns nothing on orders. The dispute
-- resolver already honours commission correctly — there has simply never been
-- any to honour.
--
-- WHY A TRIGGER RATHER THAN EDITING checkout_cart
--   Escrow holds are created in more than one place (checkout today, bookings
--   and service requests later) and `checkout_cart` has already been restated
--   twice in this schema's history. A BEFORE INSERT trigger applies the rate
--   everywhere, including paths not written yet, and cannot be forgotten by the
--   next person adding one.
--
-- COMMISSION IS FROZEN AT CREATION, NOT LOOKED UP AT RELEASE
--   The rate is read when the hold is made and stored on the row. Changing
--   `commission_pct` tomorrow must not retroactively change what a vendor is
--   owed for an order they already delivered.
--
-- ROLLBACK
--   drop trigger if exists escrow_holds_apply_settings on public.escrow_holds;
--   drop function if exists public.apply_escrow_settings();
--   drop function if exists private.setting_int(text, integer);
-- ============================================================================

-- 1. Read a numeric setting, with a fallback ----------------------------------
-- Returns the default when the key is missing or not a number, so a typo in
-- app_settings degrades to sane behaviour instead of breaking checkout.
create or replace function private.setting_int(p_key text, p_default integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v jsonb;
begin
  select value into v from public.app_settings where key = p_key;
  if v is null then
    return p_default;
  end if;
  if jsonb_typeof(v) = 'number' then
    return (v #>> '{}')::integer;
  end if;
  return p_default;
exception
  when others then
    return p_default;
end;
$fn$;
grant execute on function private.setting_int(text, integer) to service_role;
-- 2. Apply the settings to every hold at creation ------------------------------
create or replace function public.apply_escrow_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pct   integer;
  v_hours integer;
begin
  -- Only fill what the caller left unset. An explicit commission (a negotiated
  -- rate, a promotion, a correction) must survive.
  if new.commission_kobo is null or new.commission_kobo = 0 then
    v_pct := private.setting_int('commission_pct', 10);
    -- Integer division floors, which rounds in the vendor's favour. On a
    -- ₦3,500 order at 10% that is a difference of a few kobo, and favouring the
    -- person who did the work is the right direction to be wrong in.
    new.commission_kobo := (new.amount_kobo * v_pct) / 100;
  end if;

  if new.release_after is null then
    v_hours := private.setting_int('escrow_hold_hours', 24);
    new.release_after := now() + make_interval(hours => v_hours);
  end if;

  return new;
end;
$fn$;
drop trigger if exists escrow_holds_apply_settings on public.escrow_holds;
create trigger escrow_holds_apply_settings
  before insert on public.escrow_holds
  for each row execute function public.apply_escrow_settings();
-- 3. Release matured holds ------------------------------------------------------
-- The student UI promises escrow "releases automatically once the hold
-- matures". Nothing kept that promise: release_order_escrow existed and only
-- ever ran when a student tapped confirm. This is what a cron calls.
--
-- Service role only. The function it calls already refuses to release anything
-- that has not matured, so this cannot pay out early even if called early.
create or replace function public.release_matured_escrow(p_limit integer default 200)
returns table (order_id uuid, transaction_id uuid)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r record;
  v_txn uuid;
begin
  for r in
    select h.order_id
      from public.escrow_holds h
     where h.status = 'held'
       and h.order_id is not null
       and h.release_after is not null
       and h.release_after <= now()
     order by h.release_after
     limit greatest(1, least(coalesce(p_limit, 200), 1000))
  loop
    begin
      v_txn := public.release_order_escrow(r.order_id);
      order_id := r.order_id;
      transaction_id := v_txn;
      return next;
    exception
      -- One bad hold must not stop the batch. The next run retries it, and
      -- release_order_escrow is idempotent so a retry is free.
      when others then
        raise warning 'escrow release failed for order %: %', r.order_id, sqlerrm;
    end;
  end loop;
  return;
end;
$fn$;
revoke all on function public.release_matured_escrow(integer) from public, anon, authenticated;
grant execute on function public.release_matured_escrow(integer) to service_role;
comment on function public.release_matured_escrow is
  'Releases every matured hold. Service role only, called by the escrow cron. Safe to re-run: each release is idempotent.';
