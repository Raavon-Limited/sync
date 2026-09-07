/**
 * Server-side data fetching for the 'hostels' module.
 * Called from RSC pages. Uses the server Supabase client.
 * RLS is the real authorization layer - these queries return only what the
 * caller is allowed to see (hostels are publicly readable while not archived).
 *
 * Availability (`active` / `ending_soon` / `closed`) is never stored - it comes
 * from the `hostel_availability` view, which counts free rooms at read time.
 * See supabase/migrations/0006_student_core.sql.
 *
 * Every function degrades to an empty result rather than throwing: these render
 * public pages, and a Supabase outage should show "no hostels" and not a 500.
 */
import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { NEARBY_RADIUS_M, type MaleteArea } from '@/lib/constants/areas';
import { PAGE_SIZE } from '@/lib/constants';

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

/** Availability states from the `hostel_availability` view. */
export type Availability = 'active' | 'ending_soon' | 'closed' | 'draft';

/** A hostel card as the browse/list UIs need it. Prices are in KOBO - render
 *  with formatKobo(), never formatNaira(). */
export interface HostelCard {
  id: string;
  slug: string;
  name: string;
  area: string;
  landmark: string | null;
  pricePerSessionKobo: number;
  inspectionFeeKobo: number;
  roomType: string;
  amenities: string[];
  verified: boolean;
  ribbon: string | null;
  distanceMinutes: number | null;
  imageUrl: string | null;
  roomsAvailable: number;
  availability: Availability;
  /** Metres from the search origin. Only set by `hostelsNear`. */
  distanceM?: number;
}

export interface ListHostelsOptions {
  area?: MaleteArea;
  /** Inclusive upper bound, in kobo. */
  maxPriceKobo?: number;
  roomType?: string;
  verifiedOnly?: boolean;
  limit?: number;
}

/** The shape Supabase returns for the joined select below. */
type HostelRow = {
  id: string;
  slug: string;
  name: string;
  area: string;
  landmark: string | null;
  price_per_session_kobo: number;
  inspection_fee_kobo: number;
  room_type: string;
  amenities: string[];
  verified: boolean;
  ribbon: string | null;
  distance_minutes: number | null;
  hostel_images: { url: string }[] | null;
  hostel_availability: { rooms_available: number; availability: string } | null;
};

function toCard(row: HostelRow): HostelCard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    area: row.area,
    landmark: row.landmark,
    pricePerSessionKobo: row.price_per_session_kobo,
    inspectionFeeKobo: row.inspection_fee_kobo,
    roomType: row.room_type,
    amenities: row.amenities ?? [],
    verified: row.verified,
    ribbon: row.ribbon,
    distanceMinutes: row.distance_minutes,
    // hostel_images is ordered by `position` in the select.
    imageUrl: row.hostel_images?.[0]?.url ?? null,
    roomsAvailable: row.hostel_availability?.rooms_available ?? 0,
    availability: (row.hostel_availability?.availability ?? 'draft') as Availability,
  };
}

const CARD_SELECT = `
  id, slug, name, area, landmark, price_per_session_kobo, inspection_fee_kobo,
  room_type, amenities, verified, ribbon, distance_minutes,
  hostel_images ( url ),
  hostel_availability ( rooms_available, availability )
`;

/**
 * Browse hostels, newest first. `archived_at is null` is enforced by RLS, so
 * it isn't repeated here.
 */
export async function listHostels(opts: ListHostelsOptions = {}): Promise<HostelCard[]> {
  if (!configured) return [];
  try {
    const supabase = await createClient();
    let q = supabase
      .from('hostels')
      .select(CARD_SELECT)
      .order('position', { referencedTable: 'hostel_images', ascending: true })
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? PAGE_SIZE);

    if (opts.area) q = q.eq('area', opts.area);
    if (opts.roomType) q = q.eq('room_type', opts.roomType);
    // RLS already hides unverified listings from everyone but the owner and
    // staff (20260908150000). This stays as an explicit narrowing for the
    // screens that want ONLY verified even when the caller is one of those two.
    if (opts.verifiedOnly) q = q.eq('verified', true);
    if (opts.maxPriceKobo != null) q = q.lte('price_per_session_kobo', opts.maxPriceKobo);

    const { data, error } = await q;
    if (error) return [];
    return (data as unknown as HostelRow[]).map(toCard);
  } catch {
    return [];
  }
}

/**
 * Hostels within `radiusM` of a position, nearest first. Backed by the
 * `hostels_near` RPC so PostGIS does the distance work against the GiST index -
 * doing it in JS would mean pulling every row to rank a handful.
 *
 * Returns [] when nothing has coordinates yet, which is the correct empty state
 * rather than an error.
 */
export async function hostelsNear(
  lat: number,
  lng: number,
  radiusM: number = NEARBY_RADIUS_M,
): Promise<HostelCard[]> {
  if (!configured) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('hostels_near', {
      lat,
      lng,
      radius_m: radiusM,
    });
    if (error || !data) return [];

    // The RPC returns a flat projection, not the joined card shape - it exists
    // to rank by distance, so it deliberately carries only what a card needs.
    return data.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      area: r.area,
      landmark: null,
      pricePerSessionKobo: r.price_per_session_kobo,
      inspectionFeeKobo: 0,
      roomType: '',
      amenities: [],
      verified: false,
      ribbon: null,
      distanceMinutes: null,
      imageUrl: null,
      roomsAvailable: Number(r.rooms_available ?? 0),
      availability: (r.availability ?? 'draft') as Availability,
      distanceM: r.distance_m ?? undefined,
    }));
  } catch {
    return [];
  }
}

/** A single hostel by slug, or null. Cached per request. */
export const getHostelBySlug = cache(async (slug: string): Promise<HostelCard | null> => {
  if (!configured) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('hostels')
      .select(CARD_SELECT)
      .eq('slug', slug)
      .maybeSingle();
    if (error || !data) return null;
    return toCard(data as unknown as HostelRow);
  } catch {
    return null;
  }
});

/** Rooms for a hostel with their live state (free / reserved / booked). */
export async function listRoomState(hostelId: string) {
  if (!configured) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('hostel_room_state')
      .select('room_id, label, price_kobo, state')
      .eq('hostel_id', hostelId)
      .order('label', { ascending: true });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * How many verified hostels exist - the "412 verified spots" pill on /around.
 * `head: true` so Postgres returns the count without shipping any rows.
 */
export const countVerifiedHostels = cache(async (): Promise<number> => {
  if (!configured) return 0;
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('hostels')
      .select('id', { count: 'exact', head: true })
      .eq('verified', true);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
});
