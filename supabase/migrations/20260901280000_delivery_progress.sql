-- ============================================================================
-- delivery_progress
--
-- 20260901270000 gave riders a way to SEE work and TAKE it. This is the rest of
-- the job: moving one through pickup to delivered, and deciding who is allowed
-- to be on the board at all.
--
-- WHY A FUNCTION WHEN RLS ALREADY LETS A RIDER UPDATE THEIR OWN DELIVERY
--   `deliveries_update_rider` permits the write and `guard_delivery_cols`
--   protects the fee and the confirmation hash, but neither knows anything about
--   ORDER. A rider could PATCH status straight to 'delivered' from 'assigned',
--   skipping pickup entirely, and the row would be accepted: a delivery that was
--   never collected, recorded as completed, with picked_up_at null and nobody
--   looking at that column. The legal moves belong in one place that both the
--   app and any future dispatcher have to go through.
--
-- WHY GOING ONLINE IS A FUNCTION TOO
--   `is_online` is deliberately NOT frozen by guard_rider_profile_cols - a rider
--   toggles it constantly and it is not a privileged fact. But the dispatch
--   index is `where is_online and verification_status = 'verified'`, so an
--   unverified or suspended rider who flips the column sits in the index
--   advertising for work that claim_delivery will then refuse. Refusing at the
--   toggle says so once, instead of once per job they try to take.
--
-- ROLLBACK
--   drop function if exists public.advance_delivery(uuid, text);
--   drop function if exists public.set_rider_online(boolean);
--   drop function if exists public.my_active_delivery();
-- ============================================================================

-- ── 1. The state machine ────────────────────────────────────────────────────
-- assigned → picked_up → delivering → delivered, plus failure from anywhere
-- in flight. Nothing moves backwards: a delivery that was collected cannot
-- become uncollected, and the timestamps below are written once each.
create or replace function public.advance_delivery(
  p_delivery_id uuid,
  p_status      text
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_old text;
  v_ok  boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select status into v_old
    from public.deliveries
   where id = p_delivery_id and rider_id = v_uid
     for update;

  if not found then
    -- Not "no such delivery": a rider asking about somebody else's job gets the
    -- same answer as one asking about a job that does not exist.
    raise exception 'That delivery is not yours' using errcode = '42501';
  end if;

  v_ok := case p_status
            when 'picked_up'  then v_old = 'assigned'
            when 'delivering' then v_old = 'picked_up'
            when 'delivered'  then v_old in ('picked_up', 'delivering')
            -- A job can fail at any point while it is in flight. It cannot fail
            -- after it was delivered.
            when 'failed'     then v_old in ('assigned', 'picked_up', 'delivering')
            else false
          end;

  if not v_ok then
    raise exception 'A delivery cannot go from % to %', v_old, p_status
      using errcode = '22023';
  end if;

  update public.deliveries
     set status       = p_status,
         picked_up_at = case when p_status = 'picked_up' then now() else picked_up_at end,
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
         updated_at   = now()
   where id = p_delivery_id;

  return p_status;
end;
$fn$;

revoke all on function public.advance_delivery(uuid, text) from public, anon;
grant execute on function public.advance_delivery(uuid, text) to authenticated, service_role;

comment on function public.advance_delivery is
  'Move one of your own deliveries to its next state. Enforces the order - a delivery cannot be delivered without having been picked up.';

-- ── 2. Going on and off the board ───────────────────────────────────────────
create or replace function public.set_rider_online(p_online boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_rp  public.rider_profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_rp from public.rider_profiles where id = v_uid for update;
  if not found then
    raise exception 'Only a rider can go online' using errcode = '42501';
  end if;

  -- Going OFF is always allowed. A rider who has just been suspended mid-shift
  -- must still be able to stop, and refusing here would leave them stuck in the
  -- dispatch index by the very check meant to keep them out of it.
  if p_online then
    if v_rp.verification_status <> 'verified' or v_rp.archived_at is not null then
      raise exception 'Your rider account is not verified yet' using errcode = '42501';
    end if;
    if public.is_suspended(v_uid) then
      raise exception 'Your account is suspended. Contact support@letsyncyou.com.'
        using errcode = '42501';
    end if;
  end if;

  update public.rider_profiles
     set is_online    = p_online,
         last_seen_at = case when p_online then now() else last_seen_at end,
         updated_at   = now()
   where id = v_uid;

  return p_online;
end;
$fn$;

revoke all on function public.set_rider_online(boolean) from public, anon;
grant execute on function public.set_rider_online(boolean) to authenticated, service_role;

comment on function public.set_rider_online is
  'Put yourself on or off the dispatch board. Going online requires a verified, unsuspended rider account; going offline is always allowed.';

-- ── 3. The job in your hand ─────────────────────────────────────────────────
-- The full row for a delivery the rider has actually claimed, dropoff address
-- included - which open_delivery_board deliberately withholds until this point.
create or replace function public.my_active_delivery()
returns table (
  delivery_id     uuid,
  order_id        uuid,
  status          text,
  vendor_name     text,
  vendor_phone    text,
  pickup_address  text,
  dropoff_address text,
  customer_name   text,
  customer_phone  text,
  distance_meters integer,
  fee_kobo        bigint,
  assigned_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
    select d.id,
           d.order_id,
           d.status,
           v.business_name,
           v.public_phone,
           d.pickup_address,
           -- Released only now. The rider is carrying this person's food; the
           -- board they picked it off never showed them where they live.
           d.dropoff_address,
           p.full_name,
           p.phone,
           d.distance_meters,
           d.fee_kobo,
           d.assigned_at
      from public.deliveries d
      join public.orders o          on o.id = d.order_id
      join public.vendor_profiles v on v.id = o.vendor_id
      left join public.profiles p   on p.id = o.student_id
     where d.rider_id = v_uid
       and d.status in ('assigned', 'picked_up', 'delivering')
     order by d.assigned_at
     limit 5;
end;
$fn$;

revoke all on function public.my_active_delivery() from public, anon;
grant execute on function public.my_active_delivery() to authenticated, service_role;

comment on function public.my_active_delivery is
  'Deliveries this rider is currently carrying, with the contact and dropoff details the open board withholds until a job is claimed.';
