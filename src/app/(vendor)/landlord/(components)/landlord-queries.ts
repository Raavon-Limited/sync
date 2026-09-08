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
      'id, slug, name, area, address, lat, lng, room_type, term, amenities, house_rules, description, price_per_session_kobo, fee_mode, verified, created_at, hostel_images(url, position, kind)',
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
      // `rooms_available`, which is what the view actually calls it. This read
      // `a.rooms_free ?? a.free`   neither exists, so free was ALWAYS 0 and
      // booked came out as total. Every hostel with rooms reported itself fully
      // occupied from the moment it was created, before anybody had booked
      // anything, and the card said so in two places at once.
      free: prev.free + Number(a.rooms_available ?? 0),
      total: prev.total + Number(a.rooms_total ?? a.total ?? 0),
    });
  }

  return rows.map((h): Property => {
    const counts = freeByHostel.get(h.id as string) ?? { free: 0, total: 0 };
    const media = (
      (h.hostel_images as { url: string; position: number; kind?: string }[] | null) ?? []
    )
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        url: i.url,
        // `kind` is pending until 20260908120000; a row without it predates
        // video and is a photo.
        kind: (i.kind === 'video' ? 'video' : 'image') as 'image' | 'video',
      }));

    // The card shows a tile, so its primary must be a PHOTO   a video has no
    // thumbnail here and would render as a black rectangle.
    const images = media.filter((m) => m.kind === 'image').map((m) => m.url);
    const booked = Math.max(0, counts.total - counts.free);

    return {
      id: h.id as string,
      slug: h.slug as string,
      name: (h.name as string) ?? 'Unnamed hostel',
      roomsTotal: counts.total,
      roomsBooked: booked,
      // WAS HARDCODED 'Active' FOR EVERY LISTING.
      //
      // Which meant the badge said the same word whatever the state of the
      // hostel   including one nobody has visited yet, which is exactly the
      // case a landlord most wants told apart. "Active" also reads as "live to
      // students", and an unverified listing is not supposed to be.
      //
      // The verified flag is the fact worth showing here, so it is the one the
      // badge shows.
      status: h.verified === true ? 'Active' : 'Inactive',
      address: (h.address as string) ?? undefined,
      area: (h.area as string) ?? null,
      lat: (h.lat as number) ?? null,
      lng: (h.lng as number) ?? null,
      houseRules: (h.house_rules as string[]) ?? [],
      description: (h.description as string) ?? undefined,
      // Ordered by `position`, so [0] is the primary image. Sorted here rather
      // than relied on from the join: PostgREST does not promise an order on an
      // embedded resource unless one is asked for.
      imageUrls: images,
      imageUrl: images[0],
      media,
      price: naira(h.price_per_session_kobo as number),
      // 'absorb' for anything written before 20260909090000   the mode that
      // adds nothing to the student's total, so an unset value cannot
      // overcharge anyone.
      feeMode: h.fee_mode === 'pass_on' ? 'pass_on' : 'absorb',
      // Was hardcoded, so a landlord who picked "Per year" was shown "Per
      // session" every time they reopened the form.
      term: h.term === 'per year' ? 'per year' : 'per session',
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
        /*
         * NO FALLBACK TO `requested_at`. It used to read
         *   (b.move_in) ?? (b.requested_at) ?? ''
         * and `move_in` is null on every booking in the database - nothing
         * collects one. So the screen took the moment the request was SENT and
         * printed it as "moving in 6 Sept 2026", inventing an agreement that
         * did not exist and putting it in front of the person deciding.
         *
         * Empty is the honest answer, and the row says so rather than showing
         * a date. Who sets a real one is an open product question: nothing in
         * the request flow asks the student for it.
         */
        requestedMoveIn: (b.move_in as string) ?? '',
        amount: naira(bookingPriceKobo(b)),
        studentVerified: studentVerified(b),
        submitted: (b.requested_at as string) ?? (b.created_at as string),
        status: b.status as string,
        holdEndsAt: (b.reserved_until as string) ?? null,
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
      // Contact details come from `booking_parties`, which discloses them only
      // for bookings on this landlord's own hostels AND only once the request
      // has been accepted - a pending request is a stranger's phone number.
      //
      // EMAIL IS ALWAYS EMPTY and always has been: `profiles` has no email
      // column, it lives on auth.users (see modules/admin/emails.ts, which
      // goes through the admin API for it). This read has been returning ''
      // for every tenant since it was written. Left here rather than deleted
      // because the Tenant type and the table column still expect the field -
      // wiring it to a real address is its own change.
      email: '',
      phone: (student?.phone as string) ?? '',
      school: (student?.campus as string) ?? '',
      studentVerified: studentVerified(b),
      propertyId: b.hostel_id as string,
      property: hostelName(b),
      moveIn: (b.move_in as string) ?? (b.created_at as string),
      leaseEnd: (b.end_date as string) ?? '',
      paymentStatus: paymentStatus(b),
      graceUntil: (b.grace_until as string) ?? null,
      // Only a request still awaiting an answer or already agreed; the join
      // returns declined and withdrawn ones too.
      renewal: (() => {
        const open = ((b.renewal as Row[] | null) ?? []).find(
          (x) => x.status === 'pending' || x.status === 'accepted',
        );
        return open
          ? {
              status: open.status as 'pending' | 'accepted',
              initiatedBy: open.initiated_by as 'tenant' | 'landlord',
            }
          : null;
      })(),
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
        // Same fallback as the requests list, and the same caveat: nothing
        // snapshots a price onto the booking, so without it every line of a
        // landlord's earnings statement reads ₦0. This is the LISTED price, not
        // a settled amount - once payments write a real figure onto the row,
        // step 1 of the chain takes over and this stops estimating.
        amount: naira(bookingPriceKobo(b)),
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
      // `reserved_until` was missing, and two things read it: the hold
      // countdown on the requests row, and `transactionStatus`, whose
      // `b.reserved_until ?? b.move_in` therefore always took the move_in
      // branch - silently, because an unselected column is undefined rather
      // than an error.
      'id, hostel_id, student_id, status, move_in, end_date, grace_until, created_at, requested_at, paid_at, reserved_until, price_per_session_kobo, room_id, renewal:renewal_requests!renewal_requests_booking_id_fkey(status, initiated_by), hostel:hostels(name, area, price_per_session_kobo), room:hostel_rooms(price_per_session_kobo)',
    )
    .in('hostel_id', ids)
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return rows;

  /*
   * THE STUDENT IS NOT AN EMBED, AND CANNOT BE.
   *
   * This select used to carry `student:profiles(full_name, phone,
   * campus_other, verification_status)`, and it returned NULL every single
   * time: `profiles` is locked to the caller's own row by
   * `profiles_select_own` (auth.uid() = id) and no policy has ever let a
   * landlord read a tenant. PostgREST does not error on an embed RLS refuses -
   * it just hands back null - so this failed silently and produced
   * "A student" for every request, blank contact details for every tenant, and
   * NOT VERIFIED for people we had in fact verified.
   *
   * `booking_parties` discloses four columns for bookings on this landlord's
   * own hostels instead. It is the same answer the inbox reached with
   * `conversation_counterparties`, for the same reason.
   */
  const { data: parties } = await db.rpc('booking_parties', {
    p_booking_ids: rows.map((r) => r.id as string),
  });

  const byBooking = new Map(((parties ?? []) as Row[]).map((p) => [p.booking_id as string, p]));

  // Re-attached under `student` so every caller below reads unchanged.
  return rows.map((r) => ({ ...r, student: byBooking.get(r.id as string) ?? null }));
}

function hostelName(b: Row): string {
  return ((b.hostel as Row | null)?.name as string) ?? 'A hostel';
}

function personName(b: Row): string {
  return ((b.student as Row | null)?.full_name as string) ?? 'A student';
}

/**
 * What this booking is worth, in kobo.
 *
 * `bookings.price_per_session_kobo` IS NULL ON EVERY ROW. Nothing snapshots a
 * price when a request is made - `createBooking` sends hostel, room and student
 * and nothing else - so reading that column alone rendered "₦0" beside every
 * request a landlord had to decide on, on hostels priced at ₦200,000+.
 *
 * The fallback chain is deliberate and ordered by specificity:
 *   1. the booking's own snapshot, once something sets it, because a price
 *      agreed at request time must not silently change if the listing is
 *      re-priced afterwards;
 *   2. the ROOM's price, which is what `hostel_room_state` bills from and is
 *      allowed to differ from the building's headline rate;
 *   3. the hostel's price.
 *
 * This is display only. The number a student is actually charged comes from
 * `quote_rent` at payment time, which also applies fee_mode - do not treat this
 * as the amount owed.
 */
function bookingPriceKobo(b: Row): number {
  return (
    (b.price_per_session_kobo as number | null) ??
    ((b.room as Row | null)?.price_per_session_kobo as number | null) ??
    ((b.hostel as Row | null)?.price_per_session_kobo as number | null) ??
    0
  );
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
