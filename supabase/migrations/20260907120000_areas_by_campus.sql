-- ============================================================================
-- areas_by_campus
--
-- `areas` is campus-blind. Every row is a Malete area because Malete is the
-- only campus, and the location picker shows all of them to everybody. The
-- second school breaks that on day one: a landlord in Ilorin would be offered
-- "KWASU Gate", and a student at KWASU would be offered areas 40km away.
--
-- WHAT THIS IS NOT
--   It is not a rewrite of the join key. `hostels.area` stays TEXT with an FK
--   onto `areas.name` (0007 explains why at length: every query in the stack
--   filters `.eq('area', name)`, and `on update cascade` makes a rename
--   atomic). Adding a campus dimension does not need any of that touched   the
--   scope lives on the AREA, and callers filter by it.
--
--   `areas.name` therefore stays globally unique. Two schools with an area
--   genuinely called the same thing would need a disambiguated name ("Gate
--   (KWASU)"), which is a naming problem rather than a schema one, and is
--   preferable to widening the key that eight queries depend on.
--
-- NULL campus_id MEANS "EVERYWHERE"
--   Not "unassigned". A few areas are genuinely national   nothing uses that
--   today, and it is the honest reading of a null on a scope column. It also
--   means this migration is safe on a database mid-backfill: an area nobody has
--   assigned yet keeps showing up rather than vanishing from the picker.
--
-- ADDING A SCHOOL IS TWO INSERTS AND NO DEPLOY, WHICH WAS 0007'S WHOLE POINT
--   insert into public.campuses (code, name, state) values ('UNILORIN', ...);
--   insert into public.areas (name, slug, lat, lng, sort_order, campus_id)
--   values ('Tanke', 'tanke', <lat>, <lng>, 1,
--           (select id from public.campuses where code = 'UNILORIN'));
--
--   THE COORDINATES ARE THE PART THAT NEEDS CARE. 0007's own header records
--   that the original five areas sat ~3.5km west of Malete until somebody
--   noticed by eye, because they were typed from memory. A wrong pin here does
--   not look wrong   it silently ranks hostels against the wrong centre. Take
--   them from a map, not from recollection.
--
-- ROLLBACK
--   drop index if exists public.areas_campus_idx;
--   alter table public.areas drop column if exists campus_id;
-- ============================================================================

alter table public.areas
  add column if not exists campus_id uuid references public.campuses (id) on delete set null;

-- Everything currently in the table is Malete, because KWASU is the only
-- campus that exists. Stated as a backfill rather than a default so a future
-- insert has to say which school it belongs to.
update public.areas
   set campus_id = (select id from public.campuses where code = 'KWASU')
 where campus_id is null;

create index if not exists areas_campus_idx
  on public.areas (campus_id, sort_order)
  where is_active;

comment on column public.areas.campus_id is
  'Which school this area serves. NULL means every campus. Adding a school is an insert here, not a deploy   see the migration header, and take the coordinates from a map.';
