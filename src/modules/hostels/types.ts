/**
 * Domain types for the 'hostels' module.
 *
 * Replaces the mock `MockHostel` / `Hostel` shapes in src/mock/hostels.ts and
 * `StudentBooking` in src/mock/student.ts.
 *
 * Two deliberate differences from the mocks:
 *   - `moveIn` / `endDate` were human strings ("Sept 5", "Jul 30, 2027"). They
 *     are ISO dates here. Formatting belongs at render   a pre-formatted date
 *     cannot be sorted, compared, or localised.
 *   - `daysLeft` is gone. It is derived from `endDate` and goes wrong the moment
 *     the page is left open past midnight. Compute it in the component.
 */

export type BookingStatus =
  | 'interested'
  | 'requested'
  | 'awaiting_payment'
  | 'confirmed'
  | 'expired'
  | 'cancelled'
  | 'completed';

export type RoomType = 'Self-contain' | 'Sharing' | 'Female only' | 'Male only';

export type Availability = 'draft' | 'available' | 'filling_up' | 'full';

export interface Area {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  sortOrder: number;
}

export interface HostelImage {
  id: string;
  url: string;
  position: number;
}

export interface HostelRoom {
  id: string;
  label: string;
  /** Null on the row means "inherit the hostel price"; resolved here. */
  priceKobo: number;
  isListed: boolean;
  state?: 'free' | 'held' | 'taken';
}

/**
 * Who bears Sync's 2.5% on the rent. Mirrors `hostels.fee_mode`
 * (20260909090000) and `events.fee_mode`   one concept, one vocabulary.
 *
 *   absorb   the student pays the listed rent; the charge comes out of what the
 *            landlord is paid when the rent releases.
 *   pass_on  the charge is added to the student's total; the landlord keeps the
 *            listed rent in full.
 */
export type FeeMode = 'absorb' | 'pass_on';

export interface Hostel {
  id: string;
  landlordId: string;
  name: string;
  slug: string;
  address?: string | null;
  landmark?: string | null;
  area: string;
  campus: string;
  roomType: RoomType;
  /**
   * What the price buys: one session (8 months) or one year.
   *
   * The landlord has been choosing this on the property form since it was
   * built and it was never persisted - no column, never sent, and read back as
   * the hardcoded string 'per session'. It decides a tenancy's end date; see
   * 20260913120000.
   */
  term?: LeaseTerm;
  pricePerSessionKobo: number;
  /**
   * What a VISIT costs, if the student books one. It is not part of the rent
   * and is never added to a booking total   see `modules/hostels/pricing`.
   */
  inspectionFeeKobo: number;
  feeMode: FeeMode;
  distanceMinutes?: number | null;
  amenities: string[];
  houseRules: string[];
  /** The landlord's own words. Null when they have not written any. */
  description?: string | null;
  /** The map pin. Both or neither   the schema enforces that pairing. */
  lat?: number | null;
  lng?: number | null;
  isVerified: boolean;
  ribbon?: string | null;
  images: HostelImage[];
  rooms: HostelRoom[];
  roomsAvailable?: number;
  roomsTotal?: number;
  availability?: Availability;
}

/** Result row of the `hostels_near` RPC   a lighter shape than a full hostel. */
export interface NearbyHostel {
  id: string;
  name: string;
  slug: string;
  area: string;
  pricePerSessionKobo: number;
  roomsAvailable: number;
  availability: Availability;
  distanceM: number;
}

export type LeaseTerm = 'per session' | 'per year';

export interface Booking {
  id: string;
  studentId: string;
  hostelId: string;
  hostelName?: string | null;
  hostelArea?: string | null;
  hostelImageUrl?: string | null;
  roomId?: string | null;
  roomLabel?: string | null;
  status: BookingStatus;
  /** Set while a hold is live. After this passes the hold lapses. */
  reservedUntil?: string | null;
  /**
   * When the landlord accepted. This is the landlord's CONSENT, and it is what
   * the tenancy agreement attests to - Sync collects no signatures, so the
   * timestamped act is the record. Set by `bookings_sync_hold`.
   */
  lockedAt?: string | null;
  /** Landlord-granted extension past end_date, if there is one. */
  graceUntil?: string | null;
  /**
   * When the student accepted the tenancy terms. NULL blocks payment -
   * `bookings_require_terms` refuses the move to `confirmed` without it.
   */
  agreementAcceptedAt?: string | null;
  /** The landlord's own agreement document, if they uploaded one. */
  hostelAgreementUrl?: string | null;
  /**
   * The OPEN renewal on this tenancy, if either party has asked.
   *
   * A renewal is not a booking until the current term ends - the per-room
   * unique index will not hold two live bookings on one room. See
   * 20260914120000.
   */
  renewal?: { status: 'pending' | 'accepted'; initiatedBy: 'tenant' | 'landlord' } | null;
  moveIn?: string | null;
  endDate?: string | null;
  pricePerSessionKobo?: number | null;
  paidAt?: string | null;
  /** The LANDLORD says this tenant is in. A prompt, not a gate. */
  movedInAt?: string | null;
  /** The STUDENT confirms. This is what closes the 72h refund window. */
  moveInConfirmedAt?: string | null;
  /** For linking back to the listing, e.g. to book a viewing. */
  hostelSlug?: string | null;
  /** The listing's own viewing fee, for the "book a viewing" button on a card. */
  inspectionFeeKobo?: number | null;
  /** Whose listing it is. Null only when the join was not asked for. */
  hostelLandlordId?: string | null;
  requestedAt?: string | null;
  createdAt: string;
}

export interface Inspection {
  id: string;
  hostelId: string;
  hostelName?: string | null;
  bookingId?: string | null;
  scheduledFor: string;
  status: string;
  /** The agent's, in full   Sync takes no commission on an inspection. */
  feeKobo: number;
  /** Where the agent will meet the student. Null means at the property. */
  meetingPoint?: string | null;
  /** The time an agent OFFERED. Nothing is arranged until it is confirmed. */
  proposedFor?: string | null;
  /** The student accepted that offer. */
  studentConfirmedAt?: string | null;
  agentName?: string | null;
  reportFiledAt?: string | null;
  /** The student says it did not happen; the fee is held for staff. */
  disputedAt?: string | null;
  createdAt: string;
}
