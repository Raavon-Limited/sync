/**
 * Data access for the 'around' module — the map at /around.
 *
 * WHY THIS FANS OUT INSTEAD OF USING ONE QUERY
 * The map shows vendors, hostels and hotspots together. They live in three
 * tables with three different RLS policies and three different shapes, so there
 * is no single query that returns them. The three reads run in parallel and are
 * normalised into one `NearbyPin` union here.
 *
 * If this becomes a bottleneck the fix is a database view or an RPC that unions
 * the three — NOT a client-side loop that fetches them one at a time.
 *
 * Replaces `NearbyPin` in src/mock/around.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
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
 * Everything on the map, unfiltered by distance. Rows with no `geo` are dropped
 * — a pin without coordinates cannot be placed, and rendering it at 0,0 puts it
 * in the Gulf of Guinea.
 */
export async function fetchNearbyPins(db: Client, filters: AroundFilters = {}): Promise<NearbyPin[]> {
  const kinds = filters.kinds ?? ['vendor', 'hostel', 'hotspot'];

  const [vendors, hostels, hotspots] = await Promise.all([
    kinds.includes('vendor')
      ? db
          .from('vendor_profiles')
          .select('id, slug, business_name, category, area, logo_url, geo, rating_avg, verification_status')
          .is('archived_at', null)
      : Promise.resolve({ data: [], error: null }),

    kinds.includes('hostel')
      ? db
          .from('hostels')
          .select('id, slug, name, area, geo, price_per_session_kobo, verified, hostel_images(url)')
          .is('archived_at', null)
      : Promise.resolve({ data: [], error: null }),

    kinds.includes('hotspot')
      ? db.from('hotspots').select('id, slug, name, category, area, image_url, geo').eq('is_active', true)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const pins: NearbyPin[] = [];

  for (const r of unwrapList<Row>(vendors)) {
    const position = toLatLng(r.geo);
    if (!position) continue;
    pins.push({
      id: r.id,
      kind: 'vendor',
      name: r.business_name,
      slug: r.slug,
      category: r.category,
      area: r.area,
      imageUrl: r.logo_url,
      position,
      rating: r.rating_avg ? Number(r.rating_avg) : null,
      isVerified: r.verification_status === 'verified',
    });
  }

  for (const r of unwrapList<Row>(hostels)) {
    const position = toLatLng(r.geo);
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
    const position = toLatLng(r.geo);
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
