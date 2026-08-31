-- ============================================================================
-- store_image
--
-- A photo of the actual place.
--
-- WHY A STORE NEEDS ITS OWN, WHEN THE BUSINESS ALREADY HAS A LOGO
--   The logo is the brand: one mark, the same at every location. The store
--   photo is the shopfront a student is trying to find on a street — and the
--   whole reason multi-store exists is that those places are different from
--   each other. A vendor with three branches showing one logo three times has
--   told a student nothing about which door to walk through.
--
--   It also fills the gap in discovery. `nearby_storefronts` returns the
--   business `logo_url`, so a results list is currently the same picture
--   repeated down the page.
--
-- NULLABLE, AND NOTHING BREAKS WITHOUT IT. Readers fall back to the brand
-- logo, which is what they already show. A required photo would be a wall in
-- front of "add a store", which is a thing we want vendors to do.
--
-- A URL, NOT A STORAGE PATH, matching `listings.image_url` and
-- `vendor_profiles.logo_url`. The bucket is public — a storefront photo appears
-- on pages a signed-out visitor can already see — so signing them would mean
-- every render burning a round trip minting links that expire.
--
-- ROLLBACK
--   alter table public.storefronts drop column if exists image_url;
-- ============================================================================

alter table public.storefronts
  add column if not exists image_url text;
comment on column public.storefronts.image_url is
  'Photo of this location. Null falls back to the business logo — see modules/storefronts/README.';
-- `guard_storefront_privileged_cols` deliberately does NOT freeze this: a photo
-- of the shopfront is a trading detail like the hours, and the person running
-- the store is the one standing in front of it. Staff with the `store` scope
-- can change it; nothing structural is reachable that way.

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'storefronts'
       and column_name = 'image_url'
  ) then
    raise exception 'storefronts.image_url missing';
  end if;
end $$;
