-- ============================================================================
-- taxonomy_suggestions
--
-- Broadens the seeded platform taxonomy so every vendor type opens the listing
-- picker with a usable set, instead of an empty one.
--
-- THE GAP THIS CLOSES
--   20260820120000 seeded food, clothing, groceries, electronics, beauty and
--   laundry - but NOT `tradesman` or `landlord`. A tradesman vendor (one exists
--   in production today) opened the picker to nothing at all, which reads as
--   broken rather than as "add your own".
--
-- WHY CURATED ROWS AND NOT GENERATED ONES
--   Generating categories per vendor - by AI or otherwise - produces a different
--   vocabulary for every storefront: one vendor's "Tops", another's "Shirts",
--   a third's "Upper wear". Nothing can then filter across vendors, which is the
--   single most valuable thing a marketplace taxonomy does. The shared set has
--   to be shared to be worth having.
--
--   The per-vendor escape hatch already exists (`vendor_id` set), so the long
--   tail is covered without fragmenting the common case. If AI belongs anywhere
--   here it is SUGGESTING an existing category for a listing at write time, not
--   inventing new ones.
--
-- ROLLBACK
--   delete from public.listing_categories
--    where vendor_id is null and sort_order between 100 and 199;
-- ============================================================================

-- sort_order 100+ marks "added as a later suggestion", so the original curated
-- set still sorts first and the rollback above can find these precisely.
insert into public.listing_categories (vendor_category, name, slug, sort_order) values
  -- Trades: the listing is a job type, priced per visit or quoted.
  ('tradesman', 'Carpentry',   'carpentry',   100),
  ('tradesman', 'Plumbing',    'plumbing',    101),
  ('tradesman', 'Electrical',  'electrical',  102),
  ('tradesman', 'Tailoring',   'tailoring',   103),
  ('tradesman', 'Painting',    'painting',    104),
  ('tradesman', 'Mechanic',    'mechanic',    105),
  ('tradesman', 'Furniture',   'furniture',   106),
  ('tradesman', 'Appliances',  'appliances',  107),

  -- Hostels list through `hostels`, not `listings`, but a landlord may still
  -- sell extras, and an empty picker reads as a bug.
  ('landlord', 'Furnishings',  'furnishings', 100),
  ('landlord', 'Utilities',    'utilities',   101),
  ('landlord', 'Services',     'services',    102),

  -- Food: rounding out the original seven.
  ('food', 'Swallow',      'swallow',      100),
  ('food', 'Breakfast',    'breakfast',    101),
  ('food', 'Drinks',       'drinks',       102),
  ('food', 'Pastries',     'pastries',     103),
  ('food', 'Small Chops',  'small-chops',  104),
  ('food', 'Combos',       'combos',       105),

  -- Clothing.
  ('clothing', 'Native Wear', 'native-wear', 100),
  ('clothing', 'Ankara',      'ankara',      101),
  ('clothing', 'Sportswear',  'sportswear',  102),
  ('clothing', 'Jewellery',   'jewellery',   103),
  ('clothing', 'Headwear',    'headwear',    104),
  ('clothing', 'Unisex',      'unisex',      105),

  -- Beauty.
  ('beauty', 'Braiding',   'braiding',   100),
  ('beauty', 'Barbing',    'barbing',    101),
  ('beauty', 'Lashes',     'lashes',     102),
  ('beauty', 'Spa',        'spa',        103),

  -- Laundry.
  ('laundry', 'Bedding',    'bedding',    100),
  ('laundry', 'Shoe Care',  'shoe-care',  101),
  ('laundry', 'Express',    'express',    102),

  -- Groceries.
  ('groceries', 'Grains',     'grains',     100),
  ('groceries', 'Frozen',     'frozen',     101),
  ('groceries', 'Snacks',     'snacks',     102),
  ('groceries', 'Fresh Produce', 'fresh-produce', 103),

  -- Electronics.
  ('electronics', 'Chargers',   'chargers',   100),
  ('electronics', 'Laptops',    'laptops',    101),
  ('electronics', 'Gaming',     'gaming',     102),
  ('electronics', 'Storage',    'storage',    103)
on conflict do nothing;

-- ── Verify: every ACTIVE vendor type has somewhere to file a listing ────────
do $$
declare
  empty_types text;
begin
  select string_agg(vc.slug, ', ') into empty_types
    from public.vendor_categories vc
   where vc.is_active
     and not exists (
       select 1 from public.listing_categories lc
        where lc.vendor_category = vc.slug and lc.vendor_id is null and lc.is_active
     );

  if empty_types is not null then
    raise exception 'vendor type(s) with no listing categories: %', empty_types;
  end if;

  raise notice 'taxonomy: % platform categories across % vendor types.',
    (select count(*) from public.listing_categories where vendor_id is null),
    (select count(distinct vendor_category) from public.listing_categories where vendor_id is null);
end $$;
