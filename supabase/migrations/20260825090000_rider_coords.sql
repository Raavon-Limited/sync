-- ============================================================================
-- rider_coords
--
-- The last geography column a student actually sees.
--
-- `active_delivery_positions` projects `rider_profiles.current_geo` so a student
-- can watch their delivery move. `fetchDeliveryTracking` reads it as
-- `toLatLng(row.current_geo)` — and a geography column comes back over
-- PostgREST as WKB hex, never GeoJSON, so `riderPosition` has always been null.
-- The map would simply never show a rider.
--
-- Same fix as storefronts, hostels and hotspots: lat/lng are the source of
-- truth, `geo` is derived by trigger and stays the indexed column.
--
-- WHY IT MATTERS MORE HERE THAN ELSEWHERE
--   Rider position is WRITTEN by a client — the rider's device posting its
--   location, repeatedly, while moving. Plain columns are the difference
--   between a two-number PATCH and constructing WKT on a phone with patchy
--   signal.
--
-- `updated_at` is deliberately not touched by the trigger: the view exposes
-- `last_seen_at`, which is what tells a student whether the dot is live or
-- stale, and it must reflect when the RIDER reported, not when a row changed.
--
-- ROLLBACK
--   drop trigger if exists rider_profiles_sync_geo on public.rider_profiles;
--   alter table public.rider_profiles drop column if exists lat, drop column if exists lng;
-- ============================================================================

alter table public.rider_profiles
  add column if not exists lat double precision,
  add column if not exists lng double precision;
do $chk$
begin
  if not exists (select 1 from pg_constraint where conname = 'rider_profiles_lat_range') then
    alter table public.rider_profiles
      add constraint rider_profiles_lat_range check (lat is null or lat between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rider_profiles_lng_range') then
    alter table public.rider_profiles
      add constraint rider_profiles_lng_range check (lng is null or lng between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rider_profiles_coords_both_or_neither') then
    alter table public.rider_profiles
      add constraint rider_profiles_coords_both_or_neither check ((lat is null) = (lng is null));
  end if;
end;
$chk$;
update public.rider_profiles
   set lat = extensions.ST_Y(current_geo::extensions.geometry),
       lng = extensions.ST_X(current_geo::extensions.geometry)
 where current_geo is not null and lat is null;
create or replace function public.sync_rider_geo()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if new.lat is null or new.lng is null then
    new.current_geo := null;
  else
    new.current_geo := extensions.ST_SetSRID(
                         extensions.ST_MakePoint(new.lng, new.lat), 4326
                       )::extensions.geography;
    -- A position report IS the heartbeat. Without this a student cannot tell a
    -- moving rider from a stalled one.
    new.last_seen_at := now();
  end if;
  return new;
end;
$fn$;
drop trigger if exists rider_profiles_sync_geo on public.rider_profiles;
create trigger rider_profiles_sync_geo
  before insert or update of lat, lng on public.rider_profiles
  for each row execute function public.sync_rider_geo();
-- The view must expose what clients can now read.
drop view if exists public.active_delivery_positions;
create view public.active_delivery_positions
with (security_invoker = true) as
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
where d.status in ('assigned', 'picked_up', 'delivering');
comment on view public.active_delivery_positions is
  'Rider location, visible only while a delivery is in flight. lat/lng rather than the geography column, which is unreadable over PostgREST.';
grant select on public.active_delivery_positions to authenticated;
