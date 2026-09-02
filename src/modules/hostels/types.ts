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
  pricePerSessionKobo: number;
  inspectionFeeKobo: number;
  distanceMinutes?: number | null;
  amenities: string[];
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
  moveIn?: string | null;
  endDate?: string | null;
  pricePerSessionKobo?: number | null;
  paidAt?: string | null;
  requestedAt?: string | null;
  createdAt: string;
}

export interface Inspection {
  id: string;
  hostelId: string;
  hostelName?: string | null;
  bookingId?: string | null;
  scheduledFor: string;
  status: 'pending_payment' | 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  createdAt: string;
}
