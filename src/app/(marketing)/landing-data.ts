/**
 * The three showcase cards on the public landing page.
 *
 * This is the shop window: the first thing anyone sees, and until now it
 * advertised a Fresher's Night that was never scheduled, a restaurant nobody
 * runs, and "84 here now" at a lounge with no check-in system.
 *
 * WHAT IS NOT HERE, BECAUSE NOTHING BACKS IT
 *   - `etaMinutes` — no delivery-time model exists. `orders.eta_minutes` is
 *     nullable and nothing computes it.
 *   - `hereCount` — live headcount needs check-ins, and no table records them.
 *   Both are replaced by facts the row actually carries.
 *
 * SERVICE ROLE, PUBLIC FIELDS ONLY
 *   Signed-out visitors see this page, so it cannot depend on a session. Only
 *   columns already readable by `anon` are selected — the service role is here
 *   to avoid needing cookies, not to reach anything private.
 */
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

const naira = (kobo: number) => Math.round(kobo / 100);

import type { Row } from '@/lib/supabase/row';

export interface LandingHostel {
  slug: string;
  name: string;
  location: string;
  image: string;
  pricePerSession: number;
  verified: boolean;
  ribbon?: string | null;
  amenities: string[];
}

/** One card in the rotating hero. Every one links somewhere that exists. */
export interface Highlight {
  id: string;
  service: string;
  title: string;
  meta: string;
  image: string;
  href: string;
}

export interface LandingShowcase {
  /**
   * The hero pool. Built from real rows because the hardcoded one linked to
   * /hostels/woss-hostel, /hostels/la-marida-malete and /hostels/amina-villa —
   * three slugs that do not exist. The largest card on the public homepage was
   * a 404.
   */
  highlights: Highlight[];
  /** Verified hostels for the featured strip, and the count beside it. */
  hostels: LandingHostel[];
  verifiedHostelCount: number;
  event: { slug: string; title: string; when: string; venue: string } | null;
  food: { slug: string; name: string; meta: string; rating: number | null } | null;
  hotspot: { slug: string; name: string; meta: string } | null;
}

/**
 * The empty shop window.
 *
 * Every card on the landing page already hides itself when its datum is null,
 * so this renders a complete, honest page with no rows behind it - not a
 * broken one.
 */
const EMPTY_SHOWCASE: LandingShowcase = {
  highlights: [],
  hostels: [],
  verifiedHostelCount: 0,
  event: null,
  food: null,
  hotspot: null,
};

/**
 * Wraps the real read so a Supabase outage degrades the landing page rather
 * than taking it down.
 *
 * Its siblings (around-data, around/server-queries) already do this; this one
 * did not - and it is the PUBLIC HOME PAGE, the least acceptable place in the
 * app to throw. It also fails the production BUILD rather than just a request:
 * `/` is prerendered, so an unreachable database or a missing
 * SUPABASE_SERVICE_ROLE_KEY aborts `next build` outright. That is exactly what
 * it did on CI, where no .env.local exists.
 */
export async function getLandingShowcase(): Promise<LandingShowcase> {
  try {
    return await readLandingShowcase();
  } catch (err) {
    console.error('[landing] showcase read failed, rendering empty:', err);
    return EMPTY_SHOWCASE;
  }
}

async function readLandingShowcase(): Promise<LandingShowcase> {
  const db = createAdminClient();
  const now = new Date().toISOString();

  const [{ data: event }, { data: store }, { data: hotspot }, { data: hostels }, { count: verifiedHostels }] =
    await Promise.all([
    // The soonest event still ahead of us. An event in the past is not a
    // showcase, it is an apology.
    db
      .from('events')
      .select('slug, name, venue, starts_at, cover_url')
      .gt('starts_at', now)
      .order('starts_at')
      .limit(1)
      .maybeSingle(),
    // A store, not a brand: the landing card links to a place you can order
    // from, and a brand with three shops is three places.
    db
      .from('storefronts')
      .select('slug, name, area, vendor_id')
      .is('archived_at', null)
      .eq('is_accepting_orders', true)
      .limit(1)
      .maybeSingle(),
    db
      .from('hotspots')
            .select('slug, name, area, category, image_url')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('sort_order')
      .limit(1)
      .maybeSingle(),
    // Verified first: the strip is the argument for the platform, and an
    // unverified room is the thing it exists to protect students from.
    db
      .from('hostels')
      .select('slug, name, area, landmark, price_per_session_kobo, ribbon, amenities, verified, hostel_images(url, position)')
      .is('archived_at', null)
      .order('verified', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3),
    db
      .from('hostels')
      .select('*', { count: 'exact', head: true })
      .eq('verified', true)
      .is('archived_at', null),
  ]);

  // The brand's name and rating live on vendor_profiles; fetched separately
  // because embeds on this schema have silently returned nothing before.
  let food: LandingShowcase['food'] = null;
  if (store) {
    const { data: brand } = await db
      .from('vendor_profiles')
      .select('business_name, category, rating_avg, rating_count')
      .eq('id', (store as Row).vendor_id)
      .maybeSingle();
    if (brand) {
      food = {
        slug: (store as Row).slug,
        name: (brand as Row).business_name,
        meta: [(store as Row).area, (brand as Row).category].filter(Boolean).join(' · '),
        // A rating nobody has given is not 0 stars, it is no rating. The card
        // omits it rather than showing a business as badly reviewed.
        rating: (brand as Row).rating_count > 0 ? Number((brand as Row).rating_avg) : null,
      };
    }
  }

  const hostelCards = ((hostels ?? []) as Row[])
    .filter((h) => (h.hostel_images ?? []).length > 0)
    .map((h): Row => ({
      ...h,
      image: [...(h.hostel_images as Row[])].sort((a, b) => a.position - b.position)[0].url,
    }));

  // Only rows that have BOTH a picture and a real destination. A hero card
  // without an image is a grey box; one without a live slug is a 404.
  const highlights: Highlight[] = [
    ...hostelCards.map((h) => ({
      id: `hostel-${h.slug}`,
      service: 'Hostel',
      title: h.name,
      meta: `₦${naira(Number(h.price_per_session_kobo)).toLocaleString('en-NG')} / session`,
      image: h.image,
      href: `/hostels/${h.slug}`,
    })),
    ...(event && (event as Row).cover_url
      ? [
          {
            id: `event-${(event as Row).slug}`,
            service: 'Event',
            title: (event as Row).name,
            meta: (event as Row).venue ?? 'Venue to be announced',
            image: (event as Row).cover_url as string,
            href: `/events/${(event as Row).slug}`,
          },
        ]
      : []),
    ...(hotspot && (hotspot as Row).image_url
      ? [
          {
            id: `hotspot-${(hotspot as Row).slug}`,
            service: 'Hot spot',
            title: (hotspot as Row).name,
            meta: (hotspot as Row).area ?? 'Hot spot',
            image: (hotspot as Row).image_url as string,
            href: `/hotspots/${(hotspot as Row).slug}`,
          },
        ]
      : []),
  ];

  return {
    highlights,
    verifiedHostelCount: verifiedHostels ?? 0,
    // A card with no photo is worse than one fewer card on a page whose whole
    // job is to look trustworthy.
    hostels: hostelCards.map((h): LandingHostel => ({
        slug: h.slug,
        name: h.name,
        location: h.landmark ?? h.area,
        image: h.image,
        pricePerSession: naira(Number(h.price_per_session_kobo)),
        // No rating field at all. `hostels` carries no rating columns, and
        // `reviews` is polymorphic — aggregating it per card would be a second
        // query for a number that is better absent than zero. ListingCard's
        // `rating` prop is optional precisely so it can be omitted, and a
        // hostel showing zero stars reads as badly reviewed rather than new.
        verified: !!h.verified,
        ribbon: h.ribbon,
        amenities: (h.amenities ?? []) as string[],
      })),
    event: event
      ? {
          slug: (event as Row).slug,
          title: (event as Row).name,
          when: new Date((event as Row).starts_at).toLocaleDateString('en-NG', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }),
          venue: (event as Row).venue ?? 'Venue to be announced',
        }
      : null,
    food,
    hotspot: hotspot
      ? {
          slug: (hotspot as Row).slug,
          name: (hotspot as Row).name,
          meta:
            [(hotspot as Row).area, (hotspot as Row).category].filter(Boolean).join(' · ') ||
            'Hot spot',
        }
      : null,
  };
}
