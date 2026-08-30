-- ============================================================================
-- storefront_coords
--
-- Makes lat/lng the source of truth for a branch's pin, with `geo` derived.
--
-- WHAT WAS WRONG
--   `geo extensions.geography(Point, 4326)` is the right storage type and the
--   wrong API surface. Over PostgREST it is write-only in practice:
--     * writing GeoJSON  -> "parse error - invalid geometry" (rejected)
--     * writing WKT      -> accepted
--     * READING it back  -> "0101000020E6100000..." (WKB hex, not GeoJSON)
--   So any client that writes the natural JSON shape fails, and any client that
--   reads expecting `geo.coordinates` silently gets null forever. The second
--   half is the dangerous one — it does not throw, it just never renders a pin.
--
--   `src/modules/food/queries.ts` has exactly that reader (`geo?.coordinates`),
--   which is why vendor coordinates have never resolved anywhere in the app.
--   No rows carry a pin today, so this is corrected before it ever mattered.
--
-- WHY A TRIGGER AND NOT A GENERATED COLUMN
--   `geo` could be a GENERATED column over lat/lng, which is tidier. It depends
--   on every function in the expression being marked IMMUTABLE, which is a
--   property of the installed PostGIS build rather than something this
--   migration can guarantee. A trigger has no such dependency and produces the
--   same result, so it is the safer choice for a migration that must apply
--   first time against a live database.
--
-- `areas` already stores plain lat/lng. This makes storefronts consistent with
-- it rather than inventing a second convention.
--
-- ROLLBACK
--   drop trigger if exists storefronts_sync_geo on public.storefronts;
--   drop function if exists public.storefronts_sync_geo();
--   alter table public.storefronts drop column if exists lat, drop column if exists lng;
-- ============================================================================

-- 1. The columns clients actually read and write ------------------------------
alter table public.storefronts
  add column if not exists lat double precision,
  add column if not exists lng double precision;

do $chk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'storefronts_lat_range'
  ) then
    alter table public.storefronts
      add constraint storefronts_lat_range check (lat is null or lat between -90 and 90);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'storefronts_lng_range'
  ) then
    alter table public.storefronts
      add constraint storefronts_lng_range check (lng is null or lng between -180 and 180);
  end if;
  -- A half-set pin is not a pin. Rendering one at (0, lng) puts the branch in
  -- the Atlantic; rejecting it keeps the bad state out of the table.
  if not exists (
    select 1 from pg_constraint where conname = 'storefronts_coords_both_or_neither'
  ) then
    alter table public.storefronts
      add constraint storefronts_coords_both_or_neither
      check ((lat is null) = (lng is null));
  end if;
end;
$chk$;

-- 2. Backfill from any geo that already exists --------------------------------
update public.storefronts
   set lat = extensions.ST_Y(geo::extensions.geometry),
       lng = extensions.ST_X(geo::extensions.geometry)
 where geo is not null and lat is null;

-- 3. Keep geo in step ---------------------------------------------------------
-- geo remains the indexed column that nearby_storefronts searches; it is now
-- maintained rather than supplied.
create or replace function public.storefronts_sync_geo()
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

drop trigger if exists storefronts_sync_geo on public.storefronts;
create trigger storefronts_sync_geo
  before insert or update of lat, lng on public.storefronts
  for each row execute function public.storefronts_sync_geo();

-- Re-derive for the rows backfilled above.
update public.storefronts set lat = lat where lat is not null;

-- 4. Return the pin from discovery -------------------------------------------
-- The student map needs to place a marker, which means lat/lng must come back
-- with the row rather than requiring a second read of an unreadable column.
--
-- DROP FIRST, AND WHY
--   `create or replace function` cannot change a function's return type, and
--   adding lat/lng to RETURNS TABLE changes the OUT-parameter row type:
--     ERROR: cannot change return type of existing function (42P13)
--   Replacing a RETURNS TABLE signature therefore always means dropping it.
--   Safe here because nothing depends on it — no view, no generated column, no
--   other function calls it. If that ever changes, the dependants must be
--   dropped and recreated in the same transaction.
drop function if exists public.nearby_storefronts(
  double precision, double precision, double precision, text, integer
);

create function public.nearby_storefronts(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m double precision default null,
  p_category text            default null,
  p_limit    integer         default 50
)
returns table (
  id                  uuid,
  vendor_id           uuid,
  name                text,
  slug                text,
  area                text,
  address             text,
  lat                 double precision,
  lng                 double precision,
  opens_at            time,
  closes_at           time,
  is_accepting_orders boolean,
  is_primary          boolean,
  business_name       text,
  logo_url            text,
  category            text,
  rating_avg          numeric,
  rating_count        integer,
  distance_m          double precision
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with origin as (
    select extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography as g
  )
  select
    s.id, s.vendor_id, s.name, s.slug, s.area, s.address, s.lat, s.lng,
    s.opens_at, s.closes_at, s.is_accepting_orders, s.is_primary,
    vp.business_name, vp.logo_url, vp.category, vp.rating_avg, vp.rating_count,
    case when s.geo is null then null
         else extensions.ST_Distance(s.geo, o.g)
    end as distance_m
  from public.storefronts s
  join public.vendor_profiles vp on vp.id = s.vendor_id
  cross join origin o
  where s.archived_at  is null
    and vp.archived_at is null
    and (p_category is null or vp.category = p_category)
    and (
      p_radius_m is null
      or s.geo is null
      or extensions.ST_DWithin(s.geo, o.g, p_radius_m)
    )
  order by
    -- Unpinned branches last, then nearest first.
    (s.geo is null),
    case when s.geo is null then null else extensions.ST_Distance(s.geo, o.g) end asc,
    vp.rating_avg desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$fn$;

grant execute on function
  public.nearby_storefronts(double precision, double precision, double precision, text, integer)
  to anon, authenticated, service_role;
