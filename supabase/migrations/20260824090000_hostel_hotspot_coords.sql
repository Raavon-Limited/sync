-- ============================================================================
-- hostel_hotspot_coords
--
-- Applies the fix from 20260822100000_storefront_coords to the two remaining
-- student-facing map tables.
--
-- THE BUG, RESTATED
--   `geo extensions.geography(Point, 4326)` is the right storage type and the
--   wrong API surface. Over PostgREST it reads back as WKB hex
--   ("0101000020E6100000…"), never GeoJSON   so every reader written as
--   `geo?.coordinates` silently resolves to null. It does not throw; the pin
--   just never appears.
--
--   Four modules carry that reader: food, hostels (via around), hotspots and
--   storefronts. Storefronts was fixed when it was built. This covers hostels
--   and hotspots, which are the two a student sees on a map.
--
--   `vendor_profiles.geo` is deliberately NOT fixed: storefronts superseded it.
--   Vendor location belongs to a BRANCH now, and adding coordinates back to the
--   brand would re-create the ambiguity the storefronts migration removed.
--
-- WHY IT MATTERS NOW RATHER THAN LATER
--   No row in either table currently carries a pin, so nothing is visibly
--   broken. That is exactly why it is worth fixing now   the first vendor to
--   drop a pin would file a bug about a map that renders nothing, and the cause
--   is three layers away from the symptom.
--
-- ROLLBACK
--   drop trigger if exists hostels_sync_geo  on public.hostels;
--   drop trigger if exists hotspots_sync_geo on public.hotspots;
--   drop function if exists public.sync_geo_from_latlng();
--   alter table public.hostels  drop column if exists lat, drop column if exists lng;
--   alter table public.hotspots drop column if exists lat, drop column if exists lng;
-- ============================================================================

alter table public.hostels
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.hotspots
  add column if not exists lat double precision,
  add column if not exists lng double precision;

do $chk$
declare
  t text;
begin
  foreach t in array array['hostels', 'hotspots'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_lat_range') then
      execute format(
        'alter table public.%I add constraint %I check (lat is null or lat between -90 and 90)',
        t, t || '_lat_range');
    end if;
    if not exists (select 1 from pg_constraint where conname = t || '_lng_range') then
      execute format(
        'alter table public.%I add constraint %I check (lng is null or lng between -180 and 180)',
        t, t || '_lng_range');
    end if;
    -- A half-set pin is not a pin: (0, lng) puts the place in the Atlantic.
    if not exists (select 1 from pg_constraint where conname = t || '_coords_both_or_neither') then
      execute format(
        'alter table public.%I add constraint %I check ((lat is null) = (lng is null))',
        t, t || '_coords_both_or_neither');
    end if;
  end loop;
end;
$chk$;

-- Backfill from any geo that already exists (none today, correct anyway).
update public.hostels
   set lat = extensions.ST_Y(geo::extensions.geometry),
       lng = extensions.ST_X(geo::extensions.geometry)
 where geo is not null and lat is null;

update public.hotspots
   set lat = extensions.ST_Y(geo::extensions.geometry),
       lng = extensions.ST_X(geo::extensions.geometry)
 where geo is not null and lat is null;

-- One trigger function, reused. `geo` stays the indexed column that spatial
-- searches use; it is now maintained rather than supplied.
create or replace function public.sync_geo_from_latlng()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if new.lat is null or new.lng is null then
    new.geo := null;
  else
    new.geo := extensions.ST_SetSRID(
                 extensions.ST_MakePoint(new.lng, new.lat), 4326
               )::extensions.geography;
  end if;
  return new;
end;
$fn$;

drop trigger if exists hostels_sync_geo on public.hostels;
create trigger hostels_sync_geo
  before insert or update of lat, lng on public.hostels
  for each row execute function public.sync_geo_from_latlng();

drop trigger if exists hotspots_sync_geo on public.hotspots;
create trigger hotspots_sync_geo
  before insert or update of lat, lng on public.hotspots
  for each row execute function public.sync_geo_from_latlng();
