/**
 * The shapes the landlord screens are drawn from, and the formatters they share.
 *
 * WHY THIS IS SEPARATE FROM `landlord-data.ts`
 *   That file is `server-only`: it holds the queries and must never reach the
 *   browser. Every screen below it is a client component that needs the TYPES
 *   and a currency formatter, and a client importing anything out of a
 *   server-only module fails the build. Same split as account-types.ts.
 *
 * THESE TYPES USED TO COME WITH THEIR OWN DATA
 *   They arrived from the landlord branch as `lib/landlord-data.ts`, where each
 *   type sat beside a hardcoded array of example rows - four tenants, eight
 *   months of earnings, a bank account. The shapes were right; the data was
 *   invented, and the properties screen persisted edits to `localStorage`,
 *   which means a hostel added on a phone did not exist on a laptop and never
 *   reached a reviewer. The arrays are gone and `landlord-data.ts` fills these
 *   same shapes from the tables that already hold the real thing.
 *
 * MONEY IS IN NAIRA HERE, NOT KOBO
 *   The database stores kobo, because money in floats is how money goes
 *   missing. These types are what a component renders, and the conversion
 *   happens once at the boundary in landlord-data.ts.
 */

export type PropertyAvailability = 'available' | 'occupied' | 'review';

export interface Property {
  id: string;
  /** The hostel's slug, for linking at the public page. */
  slug: string;
  name: string;
  roomsTotal: number;
  roomsBooked: number;
  status: 'Active' | 'Inactive';
  imageUrl?: string;
  imageUrls?: string[];
  address?: string;
  /** Naira, per `term`. */
  price?: number;
  term?: 'per session' | 'per year' | 'per semester';
  availability?: PropertyAvailability;
  /** A reviewer has been and confirmed it exists. */
  verified: boolean;
  area?: string | null;
  /**
   * Fields the hostels table genuinely holds. Optional because a listing may
   * legitimately not have filled them in, never because the data is imaginary.
   */
  amenities?: string[];
  roomType?: string;
  /**
   * NOT ON `hostels`, and deliberately left undefined rather than invented.
   *
   * The branch's mock supplied a bed count, a bath count, a rating and house
   * rules for every property, and the cards render them when present. There is
   * no column behind any of them yet, so they arrive undefined and the cards
   * omit that row   which is the honest outcome. Add the columns and populate
   * them here; do not fill them with plausible numbers.
   */
  beds?: number;
  baths?: number;
  rating?: number;
  description?: string;
  houseRules?: string[];
}

export type PaymentStatus = 'paid' | 'due' | 'overdue';

export interface BookingRequest {
  id: string;
  name: string;
  propertyId: string;
  property: string;
  requestedMoveIn: string;
  /** Naira. */
  amount: number;
  /** Whether Sync has checked who they say they are. */
  studentVerified: boolean;
  submitted: string;
  status: string;
}

export interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string;
  school: string;
  studentVerified: boolean;
  propertyId: string;
  property: string;
  moveIn: string;
  leaseEnd: string;
  paymentStatus: PaymentStatus;
  bookingHistory: { property: string; period: string }[];
}

export type EarningsPoint = { period: string; amount: number };

export type TransactionStatus = 'paid' | 'pending' | 'failed';

export interface Transaction {
  id: string;
  date: string;
  tenant: string;
  property: string;
  /** Naira. */
  amount: number;
  status: TransactionStatus;
}

export type PayoutMethod = {
  bankName: string;
  accountName: string;
  accountNumber: string;
} | null;

// ── Formatting ─────────────────────────────────────────────────────────────

export function formatNaira(amount: number, compact = false): string {
  if (compact) {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
