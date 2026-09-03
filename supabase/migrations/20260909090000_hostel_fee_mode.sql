-- ============================================================================
-- hostel_fee_mode
--
-- Who bears Sync's 2.5% on rent, and where the student is told about it.
--
-- 20260902090000_money_model set the rate and the direction: 2.5% of the rent,
-- uncapped, deducted from the LANDLORD when the rent releases. That is one of
-- two defensible answers, and the listing page told the student neither of
-- them   it printed a "Mandatory Inspection Fee" and an invented "Original
-- Breakdown Overhead Fee" instead, so the only two numbers a student saw added
-- to the rent were both fictional and Sync's actual charge appeared nowhere.
--
-- THE LANDLORD DECIDES, THE SAME WAY AN ORGANISER DOES
--   'absorb'   the student pays the listed rent; the 2.5% comes out of the
--              landlord's takings. 300,000 listed, 300,000 paid, landlord nets
--              292,500.
--   'pass_on'  the 2.5% is added to the student's total; the landlord keeps the
--              listed rent. 300,000 listed, 307,500 paid, landlord nets
--              300,000.
--
--   Deliberately the same column name, the same two values and the same default
--   as `events.fee_mode` (20260903230000). A landlord who also runs events meets
--   one concept, and the two screens can say the same sentence.
--
-- THE DEFAULT IS 'absorb'
--   It is the mode that cannot surprise a student. Rent is the largest single
--   payment a student makes here, and a listing that advertises 300,000 and
--   asks for 307,500 at the last step is the complaint that follows.
--
-- THE COMMISSION IS ALWAYS 2.5% OF THE RENT, NEVER OF THE TOTAL
--   apply_escrow_settings computed `rent_charge(amount_kobo)`, which is right
--   under 'absorb' (amount IS the rent) and subtly wrong under 'pass_on', where
--   amount is rent + fee: charging 2.5% of the grossed-up total takes 2.5% of
--   Sync's own fee as well and leaves the landlord ~0.06% short of the rent
--   they were promised. It now derives the charge from the RENT   the booking's
--   snapshotted price, else the hostel's current one   so both modes settle
--   exactly.
--
-- ROLLBACK
--   alter table public.hostels drop column if exists fee_mode;
--   drop function if exists public.quote_rent(uuid);
--   drop function if exists public.set_hostel_fee_mode(uuid, text);
--   -- and restore apply_escrow_settings from 20260906180000.
-- ============================================================================

alter table public.hostels
  add column if not exists fee_mode text not null default 'absorb'
    check (fee_mode in ('absorb', 'pass_on'));

comment on column public.hostels.fee_mode is
  'Who bears Sync 2.5% on rent. absorb = the landlord, out of the released rent. pass_on = the student, added to the total. Default absorb, because it cannot surprise a student.';

-- `guard_hostel_privileged_cols` reverts client writes to `verified`. fee_mode
-- is NOT privileged   it is the landlord's own commercial choice, and they set
-- it by saving the listing form, under the same ownership check RLS already
-- applies to the row.

-- === Quoting ================================================================
-- What renting this room costs, itemised, BEFORE anybody pays. Callers must not
-- do this arithmetic themselves: the listing page, the booking summary and the
-- payment step have to agree to the kobo, and one function is how they do.
create or replace function public.quote_rent(p_hostel uuid)
returns table (
  rent_kobo  bigint,
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
  v_h   public.hostels%rowtype;
  v_fee bigint;
begin
  select * into v_h from public.hostels where id = p_hostel;
  if not found then
    raise exception 'no such hostel' using errcode = 'P0002';
  end if;

  -- Same helper the escrow trigger uses, so the number on the listing is the
  -- number that gets frozen onto the hold.
  v_fee := private.rent_charge(v_h.price_per_session_kobo::bigint);

  return query select
    v_h.price_per_session_kobo::bigint,
    v_fee,
    case when v_h.fee_mode = 'pass_on'
         then v_h.price_per_session_kobo::bigint + v_fee
         else v_h.price_per_session_kobo::bigint end,
    v_h.fee_mode;
end;
$fn$;

revoke all on function public.quote_rent(uuid) from public;
-- anon too: /hostels is public, and a price a visitor cannot see is a price
-- they have to sign up to find out.
grant execute on function public.quote_rent(uuid) to anon, authenticated, service_role;

comment on function public.quote_rent is
  'What a session of this room costs a student, itemised: rent, Sync 2.5%, and the total they actually pay under the landlord fee_mode.';

-- === The landlord sets it ===================================================
create or replace function public.set_hostel_fee_mode(p_hostel uuid, p_mode text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_owner uuid;
begin
  if p_mode not in ('absorb', 'pass_on') then
    raise exception 'Unknown fee mode: %', p_mode using errcode = '22023';
  end if;

  select landlord_id into v_owner from public.hostels where id = p_hostel;
  if v_owner is null then
    raise exception 'no such hostel' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() and not public.is_staff() then
    raise exception 'That listing is not yours' using errcode = '42501';
  end if;

  update public.hostels set fee_mode = p_mode where id = p_hostel;
  return p_mode;
end;
$fn$;

revoke all on function public.set_hostel_fee_mode(uuid, text) from public, anon;
grant execute on function public.set_hostel_fee_mode(uuid, text) to authenticated, service_role;

-- === What a rent hold costs its payee =======================================
-- Fourth revision. Identical to 20260906180000 apart from the booking branch of
-- the commission   see the header.
create or replace function public.apply_escrow_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hours integer;
  v_rent  bigint;
begin
  -- Frozen at creation, deducted at release. An explicit value survives   a
  -- negotiated rate or a correction must not be overwritten.
  if new.commission_kobo is null or new.commission_kobo = 0 then
    if new.booking_id is not null then
      -- 2.5% OF THE RENT, not of what was charged. Under 'pass_on' the two are
      -- different numbers and only the first one settles exactly. The booking's
      -- own snapshot wins, because a landlord raising their price must not
      -- reprice a booking already made.
      select coalesce(b.price_per_session_kobo, h.price_per_session_kobo)::bigint
        into v_rent
        from public.bookings b
        join public.hostels h on h.id = b.hostel_id
       where b.id = new.booking_id;
      new.commission_kobo := private.rent_charge(coalesce(v_rent, new.amount_kobo));
    else
      new.commission_kobo := case
        -- Sync takes no cut of an agent's inspection fee. Explicit rather than
        -- falling through to the 5%, so the rule is visible where it applies.
        when new.inspection_id is not null then 0
        when new.delivery_id is not null then
          private.capped_charge(new.amount_kobo, 'rider_charge_pct',
                                'rider_charge_cap_kobo', 5, 200000)
        else
          private.capped_charge(new.amount_kobo, 'service_charge_pct',
                                'service_charge_cap_kobo', 5, 200000)
      end;
    end if;
  end if;

  if new.release_after is null then
    if new.inspection_id is not null then
      -- Left null on purpose: the clock starts when the agent files their
      -- report (file_inspection_report), not when the student pays. A null is
      -- never swept by release_matured_escrow, so the money waits for the
      -- visit rather than maturing on a visit that may not have happened.
      new.release_after := null;
    elsif new.booking_id is not null then
      -- Rent settles a week after move-in, not a day after payment: the student
      -- has to actually get the room. `move_in` is a date, so this is set from
      -- the booking rather than from now().
      select coalesce(b.move_in::timestamptz, now()) + interval '7 days'
        into new.release_after
        from public.bookings b where b.id = new.booking_id;
      new.release_after := coalesce(new.release_after, now() + interval '7 days');
    else
      v_hours := private.setting_int('escrow_hold_hours', 24);
      new.release_after := now() + make_interval(hours => v_hours);
    end if;
  end if;

  return new;
end;
$fn$;

comment on function public.apply_escrow_settings is
  'Freezes the platform charge and the maturity window onto a new hold. 5% capped on goods and delivery, 2.5% of the RENT (not the total) on a booking, nothing on an inspection.';

-- === Verify =================================================================
do $$
declare
  v_src text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'hostels' and column_name = 'fee_mode'
  ) then
    raise exception 'hostels.fee_mode missing';
  end if;
  if to_regprocedure('public.quote_rent(uuid)') is null then
    raise exception 'quote_rent missing';
  end if;
  if to_regprocedure('public.set_hostel_fee_mode(uuid, text)') is null then
    raise exception 'set_hostel_fee_mode missing';
  end if;

  select prosrc into v_src from pg_proc where proname = 'apply_escrow_settings' limit 1;
  if position('price_per_session_kobo' in v_src) = 0 then
    raise exception 'apply_escrow_settings still charges rent commission on the total - the old version is installed';
  end if;
end $$;
