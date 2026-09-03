-- ============================================================================
-- house_rules
--
-- The property form has collected house rules since it was written and thrown
-- them away on submit   `saveHostel` never sent them, under a comment saying
-- outright that the column did not exist. A landlord typed "Gate closes 10pm",
-- saved, reopened the listing, and it was gone.
--
-- AN ARRAY, NOT A TEXTAREA'S WORTH OF TEXT
--   Rules are read as a list by a student deciding whether they can live with
--   them, and "- Gate closes 10pm\n- No loud music" stored as one string means
--   every reader re-parses it, each slightly differently: split on newline,
--   strip a leading dash, strip a bullet, handle the line somebody typed
--   without one. One of those readers eventually renders a stray hyphen.
--
--   `text[]` makes the list the shape it already is. Rendering is a <ul>, and
--   the leading "- " a landlord types is stripped once, on the way in.
--
-- AMENITIES NEEDED NO MIGRATION
--   `hostels.amenities` is already `text[]` with no CHECK on its contents, so a
--   landlord adding "Borehole" or "Reading room" has always been storable   the
--   form simply offered six checkboxes and no way to say anything else. That is
--   a UI change alone, which is why it is not in here.
--
-- ROLLBACK
--   alter table public.hostels drop column if exists house_rules;
-- ============================================================================

alter table public.hostels
  add column if not exists house_rules text[] not null default '{}';

comment on column public.hostels.house_rules is
  'One rule per element, no bullet characters   the list markers belong to the renderer. Free text: these are the landlord''s terms, not a taxonomy we validate.';
