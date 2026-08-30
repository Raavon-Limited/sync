/**
 * DEPRECATED - superseded by the `listing_categories` table.
 *
 * This was a food-only constant, which broke the moment a clothing vendor was
 * onboarded. Categories are now data: a shared platform taxonomy keyed by
 * vendor type, plus per-vendor custom categories. See the
 * `20260820120000_category_taxonomy` migration and `useListingCategories()`.
 *
 * Kept only as a seed reference for the food set. Nothing should import it -
 * delete once you have confirmed no branch still does.
 */
export const LEGACY_FOOD_CATEGORIES = [
  'Rice',
  'Soups',
  'Grills',
  'Snacks',
  'Seafood',
  'Beans',
  'Specials',
] as const;
