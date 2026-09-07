-- ============================================================================
-- room_types
--
-- `hostels.room_type` held two different facts in one column, and its CHECK
-- constraint enumerated them together:
--
--   ('Self-contain', 'Sharing', 'Female only', 'Male only')
--
-- The first two describe the BUILDING. The last two describe WHO MAY LIVE IN
-- IT, which is a house rule. A listing could therefore say it was female-only
-- and never say whether that was a self-contain or a three-bedroom flat   the
-- column had no room left to say both.
--
-- THIS IS THE DECISION app/(app)/hostels/page.tsx ASKED FOR
--   Its comment reads: "`hostels.room_type` is OCCUPANCY. This page filters by
--   LAYOUT ('self contain', 'room and parlour', 'two bedroom'). They are
--   different taxonomies, and only one value overlaps   everything the schema
--   cannot express as a layout falls to 'others' rather than being guessed at.
--   Reconciling them properly is a schema decision."
--
--   So: room_type becomes the layout taxonomy, the browse filter stops
--   translating between two vocabularies, and 'others' stops being where most
--   of the catalogue lands.
--
-- A TABLE, NOT A WIDER CHECK
--   "Every type we can add" cannot be a CHECK constraint: adding one would be a
--   migration and a deploy every time. 0007 moved `areas` out of a CHECK into a
--   table with an FK onto the unique NAME for exactly this reason, and every
--   query in the stack kept working because the column stayed text. Same shape
--   here, deliberately   including `is_active` for soft retirement, because a
--   type with hostels attached cannot be deleted (the FK forbids it, correctly)
--   but can be dropped from the picker.
--
-- THE THREE OLD VALUES ARE SEEDED, TWO OF THEM RETIRED
--   The FK cannot validate against rows it has no entry for, so all four
--   original values exist here   otherwise this migration fails on any database
--   with a single hostel in it. 'Sharing', 'Female only' and 'Male only' are
--   seeded `is_active = false`: still valid, no longer offered.
--
--   A landlord editing one of those listings finds the select empty, because
--   its current value is not in the list any more. That is the intended
--   forcing function: it asks them, once, what the building actually is.
--
-- THE GENDER RESTRICTION IS PRESERVED AS A RULE, NOT DISCARDED
--   It is real information a student needs, so it is appended to `house_rules`
--   before anything else happens. It is NOT deleted from `room_type`, because
--   the honest replacement value is unknowable from here   only the landlord
--   knows whether that female-only listing is a single room or a flat, and
--   guessing would put a wrong layout in front of students.
--
-- ROLLBACK
--   alter table public.hostels drop constraint if exists hostels_room_type_fkey;
--   alter table public.hostels add constraint hostels_room_type_check
--     check (room_type in ('Self-contain','Sharing','Female only','Male only'));
--   drop table if exists public.room_types;
--   -- The house_rules append is not reversed: it is now the only record that
--   -- those listings are gender-restricted.
-- ============================================================================

-- ── 1. The reference table ──────────────────────────────────────────────────
create table if not exists public.room_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  -- Display order in the landlord's picker and the student's filter.
  sort_order integer not null default 0,
  -- Soft retire. See the header: the FK makes deletion impossible once a
  -- hostel points at it, and that is the correct behaviour.
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. What a building can be ───────────────────────────────────────────────
insert into public.room_types (name, slug, sort_order, is_active) values
  ('Self-contain',      'self-contain',      1, true),
  ('Single room',       'single-room',       2, true),
  ('1 room 1 parlour',  '1-room-1-parlour',  3, true),
  ('2 bedroom flat',    '2-bedroom-flat',    4, true),
  ('3 bedroom flat',    '3-bedroom-flat',    5, true),
  ('Shared apartment',  'shared-apartment',  6, true),
  ('Studio',            'studio',            7, true),

  -- Retired, and seeded only so the FK below can validate existing rows.
  -- 'Sharing' is superseded by 'Shared apartment', which says the same thing
  -- about the building rather than about the arrangement.
  ('Sharing',           'sharing',          90, false),
  ('Female only',       'female-only',      98, false),
  ('Male only',         'male-only',        99, false)
on conflict (name) do nothing;

alter table public.room_types enable row level security;

-- The landlord form and the public browse filter both read this, and browse is
-- reachable signed out. No write policy on purpose: reference data, edited by
-- an admin through the service role   exactly like `areas`.
drop policy if exists "room_types_read" on public.room_types;
create policy "room_types_read" on public.room_types
  for select to anon, authenticated using (true);

-- ── 3. Keep the gender restriction, as the rule it always was ───────────────
-- BEFORE the FK swap, so a database that fails validation has still not lost
-- the fact. Depends on 20260907150000_house_rules.
update public.hostels
   set house_rules = array_append(house_rules, room_type),
       updated_at  = now()
 where room_type in ('Female only', 'Male only')
   and not (room_type = any (house_rules));

-- ── 4. The CHECK becomes an FK ──────────────────────────────────────────────
-- Every existing value is seeded above, so this cannot fail to validate on an
-- existing database   the same argument 0007 made for areas.
alter table public.hostels drop constraint if exists hostels_room_type_check;
alter table public.hostels drop constraint if exists hostels_room_type_fkey;
alter table public.hostels
  add constraint hostels_room_type_fkey
  foreign key (room_type) references public.room_types (name)
  on update cascade;

comment on column public.hostels.room_type is
  'What the building IS   a layout, not an occupancy rule and not a gender restriction. FK onto room_types.name; adding a type is an insert there, not a deploy. Who may live in it belongs in house_rules.';
