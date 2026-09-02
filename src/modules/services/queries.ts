/**
 * Data access shared by /beauty, /laundry and /workmanship.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { unwrap, unwrapList, unwrapMaybe, toRange, type PageParams } from '@/lib/query/helpers';
import type {
  Service,
  ServiceCategory,
  ServiceRequest,
  ServiceRequestStatus,
  Vertical,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- see lib/query/helpers.ts */
type Row = any;
type Client = SupabaseClient<Database>;

// ── Mappers ────────────────────────────────────────────────────────────────

const toService = (r: Row): Service => ({
  id: r.id,
  vendorId: r.vendor_id,
  vendorName: r.vendor?.business_name ?? null,
  vendorSlug: r.vendor?.slug ?? null,
  vendorRating: r.vendor?.rating_avg ? Number(r.vendor.rating_avg) : undefined,
  categoryId: r.category_id,
  categoryName: r.category?.name ?? null,
  vertical: r.vertical,
  name: r.name,
  description: r.description,
  imageUrl: r.image_url,
  pricingModel: r.pricing_model,
  priceKobo: r.price_kobo == null ? null : Number(r.price_kobo),
  unitLabel: r.unit_label,
  durationMins: r.duration_mins,
  isActive: r.is_active,
});

const toRequest = (r: Row): ServiceRequest => ({
  id: r.id,
  code: r.code,
  studentId: r.student_id,
  vendorId: r.vendor_id,
  vendorName: r.vendor?.business_name ?? null,
  serviceId: r.service_id,
  serviceName: r.service?.name ?? null,
  vertical: r.vertical,
  status: r.status,
  quantity: r.quantity == null ? null : Number(r.quantity),
  unitLabel: r.unit_label,
  quotedKobo: r.quoted_kobo == null ? null : Number(r.quoted_kobo),
  agreedKobo: r.agreed_kobo == null ? null : Number(r.agreed_kobo),
  scheduledFor: r.scheduled_for,
  address: r.address,
  area: r.area,
  notes: r.notes,
  cancelReason: r.cancel_reason,
  completedAt: r.completed_at,
  createdAt: r.created_at,
  events: (r.service_request_events ?? []).map((e: Row) => ({
    id: e.id,
    fromStatus: e.from_status,
    toStatus: e.to_status,
    note: e.note,
    createdAt: e.created_at,
  })),
});

const SERVICE_SELECT = `
  *,
  vendor:vendor_profiles(business_name, slug, rating_avg),
  category:service_categories(name)
`;

const REQUEST_SELECT = `
  *,
  vendor:vendor_profiles(business_name),
  service:services(name),
  service_request_events(*)
`;

// ── Catalogue ──────────────────────────────────────────────────────────────

export async function fetchCategories(db: Client, vertical: Vertical): Promise<ServiceCategory[]> {
  const rows = unwrapList<Row>(
    await db
      .from('service_categories')
      .select('*')
      .eq('vertical', vertical)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  );
  return rows.map((r) => ({
    id: r.id,
    vertical: r.vertical,
    slug: r.slug,
    name: r.name,
    icon: r.icon,
    sortOrder: r.sort_order,
  }));
}

export async function fetchServices(
  db: Client,
  vertical: Vertical,
  opts: { categoryId?: string; search?: string; vendorId?: string } & PageParams = {},
): Promise<Service[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('services')
    .select(SERVICE_SELECT)
    .eq('vertical', vertical)
    .eq('is_active', true)
    .is('archived_at', null)
    .range(from, to);

  if (opts.categoryId) q = q.eq('category_id', opts.categoryId);
  if (opts.vendorId) q = q.eq('vendor_id', opts.vendorId);
  if (opts.search) q = q.ilike('name', `%${opts.search}%`);

  return unwrapList<Row>(await q).map(toService);
}

export async function fetchService(db: Client, id: string): Promise<Service | null> {
  const row = unwrapMaybe<Row>(
    await db.from('services').select(SERVICE_SELECT).eq('id', id).maybeSingle(),
  );
  return row ? toService(row) : null;
}

// ── Vendor catalogue management ────────────────────────────────────────────

export async function fetchMyServices(db: Client, vendorId: string): Promise<Service[]> {
  const rows = unwrapList<Row>(
    await db
      .from('services')
      .select(SERVICE_SELECT)
      .eq('vendor_id', vendorId)
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
  );
  return rows.map(toService);
}

/**
 * The `services_price_matches_model` constraint will reject an inconsistent
 * payload, so normalise before sending: a quote must send a null price, and a
 * per-unit service must send a unit label. Catching it here gives a better
 * message than a constraint violation.
 */
export async function upsertService(
  db: Client,
  // `name` is NOT NULL in the schema, so it is required here rather than left
  // to fail at runtime.
  input: Partial<Service> & { vendorId: string; vertical: Vertical; name: string },
): Promise<Service> {
  const isQuote = input.pricingModel === 'quote';

  if (!isQuote && input.priceKobo == null) {
    throw new Error('A fixed or per-unit service needs a price.');
  }
  if (input.pricingModel === 'per_unit' && !input.unitLabel) {
    throw new Error('A per-unit service needs a unit label (e.g. "kg").');
  }

  const payload = {
    vendor_id: input.vendorId,
    vertical: input.vertical,
    category_id: input.categoryId ?? null,
    name: input.name,
    description: input.description ?? null,
    image_url: input.imageUrl ?? null,
    pricing_model: input.pricingModel ?? 'fixed',
    price_kobo: isQuote ? null : input.priceKobo,
    unit_label: input.pricingModel === 'per_unit' ? input.unitLabel : null,
    duration_mins: input.durationMins ?? null,
    is_active: input.isActive ?? true,
  };

  const row = input.id
    ? unwrap<Row>(await db.from('services').update(payload).eq('id', input.id).select(SERVICE_SELECT).single())
    : unwrap<Row>(await db.from('services').insert(payload).select(SERVICE_SELECT).single());

  return toService(row);
}

export async function archiveService(db: Client, id: string) {
  const { error } = await db
    .from('services')
    .update({ archived_at: new Date().toISOString(), is_active: false })
    .eq('id', id);
  if (error) throw error;
}

// ── Requests ───────────────────────────────────────────────────────────────

export async function fetchRequests(
  db: Client,
  opts: { vertical?: Vertical; status?: ServiceRequestStatus; vendorId?: string } & PageParams = {},
): Promise<ServiceRequest[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('service_requests')
    .select(REQUEST_SELECT)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (opts.vertical) q = q.eq('vertical', opts.vertical);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.vendorId) q = q.eq('vendor_id', opts.vendorId);

  return unwrapList<Row>(await q).map(toRequest);
}

export async function fetchRequest(db: Client, id: string): Promise<ServiceRequest | null> {
  const row = unwrapMaybe<Row>(
    await db.from('service_requests').select(REQUEST_SELECT).eq('id', id).maybeSingle(),
  );
  return row ? toRequest(row) : null;
}

/**
 * `code` is not supplied   the `service_requests_set_code` trigger assigns it.
 * Neither is `agreed_kobo`: the column guard reverts any client attempt to set
 * a price on their own request.
 */
export async function createRequest(
  db: Client,
  input: {
    studentId: string;
    vendorId: string;
    vertical: Vertical;
    serviceId?: string;
    quantity?: number;
    unitLabel?: string;
    scheduledFor?: string;
    address?: string;
    area?: string;
    notes?: string;
  },
): Promise<ServiceRequest> {
  const row = unwrap<Row>(
    await db
      .from('service_requests')
      .insert({
        // `code` is NOT NULL, so Postgres   and therefore the generated Insert
        // type   insists on it, even though `service_requests_set_code` fills
        // it in. The trigger replaces null OR empty string, so '' is the
        // correct way to say "you assign it".
        code: '',
        student_id: input.studentId,
        vendor_id: input.vendorId,
        vertical: input.vertical,
        service_id: input.serviceId ?? null,
        quantity: input.quantity ?? null,
        unit_label: input.unitLabel ?? null,
        scheduled_for: input.scheduledFor ?? null,
        address: input.address ?? null,
        area: input.area ?? null,
        notes: input.notes ?? null,
      })
      .select(REQUEST_SELECT)
      .single(),
  );
  return toRequest(row);
}

/** Vendor proposes a price on a `quote` request. */
export async function quoteRequest(
  db: Client,
  id: string,
  quotedKobo: number,
): Promise<ServiceRequest> {
  const row = unwrap<Row>(
    await db
      .from('service_requests')
      .update({ quoted_kobo: quotedKobo, status: 'quoted' })
      .eq('id', id)
      .select(REQUEST_SELECT)
      .single(),
  );
  return toRequest(row);
}

/**
 * Advances the status. Every transition is appended to
 * `service_request_events` by trigger, so there is no separate log call   and
 * no way for a status change to happen without being recorded.
 */
export async function updateRequestStatus(
  db: Client,
  id: string,
  status: ServiceRequestStatus,
  extra: { agreedKobo?: number; scheduledFor?: string; cancelReason?: string } = {},
): Promise<ServiceRequest> {
  const patch: Database['public']['Tables']['service_requests']['Update'] = { status };

  if (status === 'accepted' && extra.agreedKobo != null) patch.agreed_kobo = extra.agreedKobo;
  if (extra.scheduledFor) patch.scheduled_for = extra.scheduledFor;
  if (extra.cancelReason) patch.cancel_reason = extra.cancelReason;
  if (status === 'completed') patch.completed_at = new Date().toISOString();

  const row = unwrap<Row>(
    await db.from('service_requests').update(patch).eq('id', id).select(REQUEST_SELECT).single(),
  );
  return toRequest(row);
}

/**
 * A service vendor by slug, for the `/[vertical]/[slug]` pro pages.
 *
 * Reads `vendor_profiles` with no category filter on purpose: a vendor's
 * category is what they registered as, while the page they are viewed on is
 * decided by the services they list. A laundry vendor who also does ironing
 * should not 404 on the laundry page because of a registration field.
 */
export async function fetchServiceVendorBySlug(
  db: Client,
  slug: string,
): Promise<{
  id: string;
  slug: string;
  businessName: string;
  tagline: string | null;
  bio: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  area: string | null;
  address: string | null;
  publicPhone: string | null;
  ratingAvg: number;
  ratingCount: number;
  isVerified: boolean;
  isAcceptingOrders: boolean;
} | null> {
  const r = unwrapMaybe<Row>(
    await db.from('vendor_profiles').select('*').eq('slug', slug).is('archived_at', null).maybeSingle(),
  );
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    businessName: r.business_name,
    tagline: r.tagline ?? null,
    bio: r.bio ?? null,
    logoUrl: r.logo_url ?? null,
    coverUrl: r.cover_url ?? null,
    area: r.area ?? null,
    address: r.business_address ?? null,
    publicPhone: r.public_phone ?? null,
    ratingAvg: Number(r.rating_avg ?? 0),
    ratingCount: r.rating_count ?? 0,
    isVerified: r.verification_status === 'verified',
    isAcceptingOrders: r.is_accepting_orders ?? true,
  };
}
