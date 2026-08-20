/**
 * ROUTE: /api/geocode/reverse  (Route Handler - server)
 * Turns a GPS fix into a human place name ("Victoria Island, Lagos").
 *
 * Proxied rather than called from the browser, for three reasons:
 *   - Privacy: Nominatim sees OUR server IP, not the user's, and never the
 *     full-precision coordinates (we round before forwarding).
 *   - Policy: Nominatim requires an identifying User-Agent and rate-limits per
 *     client. One server identity is enforceable; thousands of browsers aren't.
 *   - Caching: rounded coordinates make a stable cache key, so repeat lookups
 *     from the same neighbourhood cost nothing.
 *
 * Consistent with the rule in src/store/api/base-api.ts - clients talk to our
 * own /api, never to third parties directly.
 */

/** ~110m at the equator. Enough to name a neighbourhood, not enough to place
 *  someone at an address. Also makes the cache key stable as the user moves. */
const COORD_PRECISION = 3;

/** Nominatim's usage policy requires a real identifier. */
const USER_AGENT = 'Sync/1.0 (https://sync.ng; campus marketplace)';

/** Zoom 14 ≈ suburb level - the granularity we actually want to show. */
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';

type NominatimAddress = Partial<
  Record<
    | 'neighbourhood'
    | 'suburb'
    | 'quarter'
    | 'city_district'
    | 'village'
    | 'town'
    | 'city'
    | 'county'
    | 'state'
    | 'country',
    string
  >
>;

/**
 * "Neighbourhood, City" where possible, falling back through progressively
 * coarser fields. Returns null rather than a bare country, which is too vague
 * to be worth showing.
 */
function toPlaceName(address: NominatimAddress): string | null {
  const local =
    address.neighbourhood ??
    address.suburb ??
    address.quarter ??
    address.city_district ??
    address.village ??
    address.town;

  // Nigerian addresses: Nominatim puts the LGA in `county` ("Eti Osa"), which
  // almost nobody uses to say where they are. `state` carries the name people
  // actually use ("Lagos", "Kwara"), so it outranks county here. `city` still
  // wins when present - "Ilorin" is more useful than "Kwara".
  const region = address.city ?? address.state ?? address.town ?? address.county;

  // Guards "Lagos, Lagos" when the local and regional fields agree.
  if (local && region && local !== region) return `${local}, ${region}`;
  return local ?? region ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
  }

  // Round before forwarding - the third party never receives the precise fix.
  const rLat = lat.toFixed(COORD_PRECISION);
  const rLng = lng.toFixed(COORD_PRECISION);

  const url = `${NOMINATIM}?format=jsonv2&lat=${rLat}&lon=${rLng}&zoom=14&addressdetails=1`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      // A place name doesn't change; cache hard. Keyed on the rounded coords.
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return Response.json({ place: null }, { status: 200 });

    const data = (await res.json()) as { address?: NominatimAddress };
    const place = data.address ? toPlaceName(data.address) : null;

    return Response.json(
      { place, country: data.address?.country ?? null },
      // Let the browser reuse it too - the user isn't teleporting.
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    );
  } catch {
    // Timeout, network failure, or a Nominatim rate-limit. The caller renders a
    // neutral fallback; a missing place name must never break the page.
    return Response.json({ place: null }, { status: 200 });
  }
}
