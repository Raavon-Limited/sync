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

/** Pin categories the map legend understands. */
export type PinCategory = 'hostel' | 'food' | 'laundry' | 'beauty' | 'hotspot' | 'event';

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
 * Hostels as map pins.
 *
 * `geo` is a PostGIS geography column, which PostgREST serialises as GeoJSON,
 * so coordinates arrive as [lng, lat] - note the order, it is the reverse of
 * Leaflet's [lat, lng] and silently puts every pin in the wrong hemisphere if
 * you get it backwards.
 *
 * Rows without coordinates are skipped rather than defaulted to campus: a pin
 * in the wrong place is worse than no pin.
 */
export async function listMapPins(origin?: { lat: number; lng: number }): Promise<MapPin[]> {
  if (!configured) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('hostels')
      .select('id, name, slug, geo, verified')
      .not('geo', 'is', null)
      .limit(60);
    if (error || !data) return [];

    const from = origin ?? { lat: CAMPUS_POINT.lat, lng: CAMPUS_POINT.lng };

    return data.flatMap((row): MapPin[] => {
      const geo = row.geo as unknown as { coordinates?: [number, number] } | null;
      const coords = geo?.coordinates;
      if (!coords || coords.length !== 2) return [];
      const [lng, lat] = coords;

      return [
        {
          id: row.id,
          category: 'hostel',
          name: row.name,
          distance: formatDistance(distanceMetres(from, { lat, lng })),
          href: `/hostels/${row.slug}`,
          lat,
          lng,
          featured: row.verified,
        },
      ];
    });
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
