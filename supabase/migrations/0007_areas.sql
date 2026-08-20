-- ============================================================================
-- AREAS - the coarse location filter, moved out of application code.
-- ============================================================================
-- The five Malete areas used to live in TWO places that had to agree by hand:
-- the MALETE_AREAS const in src/lib/constants/areas.ts, and a CHECK constraint
-- on hostels.area repeating the same string literals. Adding an area meant a
-- code change plus a migration plus a deploy, and correcting a coordinate meant
-- a deploy - which is how the whole set stayed ~3.5km west of Malete (the
-- campus marker rendered in an empty field) until it was caught by eye.
--
-- NOTE ON THE JOIN KEY: hostels.area stays `text` and the FK points at
-- areas.name rather than swapping in a uuid. hostels.area is text throughout
-- the stack - the hostels_near RPC returns it as text, the app filters with
-- .eq('area', name) - so an FK onto a unique text column makes the list dynamic
-- without rewriting a single query. `on update cascade` means renaming an area
-- rewrites every hostel pointing at it, atomically.

create table if not exists public.areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  -- Display order in the location picker. Was the array order of the const.
  sort_order  integer not null default 0,
  -- Soft retire. An area with hostels attached can't be deleted (the FK forbids
  -- it, correctly), but it can be dropped from the picker.
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists areas_active_order_idx
  on public.areas (is_active, sort_order);

-- Seed. These coordinates are the corrected set: the campus anchor was geocoded
-- against OSM ("Kwara State University, Malete Road, Moro, Kwara") and the five
-- areas were shifted by that same correction. Their positions relative to one
-- another are still estimates - fix them here, with an UPDATE, no deploy.
insert into public.areas (name, slug, lat, lng, sort_order) values
  ('KWASU Gate',  'kwasu-gate',  8.7180, 4.4799, 1),
  ('Safari',      'safari',      8.7156, 4.4783, 2),
  ('Malete Town', 'malete-town', 8.7123, 4.4773, 3),
  ('Amao',        'amao',        8.7146, 4.4719, 4),
  ('Nifeskwasu',  'nifeskwasu',  8.7214, 4.4757, 5)
on conflict (name) do nothing;

-- Replace the CHECK with the FK. Every existing hostels row already satisfies
-- this: the CHECK permitted exactly the five names seeded above, so the FK
-- cannot fail to validate on an existing database.
alter table public.hostels drop constraint if exists hostels_area_check;

alter table public.hostels drop constraint if exists hostels_area_fkey;
alter table public.hostels
  add constraint hostels_area_fkey
  foreign key (area) references public.areas (name)
  on update cascade;

-- RLS: the location picker is public (signed-out users browse /around), so
-- reads are open. There is deliberately NO write policy - areas are reference
-- data, edited by an admin through the service role, exactly like the other
-- admin-managed rows in this schema.
alter table public.areas enable row level security;

drop policy if exists "areas_select_active" on public.areas;
create policy "areas_select_active" on public.areas
  for select using (is_active);
