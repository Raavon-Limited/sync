/**
 * Real data for the /around hub.
 *
 * REPLACES most of `@/mock/around`, which supplied a student called Aisha, a
 * hostel called Woss, 412 verified spots, an MTN advert nobody sold, and three
 * hostel-board posts written by people who do not exist.
 *
 * WHAT HAD NO SCHEMA, AND SO IS NOT HERE
 *   - **The hostel board.** There is no posts table of any kind. It is a small
 *     social network, not a query, and inventing one to fill a card would be
 *     the largest feature on this page arriving by accident. The section is
 *     removed rather than faked.
 *   - **Hotspot "84 here now".** Live headcount needs check-ins, which nothing
 *     records. The hotspot list is real; the number beside it was not, and is
 *     replaced by what the table actually knows.
 *   - **"28 min delivery."** No ETA model exists. `orders.eta_minutes` is
 *     nullable and nothing computes it.
 *
 * The two carousels are still hardcoded   they rotate bundled images rather
 * than reading a table, so converting them is an asset decision, not a query.
 */
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

import type { Row } from '@/lib/supabase/row';

export interface QuickStat {
  value: string;
  label: string;
  accent?: boolean;
}

export interface AroundData {
  /** Verified hostels + verified businesses. The pill in the eyebrow row. */
  verifiedSpots: number;
  quickStats: QuickStat[];
  hotspots: { slug: string; name: string; meta: string }[];
  sponsored: {
    brand: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
  } | null;
  laundry: { perPieceNaira: number; vendorName: string; slug: string } | null;
  resumeBooking: {
    hostelSlug: string;
    hostelName: string;
    roomsLeft: number;
    priceNaira: number;
  } | null;
}

const naira = (kobo: number) => Math.round(kobo / 100);

export async function getAroundData(userId?: string): Promise<AroundData> {
  const db = await createClient();
  // Counts and the ad slot are the same for everybody and cross RLS boundaries
  // (hostels a student has not booked, vendors they have not visited), so they
  // go through the service role. Nothing user-specific is read with it.
  const admin = createAdminClient();

  const [
    { count: verifiedHostels },
    { count: verifiedVendors },
    { data: banner },
    { data: hotspots },
    { data: laundryRows },
    { data: openStores },
    { count: upcomingEvents },
    { data: availability },
    { data: verifiedIds },
  ] = await Promise.all([
    admin.from('hostels').select('*', { count: 'exact', head: true }).eq('verified', true).is('archived_at', null),
    admin
      .from('vendor_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'verified')
      .is('archived_at', null),
    // The sponsored slot is a real placement now: whatever staff scheduled for
    // 'home' and is live right now. No banner means no advert, not a fake one.
    admin
      .from('banners')
      .select('title, subtitle, href, placement, sort_order')
      .eq('placement', 'home')
      .eq('is_active', true)
      .lte('starts_at', new Date().toISOString())
      .order('sort_order')
      .limit(1)
      .maybeSingle(),
    admin
      .from('hotspots')
      .select('slug, name, area, category')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('sort_order')
      .limit(3),
    admin
      .from('services')
      .select('price_kobo, vendor_id, vertical, is_active')
      .eq('vertical', 'laundry')
      .eq('is_active', true)
      .not('price_kobo', 'is', null)
      .order('price_kobo')
      // Not 1: the cheapest row may belong to a vendor Sync has not verified, and
      // it is picked from this list below once that is known.
      .limit(25),
    admin
      .from('storefronts')
      .select('id, vendor_id, is_accepting_orders, paused_until')
      .is('archived_at', null),
    admin
      .from('events')
      .select('*', { count: 'exact', head: true })
      .gt('starts_at', new Date().toISOString()),
    admin.from('hostel_availability').select('rooms_available'),
    // Who counts. The service role ignores RLS, so every figure below that names
    // or counts a vendor has to apply "verified" itself - see
    // 20261012120000_unverified_vendors_hidden for the rule it mirrors. Fetched
    // as a list and matched in code rather than embedded: embeds on this schema
    // have failed silently more than once.
    admin.from('vendor_profiles').select('id').eq('verification_status', 'verified').is('archived_at', null),
  ]);

  const verified = new Set(((verifiedIds ?? []) as Row[]).map((v) => v.id as string));

  // Open right now, mirroring `store_accepting_orders`: switched on and not
  // inside a cooldown.
  const now = Date.now();
  const openNow = ((openStores ?? []) as Row[]).filter(
    (s) =>
      verified.has(s.vendor_id) &&
      s.is_accepting_orders &&
      (!s.paused_until || new Date(s.paused_until).getTime() <= now),
  ).length;

  const roomsFree = ((availability ?? []) as Row[]).reduce(
    (sum, a) => sum + (a.rooms_available ?? 0),
    0,
  );

  // The laundry card needs the vendor's name, and `services.vendor_id` points
  // at vendor_profiles   fetched separately rather than embedded, because
  // embeds on this schema have failed silently more than once.
  let laundryCard: AroundData['laundry'] = null;
  // The cheapest price among VERIFIED vendors. Rows arrive cheapest-first, so
  // the first one that qualifies is the answer.
  const laundry = ((laundryRows ?? []) as Row[]).find((r) => verified.has(r.vendor_id)) ?? null;
  if (laundry) {
    const { data: v } = await admin
      .from('vendor_profiles')
      .select('business_name, slug')
      .eq('id', (laundry as Row).vendor_id)
      .maybeSingle();
    if (v) {
      laundryCard = {
        perPieceNaira: naira(Number((laundry as Row).price_kobo)),
        vendorName: (v as Row).business_name,
        slug: (v as Row).slug,
      };
    }
  }

  // ── The one personal item on the page ───────────────────────────────────
  // Read as the STUDENT, not the service role: this is their booking, and
  // `bookings` RLS is what guarantees we cannot show them somebody else's.
  let resume: AroundData['resumeBooking'] = null;
  if (userId) {
    const { data: booking } = await db
      .from('bookings')
      .select('hostel_id, price_per_session_kobo, status')
      // Same trap as fetchMyBookings: `bookings_select_own` also admits the
      // LANDLORD of the hostel, so without this a landlord's "pick up where you
      // left off" nudge offers them a tenant's booking as their own. `userId` was
      // already in scope and only used to decide whether to run the query.
      .eq('student_id', userId)
      .in('status', ['interested', 'awaiting_payment'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (booking) {
      const [{ data: hostel }, { data: avail }] = await Promise.all([
        admin
          .from('hostels')
          .select('slug, name, price_per_session_kobo')
          .eq('id', (booking as Row).hostel_id)
          .maybeSingle(),
        admin
          .from('hostel_availability')
          .select('rooms_available')
          .eq('hostel_id', (booking as Row).hostel_id)
          .maybeSingle(),
      ]);
      if (hostel) {
        resume = {
          hostelSlug: (hostel as Row).slug,
          hostelName: (hostel as Row).name,
          roomsLeft: (avail as Row)?.rooms_available ?? 0,
          priceNaira: naira(
            Number((booking as Row).price_per_session_kobo ?? (hostel as Row).price_per_session_kobo),
          ),
        };
      }
    }
  }

  return {
    verifiedSpots: (verifiedHostels ?? 0) + (verifiedVendors ?? 0),
    // Three numbers a student can act on, all of which the database can
    // actually answer. The originals were a room count for a hostel they had
    // not booked, an attendance figure nothing tracks, and a delivery ETA
    // nothing computes.
    quickStats: [
      { value: String(roomsFree), label: 'rooms free right now', accent: roomsFree > 0 },
      { value: String(openNow), label: 'stores taking orders' },
      { value: String(upcomingEvents ?? 0), label: 'events coming up' },
    ],
    hotspots: ((hotspots ?? []) as Row[]).map((h) => ({
      slug: h.slug,
      name: h.name,
      meta: [h.area, h.category].filter(Boolean).join(' · ') || 'Hotspot',
    })),
    sponsored: banner
      ? {
          brand: (banner as Row).title,
          body: (banner as Row).subtitle ?? '',
          ctaLabel: 'Find out more',
          ctaHref: (banner as Row).href ?? '#',
        }
      : null,
    laundry: laundryCard,
    resumeBooking: resume,
  };
}
