/**
 * Malete service areas.
 *
 * The areas themselves now live in the `areas` table (see
 * supabase/migrations/0007_areas.sql) and are fetched with listAreas(). What
 * remains here is:
 *
 *   - the Area shape,
 *   - a FALLBACK list, used only when the database can't answer,
 *   - the geometry helpers, which take the area list as an argument rather
 *     than closing over a hardcoded one.
 *
 * Why a fallback rather than an empty list: /around is public and the location
 * picker is part of its chrome. A Supabase outage should leave a slightly stale
 * picker, not a page with no way to filter. The fallback is also what keeps the
 * static-import call sites (the mock module, tests) working unchanged.
 */

/** One service area. Mirrors the columns listAreas() selects. */
export interface Area {
  name: string;
  slug: string;
  lat: number;
  lng: number;
}

/**
 * Last-resort copy of the areas, used when the DB is unreachable.
 *
 * Keep in sync with the seed in 0007_areas.sql. It is NOT the source of truth -
 * edit coordinates in the database, where a fix needs no deploy.
 */
export const FALLBACK_AREAS: Area[] = [
  { name: 'KWASU Gate', slug: 'kwasu-gate', lat: 8.718, lng: 4.4799 },
  { name: 'Safari', slug: 'safari', lat: 8.7156, lng: 4.4783 },
  { name: 'Malete Town', slug: 'malete-town', lat: 8.7123, lng: 4.4773 },
  { name: 'Amao', slug: 'amao', lat: 8.7146, lng: 4.4719 },
  { name: 'Nifeskwasu', slug: 'nifeskwasu', lat: 8.7214, lng: 4.4757 },
];

/** Area names only. Retained for the call sites that just need the labels. */
export const MALETE_AREAS = FALLBACK_AREAS.map((a) => a.name);

/**
 * An area name.
 *
 * This was a union of five string literals. It cannot be, now that the list is
 * a database row set - the compiler has no way to know what's in the table. The
 * FK on hostels.area (0007) is what enforces validity, at write time, where it
 * can actually be checked against the real list.
 */
export type MaleteArea = string;

/** Campus anchor - the fallback centre when we have no user position.
 *  Geocoded against OSM ("Kwara State University, Malete Road, Moro, Kwara"),
 *  so this one is a real fix rather than an estimate. */
export const CAMPUS_POINT = { label: 'KWASU, Malete', lat: 8.7196, lng: 4.4817 } as const;

/** Default map camera: centred on the student belt, with town + gate in frame.
 *  Used until the user shares a position or picks an area. */
export const MAP_DEFAULT_VIEW = {
  center: [8.7156, 4.4787] as [number, number],
  zoom: 15,
} as const;

/**
 * Zoom used when the user picks an area from the dock.
 *
 * Deliberately tighter than MAP_DEFAULT_VIEW.zoom. The areas sit within roughly
 * a kilometre of each other, so at the overview zoom they are all on screen at
 * once and re-centring between them moves the camera by a couple of hundred
 * pixels - which reads as "clicking Safari did nothing". Zooming in makes the
 * selection visibly land somewhere.
 */
export const AREA_ZOOM = 16;

/** Default radius for "near me" searches, in metres. Matches the default on
 *  the `hostels_near` RPC. */
export const NEARBY_RADIUS_M = 2000;

/** Great-circle distance in metres. Good enough at campus scale - this is for
 *  picking the closest area label, not for ranking search results (Postgres
 *  does that with PostGIS). */
export function distanceMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * How far from an area centre we still consider someone to be "in" it.
 *
 * Sync only serves Malete/KWASU. Without a ceiling, `nearestArea` returns the
 * least-distant area no matter where on earth you are - a user in Lagos gets
 * told they're in Amao, 300km away. 25km covers the town, the campus and the
 * Ilorin approach without reaching the next market.
 */
export const SERVICE_RADIUS_M = 25_000;

/**
 * The area whose centre is closest to a position, or NULL when the position is
 * outside the service area entirely.
 *
 * Returning null is the point: callers must decide what to show someone we
 * don't cover, rather than silently mislabelling them.
 */
export function nearestArea(
  pos: { lat: number; lng: number },
  areas: Area[] = FALLBACK_AREAS,
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const area of areas) {
    const d = distanceMetres(pos, area);
    if (d < bestDist) {
      bestDist = d;
      best = area.name;
    }
  }
  return bestDist <= SERVICE_RADIUS_M ? best : null;
}

/** True when a position is outside every service area. */
export function isOutsideServiceArea(
  pos: { lat: number; lng: number },
  areas: Area[] = FALLBACK_AREAS,
): boolean {
  return nearestArea(pos, areas) === null;
}

/** Coordinates for one area name, or null when it isn't in the list. */
export function areaCoords(name: string, areas: Area[] = FALLBACK_AREAS): Area | null {
  return areas.find((a) => a.name === name) ?? null;
}
