-- ============================================================================
-- fix_delivery_positions_view
--
-- WHAT WAS BROKEN
--   public.active_delivery_positions returned ZERO rows for the student whose
--   delivery it describes. No error   the join simply produced nothing.
--
-- WHY
--   The view is `security_invoker = true`, so it runs as the CALLER, and it
--   joins public.rider_profiles. That table's policy is:
--       rider_profiles_own  using (auth.uid() = id)
--   A student is not the rider, so they read zero rider rows, so the join is
--   empty. The view exists precisely so a student can watch their rider move,
--   and invoker rights are the one setting under which it cannot.
--
--   The original comment states the goal exactly: "Rider location, visible only
--   while a delivery is in flight. Never expose rider_profiles.current_geo
--   directly." Correct intent; the mechanism contradicted it.
--
--   Identical in shape to the wallet_transactions bug fixed in
--   20260823090000   an invoker view over a table the caller cannot read.
--
-- THE FIX
--   Owner's rights, with the authorisation restated INSIDE the view: you may
--   see a rider's position only if you are the student on that order, or the
--   rider yourself. Same discipline as every SECURITY DEFINER function here  
--   when RLS is off, spell the rule out.
--
-- WHAT THIS DOES NOT WIDEN
--   Only lat/lng and last_seen_at are projected, only while the delivery is in
--   flight, and only to the two parties. A rider idling between jobs remains
--   invisible, and no other rider_profiles column is reachable.
--
-- ROLLBACK
--   Restore the definition from 20260825090000_rider_coords.sql (note that it
--   is the broken version).
-- ============================================================================

drop view if exists public.active_delivery_positions;

create view public.active_delivery_positions
with (security_invoker = false) as
select
  d.id          as delivery_id,
  d.order_id,
  d.rider_id,
  d.status,
  rp.lat,
  rp.lng,
  rp.last_seen_at
from public.deliveries d
join public.rider_profiles rp on rp.id = d.rider_id
join public.orders o          on o.id = d.order_id
where d.status in ('assigned', 'picked_up', 'delivering')
  and (select auth.uid()) is not null
  -- The two parties to this delivery, and nobody else. The vendor is
  -- deliberately excluded: they need the order status, not the rider's
  -- live position.
  and ((select auth.uid()) = o.student_id or (select auth.uid()) = d.rider_id);

comment on view public.active_delivery_positions is
  'Rider location while a delivery is in flight, visible to the student on the order and the rider only. Owner rights plus an explicit auth.uid() predicate: rider_profiles is own-row-only, so an invoker view returns nothing to the student it exists for.';

grant select on public.active_delivery_positions to authenticated;
