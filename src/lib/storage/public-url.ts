/**
 * Is this URL one of OUR OWN public-media objects?
 *
 * WHY ANY STORED IMAGE URL NEEDS THIS
 *   A column holding an arbitrary URL is an off-site image request made by
 *   every viewer of the page that renders it: a tracking pixel with a
 *   guaranteed audience, and a way to make Sync's UI fetch from a host we do
 *   not control. Uploads already land at exactly this prefix
 *   (uploadVendorImage -> getPublicUrl), so honest clients never notice the
 *   rule.
 *
 * CHECKED AS A PARSED URL, NOT A `startsWith`
 *   `startsWith` would accept `https://evil.test/?x=<our-prefix>` in a query
 *   string and, worse, would still pass a value carrying a newline or a control
 *   character.
 *
 * THIS LIVED IN /api/profile AND NOW LIVES HERE
 *   Because it was needed a second time, for hostel photos, and two copies of
 *   a security check are one copy and one that falls behind. The security
 *   review's finding on `avatar_url` was precisely that the rule existed in the
 *   route and nowhere else, so anything that did not go through that route
 *   bypassed it   which is an argument for one shared function, not two.
 */

/**
 * The public buckets a stored media URL may point into.
 *
 * `listing-media` is separate from `public-media` because it accepts video at
 * 40MB and avatars must not   see 20260908120000_listing_video.
 */
const PUBLIC_PREFIXES = [
  '/storage/v1/object/public/public-media/',
  '/storage/v1/object/public/listing-media/',
];

export function isOwnStorageUrl(value: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  try {
    const url = new URL(value);
    const origin = new URL(base);
    return (
      url.protocol === 'https:' &&
      url.host === origin.host &&
      PUBLIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
    );
  } catch {
    return false;
  }
}
