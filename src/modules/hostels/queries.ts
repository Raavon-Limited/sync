/**
 * Data access for the 'hostels' module.
 *
 * Backs /hostels, /hostels/[slug], the student bookings list, and the landlord
 * side of /admin/landlord.
 *
 * A note on availability: `hostel_availability` and `hostel_room_state` are
 * views defined in 0006 that already compute rooms_free / filling_up / full
 * from live holds. Never recompute that client-side   a hold expires on a
 * timestamp, so any count derived in JavaScript is wrong the moment it renders.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { unwrap, unwrapList, unwrapMaybe, toRange, type PageParams } from '@/lib/query/helpers';
import type { Area, Availability, Booking, Hostel, Inspection, NearbyHostel } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- see lib/query/helpers.ts */
type Row = any;
type Client = SupabaseClient<Database>;

// ── Mappers ────────────────────────────────────────────────────────────────

const toHostel = (r: Row): Hostel => ({
  id: r.id,
  landlordId: r.landlord_id,
  name: r.name,
  slug: r.slug,
  address: r.address,
  landmark: r.landmark,
  area: r.area,
  campus: r.campus,
  roomType: r.room_type,
  pricePerSessionKobo: Number(r.price_per_session_kobo ?? 0),
  inspectionFeeKobo: Number(r.inspection_fee_kobo ?? 0),
  // 'absorb' is both the column default and the safe read for a row from
  // before 20260909090000: it is the mode that adds nothing to the student's
  // total, so a missing value can never overcharge somebody.
  feeMode: r.fee_mode === 'pass_on' ? 'pass_on' : 'absorb',
  distanceMinutes: r.distance_minutes,
  amenities: r.amenities ?? [],
  houseRules: r.house_rules ?? [],
  description: r.description ?? null,
  lat: r.lat ?? null,
  lng: r.lng ?? null,
  isVerified: !!r.verified,
  ribbon: r.ribbon,
  images: (r.hostel_images ?? [])
    // Photos only. A video row has no thumbnail, so it renders as a black
    // rectangle in a gallery tile   the player belongs to the detail view.
    .filter((i: Row) => i.kind !== 'video')
    .map((i: Row) => ({ id: i.id, url: i.url, position: i.position }))
    .sort((a: { position: number }, b: { position: number }) => a.position - b.position),
  rooms: (r.hostel_rooms ?? []).map((rm: Row) => ({
    id: rm.id,
    label: rm.label,
    // null on the row means "inherit the hostel price"   resolve it here so no
    // component has to know that rule.
    priceKobo: Number(rm.price_per_session_kobo ?? r.price_per_session_kobo ?? 0),
    isListed: rm.is_listed,
  })),
  roomsAvailable: r.availability?.rooms_available ?? undefined,
  roomsTotal: r.availability?.rooms_total ?? undefined,
  availability: r.availability?.availability ?? undefined,
});

const toBooking = (r: Row): Booking => ({
  id: r.id,
  studentId: r.student_id,
  hostelId: r.hostel_id,
  hostelName: r.hostel?.name ?? null,
  hostelArea: r.hostel?.area ?? null,
  hostelImageUrl: r.hostel?.hostel_images?.[0]?.url ?? null,
  roomId: r.room_id,
  roomLabel: r.room?.label ?? null,
  status: r.status,
  reservedUntil: r.reserved_until,
  moveIn: r.move_in,
  endDate: r.end_date,
  pricePerSessionKobo: r.price_per_session_kobo ? Number(r.price_per_session_kobo) : null,
  paidAt: r.paid_at,
  requestedAt: r.requested_at,
  createdAt: r.created_at,
});

const HOSTEL_SELECT = `
  *,
  hostel_images(id, url, position, kind),
  hostel_rooms(id, label, price_per_session_kobo, is_listed)
`;

/**
 * Availability comes from a VIEW that cannot be embedded.
 *
 * `toHostel` reads `r.availability?.rooms_available` and friends, but
 * HOSTEL_SELECT never asked for them and PostgREST cannot infer a relationship
 * between `hostels` and `hostel_availability` (a grouped view has no FK), so
 * those three fields were silently undefined on every hostel ever fetched.
 *
 * The view also speaks a DIFFERENT vocabulary from the domain type:
 *   view:  draft | closed      | ending_soon | active
 *   type:  draft | full        | filling_up  | available
 * so even a working embed would have produced values nothing matches on. The
 * translation lives here, once.
 */
const AVAILABILITY_FROM_VIEW: Record<string, Availability> = {
  draft: 'draft',
  closed: 'full',
  ending_soon: 'filling_up',
  active: 'available',
};

async function attachAvailability(db: Client, rows: Row[]): Promise<Row[]> {
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (!ids.length) return rows;

  const { data } = await db
    .from('hostel_availability')
    .select('hostel_id, rooms_total, rooms_available, availability')
    .in('hostel_id', ids);

  const byId = new Map((data ?? []).map((a: Row) => [a.hostel_id, a]));
  return rows.map((r) => {
    const a = byId.get(r.id);
    return a
      ? {
          ...r,
          availability: {
            rooms_total: a.rooms_total,
            rooms_available: a.rooms_available,
            availability: AVAILABILITY_FROM_VIEW[a.availability] ?? undefined,
          },
        }
      : r;
  });
}

// ── Reference data ─────────────────────────────────────────────────────────

export async function fetchAreas(db: Client): Promise<Area[]> {
  const rows = unwrapList<Row>(
    await db
      .from('areas')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    lat: r.lat,
    lng: r.lng,
    sortOrder: r.sort_order,
  }));
}

// ── Browse ─────────────────────────────────────────────────────────────────

export async function fetchHostels(
  db: Client,
  opts: {
    area?: string;
    roomType?: string;
    maxPriceKobo?: number;
    minPriceKobo?: number;
    verifiedOnly?: boolean;
    search?: string;
  } & PageParams = {},
): Promise<Hostel[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('hostels')
    .select(HOSTEL_SELECT)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (opts.area) q = q.eq('area', opts.area);
  if (opts.roomType) q = q.eq('room_type', opts.roomType);
  // RLS already hides unverified listings from everyone but the owner and
  // staff (20260908150000). This stays as an explicit narrowing for the
  // screens that want ONLY verified even when the caller is one of those two.
  if (opts.verifiedOnly) q = q.eq('verified', true);
  if (opts.minPriceKobo != null) q = q.gte('price_per_session_kobo', opts.minPriceKobo);
  if (opts.maxPriceKobo != null) q = q.lte('price_per_session_kobo', opts.maxPriceKobo);
  if (opts.search) q = q.ilike('name', `%${opts.search}%`);

  return unwrapList<Row>(await q).map(toHostel);
}

/**
 * Detail page. Availability comes from the view rather than counting rooms,
 * because a room held by a lapsed booking is free again and only the view
 * knows that.
 */
export async function fetchHostelBySlug(db: Client, slug: string): Promise<Hostel | null> {
  const row = unwrapMaybe<Row>(
    await db.from('hostels').select(HOSTEL_SELECT).eq('slug', slug).maybeSingle(),
  );
  if (!row) return null;

  // Was reading the view directly and passing its raw vocabulary through, so
  // `availability` arrived as 'active' / 'ending_soon'   values the Availability
  // type does not contain. Same helper as the list, same translation.
  const [withAvailability] = await attachAvailability(db, [row]);
  return toHostel(withAvailability);
}

/** PostGIS proximity search. `hostels_near` was created in 0006. */
export async function fetchHostelsNear(
  db: Client,
  lat: number,
  lng: number,
  radiusM = 2000,
): Promise<NearbyHostel[]> {
  const rows = unwrapList<Row>(await db.rpc('hostels_near', { lat, lng, radius_m: radiusM }));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    area: r.area,
    pricePerSessionKobo: Number(r.price_per_session_kobo ?? 0),
    roomsAvailable: Number(r.rooms_available ?? 0),
    availability: r.availability,
    distanceM: Number(r.distance_m ?? 0),
  }));
}

// ── Bookings ───────────────────────────────────────────────────────────────

const BOOKING_SELECT = `
  *,
  hostel:hostels(name, area, hostel_images(url)),
  room:hostel_rooms(label)
`;

export async function fetchMyBookings(
  db: Client,
  opts: { status?: string } & PageParams = {},
): Promise<Booking[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('bookings')
    .select(BOOKING_SELECT)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (opts.status) q = q.eq('status', opts.status);

  return unwrapList<Row>(await q).map(toBooking);
}

export async function fetchBooking(db: Client, id: string): Promise<Booking | null> {
  const row = unwrapMaybe<Row>(
    await db.from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle(),
  );
  return row ? toBooking(row) : null;
}

/**
 * Creating a booking starts a HOLD. `reserved_until` is set by the
 * `bookings_sync_hold` trigger from 0006, never by this call   and
 * `bookings_one_hold_per_room_idx` means a second student cannot hold the same
 * room. A unique-violation here is that constraint doing its job; surface it as
 * "just taken", not as an error.
 */
export async function createBooking(
  db: Client,
  input: {
    hostelId: string;
    roomId?: string;
    moveIn?: string;
    endDate?: string;
    studentId: string;
  },
): Promise<Booking> {
  const row = unwrap<Row>(
    await db
      .from('bookings')
      .insert({
        student_id: input.studentId,
        hostel_id: input.hostelId,
        room_id: input.roomId ?? null,
        move_in: input.moveIn ?? null,
        end_date: input.endDate ?? null,
        status: 'requested',
        requested_at: new Date().toISOString(),
      })
      .select(BOOKING_SELECT)
      .single(),
  );
  return toBooking(row);
}

export async function cancelBooking(db: Client, id: string): Promise<Booking> {
  const row = unwrap<Row>(
    await db
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select(BOOKING_SELECT)
      .single(),
  );
  return toBooking(row);
}

// ── Inspections ────────────────────────────────────────────────────────────

export async function fetchMyInspections(db: Client): Promise<Inspection[]> {
  const rows = unwrapList<Row>(
    await db
      .from('hostel_inspections')
      .select('*, hostel:hostels(name)')
      .order('scheduled_for', { ascending: false }),
  );
  return rows.map((r) => ({
    id: r.id,
    hostelId: r.hostel_id,
    hostelName: r.hostel?.name ?? null,
    bookingId: r.booking_id,
    scheduledFor: r.scheduled_for,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/**
 * `fullName`, `phone` and `feeKobo` are REQUIRED by the table, not optional
 * extras: the ambassador doing the visit needs a contact, and the fee is
 * snapshotted so a later change to `hostels.inspection_fee_kobo` cannot
 * retroactively reprice a booked visit. Read the fee from the hostel and pass
 * it through.
 */
export async function scheduleInspection(
  db: Client,
  input: {
    hostelId: string;
    studentId: string;
    scheduledFor: string;
    fullName: string;
    phone: string;
    feeKobo: number;
    bookingId?: string;
  },
): Promise<Inspection> {
  const row = unwrap<Row>(
    await db
      .from('hostel_inspections')
      .insert({
        hostel_id: input.hostelId,
        student_id: input.studentId,
        scheduled_for: input.scheduledFor,
        full_name: input.fullName,
        phone: input.phone,
        fee_kobo: input.feeKobo,
        booking_id: input.bookingId ?? null,
      })
      .select('*, hostel:hostels(name)')
      .single(),
  );
  return {
    id: row.id,
    hostelId: row.hostel_id,
    hostelName: row.hostel?.name ?? null,
    bookingId: row.booking_id,
    scheduledFor: row.scheduled_for,
    status: row.status,
    createdAt: row.created_at,
  };
}

// ── Landlord side ──────────────────────────────────────────────────────────

export async function fetchMyHostels(db: Client, landlordId: string): Promise<Hostel[]> {
  const rows = unwrapList<Row>(
    await db
      .from('hostels')
      .select(HOSTEL_SELECT)
      .eq('landlord_id', landlordId)
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
  );
  return rows.map(toHostel);
}

/**
 * `verified` is absent from the payload on purpose   `guard_hostel_privileged_cols`
 * reverts any client attempt to set it. Only the ambassador verification flow
 * can flip that column.
 */
export async function upsertHostel(
  db: Client,
  input: Partial<Hostel> & {
    landlordId: string;
    // NOT NULL in the schema, so they are required here too. `Partial<Hostel>`
    // alone would let a caller omit them and fail at runtime instead of at
    // compile time.
    name: string;
    slug: string;
    area: string;
    roomType: Hostel['roomType'];
    pricePerSessionKobo: number;
  },
): Promise<Hostel> {
  const payload = {
    landlord_id: input.landlordId,
    name: input.name,
    slug: input.slug,
    address: input.address ?? null,
    landmark: input.landmark ?? null,
    area: input.area,
    room_type: input.roomType,
    price_per_session_kobo: input.pricePerSessionKobo,
    inspection_fee_kobo: input.inspectionFeeKobo ?? 500000,
    // The landlord's own commercial choice, not a privileged column. Defaulted
    // to the mode that leaves the advertised price alone.
    fee_mode: input.feeMode ?? 'absorb',
    distance_minutes: input.distanceMinutes ?? null,
    amenities: input.amenities ?? [],
  };

  const row = input.id
    ? unwrap<Row>(
        await db.from('hostels').update(payload).eq('id', input.id).select(HOSTEL_SELECT).single(),
      )
    : unwrap<Row>(await db.from('hostels').insert(payload).select(HOSTEL_SELECT).single());

  return toHostel(row);
}

export async function archiveHostel(db: Client, id: string) {
  const { error } = await db
    .from('hostels')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
