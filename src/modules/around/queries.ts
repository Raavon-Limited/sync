/**
 * Data access for the 'around' module   the map at /around.
 *
 * WHY THIS FANS OUT INSTEAD OF USING ONE QUERY
 * The map shows vendors, hostels and hotspots together. They live in three
 * tables with three different RLS policies and three different shapes, so there
 * is no single query that returns them. The three reads run in parallel and are
 * normalised into one `NearbyPin` union here.
 *
 * If this becomes a bottleneck the fix is a database view or an RPC that unions
 * the three   NOT a client-side loop that fetches them one at a time.
 *
 * Replaces `NearbyPin` in src/mock/around.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { AreaPulse } from './types';
import { unwrapList } from '@/lib/query/helpers';
import { toLatLng } from '@/modules/hotspots/queries';

/* eslint-disable @typescript-eslint/no-explicit-any -- see lib/query/helpers.ts */
type Row = any;
type Client = SupabaseClient<Database>;

export type PinKind = 'vendor' | 'hostel' | 'hotspot';

export interface NearbyPin {
  id: string;
  kind: PinKind;
  name: string;
  slug: string;
  category: string | null;
  area: string | null;
  imageUrl: string | null;
  position: { lat: number; lng: number };
  /** Vendors and hostels only. */
  priceKobo?: number | null;
  rating?: number | null;
  isVerified?: boolean;
  /** Populated only when the query was a proximity search. */
  distanceM?: number;
}

export interface AroundFilters {
  kinds?: PinKind[];
  area?: string;
  category?: string;
}

/**
 * Everything on the map, unfiltered by distance. Rows with no coordinates are
 * dropped   a pin without them cannot be placed, and rendering it at 0,0 puts
 * it in the Gulf of Guinea.
 *
 * COORDINATES COME FROM lat/lng, NOT geo.
 *   A geography column reads back over PostgREST as WKB hex, so the previous
 *   `toLatLng(r.geo)` resolved to null for every row and this map rendered ZERO
 *   pins   silently, because "no coordinates" and "unreadable coordinates" look
 *   identical to the filter below.
 *
 * VENDOR PINS COME FROM STOREFRONTS.
 *   A vendor's location is a property of a BRANCH, not the brand: a business
 *   with three shops is three pins in three places. vendor_profiles.geo was
 *   superseded by storefronts and is deliberately not read here.
 */
export async function fetchNearbyPins(db: Client, filters: AroundFilters = {}): Promise<NearbyPin[]> {
  const kinds = filters.kinds ?? ['vendor', 'hostel', 'hotspot'];

  const [vendors, hostels, hotspots] = await Promise.all([
    kinds.includes('vendor')
      ? db
          .from('storefronts')
          .select(
            'id, slug, name, area, lat, lng, vendor:vendor_profiles!storefronts_vendor_id_fkey(business_name, category, logo_url, rating_avg, verification_status, archived_at)',
          )
          .is('archived_at', null)
      : Promise.resolve({ data: [], error: null }),

    kinds.includes('hostel')
      ? db
          .from('hostels')
          .select('id, slug, name, area, lat, lng, price_per_session_kobo, verified, hostel_images(url)')
          .is('archived_at', null)
      : Promise.resolve({ data: [], error: null }),

    kinds.includes('hotspot')
      ? db
          .from('hotspots')
          .select('id, slug, name, category, area, image_url, lat, lng')
          .eq('is_active', true)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const pins: NearbyPin[] = [];

  for (const r of unwrapList<Row>(vendors)) {
    const position = toLatLng(r);
    // The brand may be archived even when the branch row is not.
    if (!position || !r.vendor || r.vendor.archived_at) continue;
    pins.push({
      id: r.id,
      kind: 'vendor',
      // Brand name is what a student recognises; the branch name is the
      // distinguishing part, so both appear when there is more than one.
      name: r.vendor.business_name ?? r.name,
      slug: r.slug,
      category: r.vendor.category,
      area: r.area,
      imageUrl: r.vendor.logo_url,
      position,
      rating: r.vendor.rating_avg ? Number(r.vendor.rating_avg) : null,
      isVerified: r.vendor.verification_status === 'verified',
    });
  }

  for (const r of unwrapList<Row>(hostels)) {
    const position = toLatLng(r);
    if (!position) continue;
    pins.push({
      id: r.id,
      kind: 'hostel',
      name: r.name,
      slug: r.slug,
      category: 'hostel',
      area: r.area,
      imageUrl: r.hostel_images?.[0]?.url ?? null,
      position,
      priceKobo: Number(r.price_per_session_kobo ?? 0),
      isVerified: !!r.verified,
    });
  }

  for (const r of unwrapList<Row>(hotspots)) {
    const position = toLatLng(r);
    if (!position) continue;
    pins.push({
      id: r.id,
      kind: 'hotspot',
      name: r.name,
      slug: r.slug,
      category: r.category,
      area: r.area,
      imageUrl: r.image_url,
      position,
    });
  }

  return filters.area ? pins.filter((p) => p.area === filters.area) : pins;
}

// -- Campus pulse -------------------------------------------------------------

/**
 * What is happening across every area with a live store.
 *
 * One RPC rather than a fan-out like `fetchNearbyPins` above: the numbers are
 * aggregates over orders, and computing them here would mean reading order
 * rows into the client   which RLS would rightly refuse, and which would be
 * the wrong shape of question to ask even if it did not.
 */
export async function fetchCampusPulse(db: Client): Promise<AreaPulse[]> {
  const { data, error } = await db.rpc('campus_pulse');
  if (error) throw error;
  return (data ?? []) as unknown as AreaPulse[];
}
