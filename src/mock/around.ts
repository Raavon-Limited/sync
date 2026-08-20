/**
 * Mock data for the /around home hub - modelled on the hi-fi design guide
 * section 02 / Around you Â· Home Hub. Realistic Tanke / KWASU / UNILORIN copy.
 *
 * Other devs own the real hostel/event/food modules - when their queries
 * land, swap each block here for their module's live query.
 */

// â”€â”€â”€ Personalisation (mocked) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const MOCK_USER = {
  name: 'Aisha',
  hostel: 'Woss Hostel',
  campus: 'KWASU, Malete',
};

// VERIFIED_SPOTS_COUNT removed - /around now reads the real count via
// countVerifiedHostels() in @/modules/hostels/queries.

// â”€â”€â”€ Quick stats (right side of hero) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const QUICK_STATS = [
  { value: '3', label: 'rooms left, Woss Hostel', accent: true },
  { value: '240', label: 'students going tonight' },
  { value: '28 min', label: 'delivery, Mama Put Malete' },
];

// â”€â”€â”€ Featured event (left column hero card) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const FEATURED_EVENT = {
  slug: 'freshers-night-26',
  title: "Fresher's Night",
  performer: 'Phyno live',
  category: 'Concert Â· 18+',
  venue: 'KWASU Sports Hall Â· 3 min walk',
  when: 'Tonight Â· 8pm',
  priceFrom: 3500,
  goingCount: 240,
  friendsGoing: 38,
};

// â”€â”€â”€ Food card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const FEATURED_FOOD = {
  slug: 'mama-put-malete',
  name: 'Mama Put Malete',
  etaMinutes: 20,
  rating: 4.8,
  priceTier: 'â‚¦',
  cuisine: 'Jollof Â· amala Â· gizdodo',
  promos: ['2-for-1 today', 'Free delivery'],
  priceFrom: 800,
};

// â”€â”€â”€ Laundry promo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const LAUNDRY_PROMO = {
  headlineParts: { lead: 'Drop a bag,', tail: 'get it back', accent: 'Sunday.' },
  perPiecePrice: 150,
  pickupLine: 'Free pickup',
  nextSlot: '4pm',
};

// â”€â”€â”€ Sponsored slot (MTN) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const SPONSORED_SLOT = {
  brand: 'MTN',
  headlineLead: '500MB free',
  headlineTail: 'every Saturday.',
  body: 'For KWASU students. Dial *345*99# to claim.',
  ctaLabel: 'Claim now',
  ctaHref: 'tel:*345*99#',
};

// â”€â”€â”€ Hotspots trending â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const HOTSPOTS_TRENDING = [
  {
    slug: 'cuisine-and-co-lounge',
    name: 'Cuisine & Co. Lounge',
    meta: 'Basin Â· â‚¦â‚¦',
    hereCount: 84,
  },
  {
    slug: 'suya-spot-malete',
    name: 'Suya Spot Malete',
    meta: 'Junction Â· â‚¦',
    hereCount: 42,
  },
  {
    slug: 'asun-and-chill',
    name: 'Asun & Chill',
    meta: 'Town Â· â‚¦â‚¦',
    hereCount: 31,
  },
];

// â”€â”€â”€ Hostel board posts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const HOSTEL_BOARD = {
  hostel: 'Woss Hostel',
  posts: [
    { id: '1', title: 'Anyone going to the night market? ðŸ›’', author: 'Aisha', age: '5m' },
    { id: '2', title: 'Lost: blue ID near gate', author: 'David', age: '1h' },
    { id: '3', title: 'Free firewood-jollof on the corner', author: 'Yetunde', age: '2h' },
  ],
};

// â”€â”€â”€ Resume booking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const RESUME_BOOKING = {
  hostelSlug: 'woss-hostel',
  hostelName: 'Woss Hostel',
  roomsLeft: 3,
  pricePerYear: 200_000,
};

// â”€â”€â”€ Malete areas (location dropdown in the services dock) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// NOT mock: these are real reference data and back the `area` CHECK constraint
// on `hostels`. They live in @/lib/constants/areas and are re-exported here so
// existing imports keep working - import from the constants module in new code.
//
// Note the old list said 'Safari, Malete' while mock/hostels.ts said 'Safari'.
// The two disagreed, so nothing could join on area. 'Safari' wins - it matches
// the hostel data and the DB constraint.
// AREA_COORDS is gone: coordinates live in the `areas` table now, so a static
// name->coords map can't be the source of truth. Use areaCoords(name, areas)
// with the list from listAreas(), or FALLBACK_AREAS when off-line.
export { MALETE_AREAS, FALLBACK_AREAS, areaCoords, type MaleteArea } from '@/lib/constants/areas';

// â”€â”€â”€ Nearby map drop-points (stylised spatial view) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Mock geo for the AroundMap. `x`/`y` are positions on the mock surface as a
// percentage (0â€“100); `distance` is how far from the student. Swap for real
// coordinates when the map SDK + geo data land.
export type NearbyCategory =
  | 'hostel'
  | 'food'
  | 'event'
  | 'hotspot'
  | 'beauty'
  | 'workmanship'
  | 'laundry';


// NearbyPin / NEARBY_PINS removed - the AroundMap now receives real pins
// from listMapPins() in @/modules/around/queries (see MapPin there).
// NearbyCategory above is still used by the map legend.
