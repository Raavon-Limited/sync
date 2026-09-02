/**
 * What a landlord's own screens read, from the tables that hold it.
 *
 * REPLACES A MOCK LAYER, AND THAT IS THE WHOLE POINT
 *   The properties, earnings and bookings screens arrived from the landlord
 *   branch reading `@/mock/StatsCard` and persisting through
 *   `lib/landlord-properties.ts` into **localStorage**. The screens looked
 *   finished and were not connected to anything: a hostel added on a phone did
 *   not exist on a laptop, never reached a reviewer, and could never be booked.
 *   Every function here answers the same question the mock answered, from
 *   `hostels`, `bookings`, `hostel_availability` and `wallet_transactions`.
 *
 * RLS DOES THE SCOPING, NOT A WHERE CLAUSE ALONE
 *   These run on the request-scoped client, as the landlord. `hostels` is
 *   filtered by landlord_id here as well   belt and braces, and it keeps the
 *   query honest about its own intent   but the policy is what makes it safe.
 *
 * KOBO IN, NAIRA OUT
 *   The database stores kobo. The components render naira. The conversion
 *   happens once, here, at the boundary   see landlord-types.
 */
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/supabase/row';
import type {
  BookingRequest,
  EarningsPoint,
  PaymentStatus,
  Property,
  Tenant,
  Transaction,
  TransactionStatus,
} from './landlord-types';

const naira = (kobo: number | null | undefined) => Math.round(Number(kobo ?? 0) / 100);

/** Statuses that mean somebody is actually living there. */
const TENANTED = new Set(['confirmed', 'paid', 'active', 'completed']);
/** Statuses that mean the landlord still has a decision to make. */
const PENDING = new Set(['requested', 'pending', 'awaiting_payment', 'awaiting_approval']);

/**
 * Every hostel this landlord lists, with how much of it is taken.
 *
 * `hostel_availability` is the view that already knows what is free; counting
 * bookings again here would be a second definition of "occupied" and the two
 * would disagree the first time a booking was cancelled.
 */
export async function getLandlordProperties(landlordId: string): Promise<Property[]> {
  const db = await createClient();

  const { data: hostels } = await db
    .from('hostels')
    .select(
      'id, slug, name, area, address, room_type, amenities, price_per_session_kobo, verified, created_at',
    )
    .eq('landlord_id', landlordId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  const rows = (hostels ?? []) as Row[];
  if (rows.length === 0) return [];

  const ids = rows.map((h) => h.id as string);
  const { data: availability } = await db
    .from('hostel_availability')
    .select('*')
    .in('hostel_id', ids);

  const freeByHostel = new Map<string, { free: number; total: number }>();
  for (const a of (availability ?? []) as Row[]) {
    const id = a.hostel_id as string;
    const prev = freeByHostel.get(id) ?? { free: 0, total: 0 };
    freeByHostel.set(id, {
      free: prev.free + Number(a.rooms_free ?? a.free ?? 0),
      total: prev.total + Number(a.rooms_total ?? a.total ?? 0),
    });
  }

  return rows.map((h): Property => {
    const counts = freeByHostel.get(h.id as string) ?? { free: 0, total: 0 };
    const booked = Math.max(0, counts.total - counts.free);

    return {
      id: h.id as string,
      slug: h.slug as string,
      name: (h.name as string) ?? 'Unnamed hostel',
      roomsTotal: counts.total,
      roomsBooked: booked,
      // A hostel a reviewer has not been to yet is not "Inactive"   it is
      // listed and unverified, which the verified flag says on its own.
      status: 'Active',
      address: (h.address as string) ?? undefined,
      area: (h.area as string) ?? null,
      price: naira(h.price_per_session_kobo as number),
      term: 'per session',
      roomType: (h.room_type as string) ?? undefined,
      amenities: (h.amenities as string[]) ?? undefined,
      availability:
        counts.total === 0 ? 'review' : booked >= counts.total ? 'occupied' : 'available',
      verified: h.verified === true,
    };
  });
}

/** Everyone who has asked to move in and is still waiting on an answer. */
export async function getLandlordRequests(landlordId: string): Promise<BookingRequest[]> {
  const db = await createClient();
  const rows = await bookingsFor(db, landlordId);

  return rows
    .filter((b) => PENDING.has(String(b.status)))
    .map(
      (b): BookingRequest => ({
        id: b.id as string,
        name: personName(b),
        propertyId: b.hostel_id as string,
        property: hostelName(b),
        requestedMoveIn: (b.move_in as string) ?? (b.requested_at as string) ?? '',
        amount: naira(b.price_per_session_kobo as number),
        studentVerified: studentVerified(b),
        submitted: (b.requested_at as string) ?? (b.created_at as string),
        status: b.status as string,
      }),
    );
}

/** Everyone actually in a room. */
export async function getLandlordTenants(landlordId: string): Promise<Tenant[]> {
  const db = await createClient();
  const rows = await bookingsFor(db, landlordId);

  const live = rows.filter((b) => TENANTED.has(String(b.status)));

  return live.map((b): Tenant => {
    const student = (b.student as Row | null) ?? null;
    return {
      id: b.id as string,
      name: personName(b),
      // Contact details come from the profile row, which RLS lets a landlord
      // read for somebody booked into their own hostel and nobody else.
      email: (student?.email as string) ?? '',
      phone: (student?.phone as string) ?? '',
      school: (student?.campus_other as string) ?? '',
      studentVerified: studentVerified(b),
      propertyId: b.hostel_id as string,
      property: hostelName(b),
      moveIn: (b.move_in as string) ?? (b.created_at as string),
      leaseEnd: (b.end_date as string) ?? '',
      paymentStatus: paymentStatus(b),
      // Every other stay this person has had with THIS landlord. It is the
      // question a landlord actually asks about a returning tenant.
      bookingHistory: rows
        .filter((o) => o.student_id === b.student_id && o.id !== b.id)
        .map((o) => ({
          property: hostelName(o),
          period: String((o.move_in as string) ?? (o.created_at as string)).slice(0, 10),
        })),
    };
  });
}

export interface LandlordEarnings {
  /** Naira. */
  available: number;
  pending: number;
  monthly: EarningsPoint[];
  transactions: Transaction[];
}

/**
 * The money, from the ledger rather than from the bookings.
 *
 * A confirmed booking is a promise; a wallet entry is money that moved. Reading
 * bookings here would flatter the number   the same reasoning the overview's
 * revenue chart already follows.
 */
export async function getLandlordEarnings(landlordId: string): Promise<LandlordEarnings> {
  const db = await createClient();

  const [{ data: ledger }, bookings] = await Promise.all([
    // RLS scopes wallet_transactions to the caller's own wallet.
    db
      .from('wallet_transactions')
      .select('id, kind, direction, amount_kobo, narrative, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    bookingsFor(db, landlordId),
  ]);

  const entries = (ledger ?? []) as Row[];

  let available = 0;
  let pending = 0;
  for (const e of entries) {
    const amount = naira(e.amount_kobo as number);
    if (e.direction === 'credit') available += amount;
    else if (e.direction === 'debit') available -= amount;
    if (String(e.kind).includes('escrow')) pending += amount;
  }

  // Twelve months, oldest first, so the chart reads left to right.
  const months = new Map<string, number>();
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.set(d.toLocaleString('en-NG', { month: 'short' }), 0);
  }
  for (const e of entries) {
    if (e.direction !== 'credit') continue;
    const label = new Date(e.created_at as string).toLocaleString('en-NG', { month: 'short' });
    if (months.has(label))
      months.set(label, (months.get(label) ?? 0) + naira(e.amount_kobo as number));
  }

  const paidBookings = bookings.filter((b) => b.paid_at != null);

  return {
    available: Math.max(0, available),
    pending,
    monthly: [...months].map(([period, amount]) => ({ period, amount })),
    // The ledger says how much; the booking says who and where. Joined here
    // because a statement line that cannot name the tenant is unreadable.
    transactions: paidBookings.slice(0, 50).map(
      (b): Transaction => ({
        id: b.id as string,
        date: (b.paid_at as string) ?? (b.created_at as string),
        tenant: personName(b),
        property: hostelName(b),
        amount: naira(b.price_per_session_kobo as number),
        status: transactionStatus(b),
      }),
    ),
  };
}

// ── Shared reads ───────────────────────────────────────────────────────────

/**
 * Every booking against this landlord's hostels, with the student and the
 * hostel embedded.
 *
 * One query for four screens: requests, tenants, earnings and the overview all
 * ask about the same rows through different filters, and four separate reads
 * would be four chances for them to disagree about what "confirmed" means.
 */
async function bookingsFor(
  db: Awaited<ReturnType<typeof createClient>>,
  landlordId: string,
): Promise<Row[]> {
  const { data: hostels } = await db
    .from('hostels')
    .select('id')
    .eq('landlord_id', landlordId)
    .is('archived_at', null);

  const ids = ((hostels ?? []) as Row[]).map((h) => h.id as string);
  if (ids.length === 0) return [];

  const { data } = await db
    .from('bookings')
    .select(
      'id, hostel_id, student_id, status, move_in, end_date, created_at, requested_at, paid_at, price_per_session_kobo, hostel:hostels(name, area), student:profiles(full_name, phone, campus_other, verification_status)',
    )
    .in('hostel_id', ids)
    .order('created_at', { ascending: false });

  return (data ?? []) as Row[];
}

function hostelName(b: Row): string {
  return ((b.hostel as Row | null)?.name as string) ?? 'A hostel';
}

function personName(b: Row): string {
  return ((b.student as Row | null)?.full_name as string) ?? 'A student';
}

/**
 * Whether Sync has checked who this person is.
 *
 * Read from the profile, NOT decided here: it is the same badge the rest of the
 * platform shows, and a landlord deciding whether to hand over keys is exactly
 * who it was put there for.
 */
function studentVerified(b: Row): boolean {
  return ((b.student as Row | null)?.verification_status as string) === 'verified';
}

function paymentStatus(b: Row): PaymentStatus {
  if (b.paid_at != null) return 'paid';
  // Past its hold and still unpaid is overdue; inside it, simply due.
  const due = b.reserved_until ?? b.move_in;
  if (due && new Date(due as string) < new Date()) return 'overdue';
  return 'due';
}

function transactionStatus(b: Row): TransactionStatus {
  if (b.paid_at != null) return 'paid';
  if (String(b.status) === 'cancelled') return 'failed';
  return 'pending';
}
