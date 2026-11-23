/**
 * Personalised dashboard handles. Student and vendor dashboards are reachable at
 * a name-based root URL (e.g. `/muiz-owolabi/insights`, `/hifoods/orders`) which
 * the proxy rewrites to the real `/user` and `/vendor` pages.
 *
 * The handle is cosmetic + private: the proxy only rewrites when the first path
 * segment equals the SIGNED-IN user's own handle, so it never exposes other
 * users' dashboards. Both the proxy and getDashboardProfile derive the handle
 * from the SAME inputs (user_metadata + email) via `resolveHandle`, so the
 * sidebar links and the rewrite always agree.
 */

/** Lowercase, hyphenated slug of a display name. Returns null if it's empty. */
export function toHandle(name?: string | null): string | null {
  if (!name) return null;
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

/**
 * The signed-in user's handle: business accounts (vendor + landlord) key off
 * business name, everyone else off full name, falling back to the email
 * local-part. Kept deliberately simple (no uniqueness suffix) - swap for a
 * stored `handle` column when we need it.
 */
export function resolveHandle(opts: {
  role?: string;
  full_name?: string | null;
  business_name?: string | null;
  email?: string | null;
}): string | null {
  const isBusiness = opts.role === 'vendor' || opts.role === 'landlord';
  const primary = isBusiness ? opts.business_name || opts.full_name : opts.full_name;
  return toHandle(primary || opts.email?.split('@')[0]);
}

/**
 * Top-level URL segments that are real routes, so they must NEVER be treated as
 * a personalised handle. (Static routes win over a handle anyway, but this keeps
 * the proxy from even trying - and documents the reserved namespace.)
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  '403',
  'about',
  'admin',
  // Gated in PROTECTED_PREFIXES (Nov 2026) and not reserved until now, so the
  // gate never fired - exactly the trap described at 'organiser' below.
  'ai',
  'api',
  'around',
  'beauty',
  'checkout',
  'dev',
  'events',
  'food',
  'for-vendors',
  'hostels',
  'hotspots',
  'how-it-works',
  'landlord',
  'laundry',
  'login',
  // Kept reserved after the /me → /user rename: the redirect in next.config
  // lives on this segment, and a handle called "me" would shadow it.
  'me',
  'user',
  'onboarding',
  // A ROUTE PREFIX MISSING FROM THIS SET IS AN UNGATED ROUTE.
  //
  // The proxy checks the handle rewrite BEFORE the role gate and returns early
  // from it, so a first segment that is not reserved never reaches
  // PROTECTED_PREFIXES at all. '/rider' was gated in that list from its first
  // commit and the gate had never once fired, because 'rider' was not here: a
  // signed-out visitor got the rider dashboard.
  //
  // Anything with a route group and a gate belongs in this list, and the two
  // have to be added together.
  'organiser',
  'agent',
  'agent-invite',
  'rider',
  'search',
  'staff-invite',
  'signup',
  'vendor',
  'verify',
  'wallet',
  'workmanship',
]);

export function isReservedHandle(segment: string): boolean {
  return RESERVED_HANDLES.has(segment.toLowerCase());
}
