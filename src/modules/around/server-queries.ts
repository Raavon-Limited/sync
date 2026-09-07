/**
 * Server-side data fetching for the 'around' module - the public /around feed.
 * Called from RSC pages. Uses the server Supabase client.
 * RLS is the real authorization layer.
 *
 * The map mixes categories (hostels, food, laundry…), so pin assembly lives
 * here rather than in any one domain module.
 *
 * Everything degrades to an empty result: /around is public and signed-out, so
 * a Supabase blip should render an empty map, not a 500.
 */
import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { distanceMetres, formatDistance, CAMPUS_POINT } from '@/lib/constants/areas';

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

/**
 * Row shapes for the pin queries.
 *
 * PostgREST returns whatever the select string asked for, not the generated
 * table type, so these are declared by hand. Coordinates are typed loosely
 * because a numeric column can arrive as a string over the wire; every read
 * goes through Number() and a Number.isFinite guard below.
 */
type Coord = number | string | null;
interface StorefrontRow {
  id: string;
  slug: string;
  name: string;
  lat: Coord;
  lng: Coord;
  vendor: {
    business_name: string | null;
    category: string | null;
    verification_status: string | null;
    archived_at: string | null;
  } | null;
}
interface HostelRow {
  id: string;
  name: string;
  slug: string;
  lat: Coord;
  lng: Coord;
  verified: boolean | null;
}
interface HotspotRow {
  id: string;
  name: string;
  slug: string;
  lat: Coord;
  lng: Coord;
}

/** Pin categories the map legend understands.
 *
 *  No 'event' key. Events carry no coordinates of their own on this schema, so
 *  a legend entry for them would advertise a colour that can never appear. */
export type PinCategory = 'hostel' | 'food' | 'laundry' | 'beauty' | 'workmanship' | 'hotspot';

export interface MapPin {
  id: string;
  category: PinCategory;
  name: string;
  /**
   * Pre-formatted for the tooltip, e.g. "400m" / "1.2km", measured from campus.
   *
   * This is the FALLBACK, not the final answer. The server has no way to know
   * where the browser is, so every visitor gets the same campus-relative
   * figure; once the user shares a fix, <AroundMapGoogle> recomputes each pin
   * from their real lat/lng and this string is not shown.
   */
  distance: string;
  href: string;
  lat: number;
  lng: number;
  /** Renders the highlighted marker. Driven by `verified` for hostels, so the
   *  emphasis means something rather than being editorial. */
  featured?: boolean;
}

/**
 * A vendor's legend bucket.
 *
 * `kind` alone would flatten every business into one colour, so vendors split
 * by their own category - which is the distinction a student is actually
 * scanning the map for. `vendor_profiles.category` says 'tradesman'; the
 * product says workmanship, so it is mapped here rather than renamed in the
 * database.
 */
function vendorCategory(category: string | null): PinCategory {
  switch (category) {
    case 'beauty':
      return 'beauty';
    case 'laundry':
      return 'laundry';
    case 'tradesman':
      return 'workmanship';
    default:
      return 'food';
  }
}

/**
 * Everything with a position: storefronts, hostels and hotspots.
 *
 * This used to read `hostels` alone, so the map showed one category out of six
 * while the legend advertised all of them. The three-way union mirrors
 * `fetchNearbyPins` (the client-side query), including its rule that VENDOR
 * PINS COME FROM STOREFRONTS: a location is a property of a BRANCH, not the
 * brand, so a business with three shops is three pins in three places.
 * `vendor_profiles.geo` was superseded by storefronts and is not read.
 *
 * Rows without coordinates are skipped rather than defaulted to campus - a pin
 * in the wrong place is worse than no pin.
 */
export async function listMapPins(origin?: { lat: number; lng: number }): Promise<MapPin[]> {
  if (!configured) return [];
  try {
    const supabase = await createClient();
    const from = origin ?? { lat: CAMPUS_POINT.lat, lng: CAMPUS_POINT.lng };
    const at = (lat: number, lng: number) =>
      formatDistance(distanceMetres(from, { lat, lng }));

    const [storefronts, hostels, hotspots] = await Promise.all([
      supabase
        .from('storefronts')
        .select(
          'id, slug, name, lat, lng, vendor:vendor_profiles!storefronts_vendor_id_fkey(business_name, category, verification_status, archived_at)',
        )
        .is('archived_at', null)
        .limit(120),
      supabase
        .from('hostels')
        .select('id, name, slug, lat, lng, verified')
        .is('archived_at', null)
        .limit(120),
      supabase
        .from('hotspots')
        .select('id, name, slug, lat, lng')
        .eq('is_active', true)
        .limit(60),
    ]);

    const pins: MapPin[] = [];

    for (const row of (storefronts.data ?? []) as unknown as StorefrontRow[]) {
      // The brand may be archived even when the branch row is not.
      const vendor = row.vendor;
      if (!vendor || vendor.archived_at) continue;
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      pins.push({
        id: row.id,
        category: vendorCategory(vendor.category ?? null),
        // Brand name is what a student recognises; the branch name only
        // distinguishes one shop from another.
        name: vendor.business_name ?? row.name,
        distance: at(lat, lng),
        href: `/vendors/${row.slug}`,
        lat,
        lng,
        featured: vendor.verification_status === 'verified',
      });
    }

    for (const row of (hostels.data ?? []) as unknown as HostelRow[]) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      pins.push({
        id: row.id,
        category: 'hostel',
        name: row.name,
        distance: at(lat, lng),
        href: `/hostels/${row.slug}`,
        lat,
        lng,
        featured: Boolean(row.verified),
      });
    }

    for (const row of (hotspots.data ?? []) as unknown as HotspotRow[]) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      pins.push({
        id: row.id,
        category: 'hotspot',
        name: row.name,
        distance: at(lat, lng),
        href: `/hotspots/${row.slug}`,
        lat,
        lng,
      });
    }

    return pins;
  } catch {
    return [];
  }
}

/* ─────────────────── Quick stats + resume booking ──────────────────── */

/**
 * The three headline numbers on /around.
 *
 * These were hardcoded mock values ("3 rooms left", "240 going", "28 min").
 * They are now derived, and every one of them returns a real ZERO when there is
 * nothing to count - a fabricated number on a public feed is a claim we can't
 * back, and "0 rooms left" is information while "3 rooms left" from a mock is
 * a lie that survives into production.
 */
export interface QuickStat {
  value: number;
  label: string;
  /** Nothing recorded yet - the UI dims the tile instead of implying a real 0. */
  empty: boolean;
  accent?: boolean;
}

/** Total free rooms across every listed hostel. 0 before any stock exists. */
export const countRoomsAvailable = cache(async (): Promise<number> => {
  if (!configured) return 0;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('hostel_availability')
      .select('rooms_available');
    if (error || !data) return 0;
    return data.reduce((sum, r) => sum + Number(r.rooms_available ?? 0), 0);
  } catch {
    return 0;
  }
});

/**
 * A booking the signed-in student started but hasn't completed, if any.
 *
 * Drives the "resume booking" nudge, which used to be a fixed mock hostel shown
 * to everyone - including signed-out visitors who had never booked anything.
 * Null is the common case and the card should not render at all for it.
 */
export interface ResumeBooking {
  hostelName: string;
  hostelSlug: string;
  pricePerSessionKobo: number | null;
  roomsLeft: number;
}

export const getResumeBooking = cache(async (): Promise<ResumeBooking | null> => {
  if (!configured) return null;
  try {
    const supabase = await createClient();
    // RLS scopes bookings to the caller, so there is no student_id filter here:
    // an anonymous caller simply gets no rows.
    const { data, error } = await supabase
      .from('bookings')
      .select('hostel_id, price_per_session_kobo, hostels(name, slug)')
      .in('status', ['interested', 'requested', 'awaiting_payment'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const hostel = (Array.isArray(data.hostels) ? data.hostels[0] : data.hostels) as
      | { name: string; slug: string }
      | undefined;
    if (!hostel) return null;

    const { data: avail } = await supabase
      .from('hostel_availability')
      .select('rooms_available')
      .eq('hostel_id', data.hostel_id)
      .maybeSingle();

    return {
      hostelName: hostel.name,
      hostelSlug: hostel.slug,
      pricePerSessionKobo:
        data.price_per_session_kobo == null ? null : Number(data.price_per_session_kobo),
      roomsLeft: Number(avail?.rooms_available ?? 0),
    };
  } catch {
    return null;
  }
});
