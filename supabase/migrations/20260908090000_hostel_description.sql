-- ============================================================================
-- hostel_description
--
-- The third field the property form has collected and thrown away.
--
--   photos       fixed by persisting hostel_images
--   house_rules  fixed by 20260907150000
--   description  this
--
-- All three had the same shape of failure: the input existed, the landlord
-- filled it in, `saveHostel` had nowhere to put it and did not say so. The
-- description is the one a student reads to decide whether to book a viewing,
-- and it was the emptiest kind of broken   a textarea with a character counter
-- ticking up to 500 and nothing behind it.
--
-- 2000 AND NOT 500
--   The form caps at 500 characters, and that is a UI choice about how much
--   anybody wants to read on a card. The column is wider so tightening or
--   loosening the form is not a migration; the check is a sanity bound against
--   somebody posting a novel through the API, not a restatement of the form.
--
-- ROLLBACK
--   alter table public.hostels drop column if exists description;
-- ============================================================================

alter table public.hostels
  add column if not exists description text
    check (description is null or length(description) <= 2000);

comment on column public.hostels.description is
  'The landlord''s own words about the place. Free text: the form caps it shorter than this column does, deliberately.';
