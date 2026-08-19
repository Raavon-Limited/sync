/**
 * Food listing categories.
 *
 * Configuration, not data — it lived in `src/mock/listings.ts` only because
 * that is where it was first written. There is no `listing_categories` table:
 * `listings.category` is free text with an index, and this is the list the
 * vendor UI offers. If categories ever need per-campus curation or admin
 * editing, promote this to a table; until then a constant is the honest shape.
 *
 * 'All' is a UI filter sentinel and is never persisted.
 */
export const LISTING_CATEGORIES = [
  'All',
  'Rice',
  'Soups',
  'Grills',
  'Snacks',
  'Seafood',
  'Beans',
  'Specials',
] as const;

export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

/** The categories a listing can actually be saved with. */
export const SELECTABLE_LISTING_CATEGORIES = LISTING_CATEGORIES.filter(
  (c) => c !== 'All',
) as Exclude<ListingCategory, 'All'>[];
