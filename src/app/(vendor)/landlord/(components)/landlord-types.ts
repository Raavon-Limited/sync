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

import type { FeeMode } from '@/modules/hostels/types';

export type { FeeMode };

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
  /** Images only, in order   the cards render tiles, not players. */
  imageUrls?: string[];
  /** Everything on the listing, photos and video, in display order. */
  media?: { url: string; kind: 'image' | 'video' }[];
  address?: string;
  /** Naira, per `term`. */
  price?: number;
  /**
   * Who bears Sync's 2.5% on the rent   'absorb' (out of the landlord's
   * takings) or 'pass_on' (added to the student's total). See
   * 20260909090000_hostel_fee_mode.
   */
  feeMode?: FeeMode;
  term?: 'per session' | 'per year' | 'per semester';
  availability?: PropertyAvailability;
  /** A reviewer has been and confirmed it exists. */
  verified: boolean;
  area?: string | null;
  /** The landlord's own words about the place. */
  description?: string;
  /** One rule per entry, with no bullet character   the list adds those. */
  houseRules?: string[];
  /** The map pin, when the address resolved. Both or neither, never one. */
  lat?: number | null;
  lng?: number | null;
  /**
   * Fields the hostels table genuinely holds. Optional because a listing may
   * legitimately not have filled them in, never because the data is imaginary.
   */
  amenities?: string[];
  roomType?: string;
  /**
   * NOT ON `hostels`, and deliberately left undefined rather than invented.
   *
   * The branch's mock supplied a bed count, a bath count and a rating for
   * every property, and the cards render them when present. There is no column
   * behind any of them, so they arrive undefined and the cards omit that row
   * which is the honest outcome. Add the columns and populate them here; do not
   * fill them with plausible numbers.
   *
   * `houseRules` and `description` used to be in this list and have graduated
   * out of it   see 20260907150000_house_rules and
   * 20260908090000_hostel_description, which is what this comment asks for. The
   * bed and bath counts went the other way and were dropped from the cards:
   * the building type already says the bedrooms.
   */
  beds?: number;
  baths?: number;
  rating?: number;
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
  /**
   * ISO deadline of the 24h hold, or null when nothing is being held.
   *
   * Only meaningful at awaiting_payment - `bookings_sync_hold` clears it for
   * every other status, so a null here means there is no clock rather than a
   * clock we failed to read.
   */
  holdEndsAt: string | null;
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
  /** ISO date the landlord has already extended the stay to, if they have. */
  graceUntil?: string | null;
  /** The open renewal on this tenancy, from either side. */
  renewal?: { status: 'pending' | 'accepted'; initiatedBy: 'tenant' | 'landlord' } | null;
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
