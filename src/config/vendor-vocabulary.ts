/**
 * Vendor vocabulary - what a vendor *calls* things, by vendor category.
 *
 * A food vendor manages a Menu of dishes; a barber manages Services and takes
 * Bookings. The screens, routes and data are identical - only the words change.
 * This module is the single place that knows vendor categories exist, so
 * components ask "what do I call this?" and never branch on the category
 * themselves. Adding a vendor type = one entry here, not edits across the app.
 *
 * Deliberately NOT here:
 *  - Routes. `/vendor/listings` stays `/vendor/listings` for every vendor, even
 *    when it's displayed as "Menu". Bookmarks, support links, analytics events
 *    and DB columns all stay canonical; only display strings vary.
 *  - Access control. Renaming a nav row is a view concern. If a category should
 *    not reach a screen at all, that has to be enforced server-side (the proxy),
 *    never by hiding a nav item.
 *
 * Room to grow: each category is an object, not a bare string map, so a
 * `capabilities` field can land beside `terms` without reshaping callers. Build
 * that the first time a category needs a *page* another category shouldn't have
 * (say, appointment vendors needing a calendar), or the first time Plan tier has
 * to hide something - not before.
 */

/** Mirrors `Profile['vendor_category']` in modules/auth/queries. */
export type VendorCategory = 'landlord' | 'food' | 'beauty' | 'laundry' | 'tradesman';

/**
 * Stable identifiers for the things a vendor type can rename. These are keys,
 * not routes and not copy - the strings they resolve to live below.
 */
export type TermKey = 'listings' | 'orders';

export interface Term {
  /** Sidebar row + breadcrumb, e.g. "Menu". */
  label: string;
  /** Page heading; usually the same as `label`, occasionally longer. */
  heading: string;
  /** Singular, lowercase - for buttons and toasts ("Add new dish"). */
  one: string;
  /** Plural, lowercase - for counts and empty states ("12 dishes"). */
  many: string;
}

export interface VendorTypeConfig {
  /** How the category itself is written in the UI, e.g. "Food vendor". */
  label: string;
  /** Term overrides; anything omitted falls back to DEFAULT_TERMS. */
  terms: Partial<Record<TermKey, Partial<Term>>>;
}

/** What every vendor gets before their category has a say. */
export const DEFAULT_TERMS: Record<TermKey, Term> = {
  listings: { label: 'Listings', heading: 'Listings', one: 'listing', many: 'listings' },
  orders: { label: 'Orders', heading: 'Orders', one: 'order', many: 'orders' },
};

/**
 * Per-category overrides. A `Record` (not a partial) so TypeScript fails the
 * build when a new VendorCategory is added without deciding its wording.
 */
export const VENDOR_VOCABULARY: Record<VendorCategory, VendorTypeConfig> = {
  food: {
    label: 'Food vendor',
    terms: {
      listings: { label: 'Menu', heading: 'Your menu', one: 'dish', many: 'dishes' },
    },
  },
  beauty: {
    label: 'Beauty pro',
    terms: {
      listings: { label: 'Services', heading: 'Your services', one: 'service', many: 'services' },
      orders: { label: 'Bookings', heading: 'Bookings', one: 'booking', many: 'bookings' },
    },
  },
  laundry: {
    label: 'Laundry',
    terms: {
      listings: { label: 'Services', heading: 'Your services', one: 'service', many: 'services' },
    },
  },
  tradesman: {
    label: 'Tradesman',
    terms: {
      listings: { label: 'Services', heading: 'Your services', one: 'service', many: 'services' },
      orders: { label: 'Jobs', heading: 'Jobs', one: 'job', many: 'jobs' },
    },
  },
  // Landlords run their own dashboard (navKey `landlord`) with its own nav, so
  // these terms are only reached if a landlord lands on a shared vendor screen.
  landlord: {
    label: 'Landlord',
    terms: {
      listings: {
        label: 'Properties',
        heading: 'Your properties',
        one: 'property',
        many: 'properties',
      },
      orders: {
        label: 'Booking requests',
        heading: 'Booking requests',
        one: 'request',
        many: 'requests',
      },
    },
  },
};

/** Fully-resolved terms for a category, defaults filled in. */
export type VendorTerms = Record<TermKey, Term>;

/**
 * The one lookup. `null`/unknown category (student, admin, a vendor who hasn't
 * finished onboarding) resolves to the neutral defaults rather than throwing.
 */
export function resolveVendorTerms(category?: VendorCategory | null): VendorTerms {
  const overrides = category ? VENDOR_VOCABULARY[category]?.terms : undefined;
  if (!overrides) return DEFAULT_TERMS;

  const keys = Object.keys(DEFAULT_TERMS) as TermKey[];
  return keys.reduce((acc, key) => {
    acc[key] = { ...DEFAULT_TERMS[key], ...overrides[key] };
    return acc;
  }, {} as VendorTerms);
}

/**
 * Display name for the category itself ("Food vendor"), used in the sidebar
 * profile card and the account menu.
 */
export function vendorCategoryLabel(category?: VendorCategory | string | null): string | undefined {
  if (!category) return undefined;
  return VENDOR_VOCABULARY[category as VendorCategory]?.label;
}
