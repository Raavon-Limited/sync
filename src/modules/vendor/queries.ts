/**
 * Data access for the 'vendor' module — storefront, listings, the order inbox
 * and promotions. Backs /vendor/listings, /vendor/orders, /vendor/promotions
 * and /vendor/settings.
 *
 * `./types.ts` is left alone on purpose: it holds the MOCK shapes the vendor
 * screens still render (`Listing`, `ChatContact`, `EarningsData`, …) and those
 * components have not been migrated yet. The real shapes exported here are
 * additive, so both can coexist while the screens move across one at a time.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePrimaryStorefrontId } from '@/modules/storefronts/queries';
import type { Database } from '@/types/database.types';
import { unwrap, unwrapList, unwrapMaybe, toRange, type PageParams } from '@/lib/query/helpers';
import type { FoodOrder, OrderStatus } from '@/modules/food/types';

/* eslint-disable @typescript-eslint/no-explicit-any -- see lib/query/helpers.ts */
type Row = any;
type Client = SupabaseClient<Database>;

// ── Types specific to the vendor surface ───────────────────────────────────

export interface VendorStorefront {
  id: string;
  slug: string;
  businessName: string;
  category: 'landlord' | 'food' | 'beauty' | 'laundry' | 'tradesman';
  trade: string | null;
  tagline: string | null;
  bio: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  publicPhone: string | null;
  businessAddress: string | null;
  area: string | null;
  /** Server-controlled — the column guard reverts client writes. */
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  ratingAvg: number;
  ratingCount: number;
  isAcceptingOrders: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface VendorListing {
  id: string;
  vendorId: string;
  name: string;
  description: string | null;
  category: string;
  priceKobo: number;
  stock: number;
  sold: number;
  status: 'Active' | 'Out of Stock' | 'Archived';
  imageUrl: string | null;
  archivedAt: string | null;
}

export interface Promotion {
  id: string;
  code: string | null;
  name: string;
  /** Listing this campaign promotes. Null = store-wide. */
  listingId: string | null;
  /** Snapshot of the listing name for display, joined at read time. */
  listingName?: string | null;
  /** Campaign kind. Distinct from discountType, which is the discount maths. */
  promotionType: string | null;
  /** Vendor-set daily spend cap, in kobo. */
  dailyBudgetKobo: number | null;
  description: string | null;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderKobo: number;
  maxRedemptions: number | null;
  /** Server-maintained; incremented at checkout. */
  redemptionCount: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
}

// ── Mappers ────────────────────────────────────────────────────────────────

const toStorefront = (r: Row): VendorStorefront => ({
  id: r.id,
  slug: r.slug,
  businessName: r.business_name,
  category: r.category,
  trade: r.trade,
  tagline: r.tagline,
  bio: r.bio,
  logoUrl: r.logo_url,
  coverUrl: r.cover_url,
  publicPhone: r.public_phone,
  businessAddress: r.business_address,
  area: r.area,
  verificationStatus: r.verification_status,
  ratingAvg: Number(r.rating_avg ?? 0),
  ratingCount: r.rating_count ?? 0,
  isAcceptingOrders: r.is_accepting_orders,
  opensAt: r.opens_at,
  closesAt: r.closes_at,
});

const toListing = (r: Row): VendorListing => ({
  id: r.id,
  vendorId: r.vendor_id,
  name: r.name,
  description: r.description,
  category: r.category,
  priceKobo: Number(r.price_kobo ?? 0),
  stock: r.stock ?? 0,
  sold: r.sold ?? 0,
  status: r.status,
  imageUrl: r.image_url,
  archivedAt: r.archived_at,
});

const toPromotion = (r: Row): Promotion => ({
  id: r.id,
  code: r.code,
  name: r.name,
  listingId: r.listing_id,
  listingName: r.listing?.name ?? null,
  promotionType: r.promotion_type,
  dailyBudgetKobo: r.daily_budget_kobo == null ? null : Number(r.daily_budget_kobo),
  description: r.description,
  discountType: r.discount_type,
  discountValue: r.discount_value,
  minOrderKobo: Number(r.min_order_kobo ?? 0),
  maxRedemptions: r.max_redemptions,
  redemptionCount: r.redemption_count ?? 0,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  isActive: r.is_active,
});

const toOrder = (r: Row): FoodOrder => ({
  id: r.id,
  studentId: r.student_id,
  vendorId: r.vendor_id,
  vendorName: null,
  customerName: r.customer_name,
  customerPhone: r.customer_phone,
  status: r.status,
  subtotalKobo: Number(r.subtotal_kobo ?? 0),
  deliveryFeeKobo: Number(r.delivery_fee_kobo ?? 0),
  totalKobo: Number(r.total_kobo ?? 0),
  deliveryAddress: r.delivery_address,
  etaMinutes: r.eta_minutes,
  paidAt: r.paid_at,
  placedAt: r.placed_at,
  deliveredAt: r.delivered_at,
  lines: (r.order_items ?? []).map((i: Row) => ({
    id: i.id,
    listingId: i.listing_id,
    name: i.name,
    qty: i.qty,
    priceKobo: Number(i.price_kobo ?? 0),
    imageUrl: i.image_url,
  })),
});

// ── Storefront ─────────────────────────────────────────────────────────────

export async function fetchMyStorefront(db: Client, vendorId: string): Promise<VendorStorefront | null> {
  const r = unwrapMaybe<Row>(
    await db.from('vendor_profiles').select('*').eq('id', vendorId).maybeSingle(),
  );
  return r ? toStorefront(r) : null;
}

/**
 * `verification_status`, `verified_at`, `rating_avg` and `rating_count` are
 * omitted deliberately — `guard_vendor_profile_cols` reverts them. A vendor
 * cannot self-verify or invent a rating.
 */
export async function updateMyStorefront(
  db: Client,
  vendorId: string,
  patch: Partial<VendorStorefront>,
): Promise<VendorStorefront> {
  const payload: Database['public']['Tables']['vendor_profiles']['Update'] = {};
  if (patch.businessName !== undefined) payload.business_name = patch.businessName;
  if (patch.tagline !== undefined) payload.tagline = patch.tagline;
  if (patch.bio !== undefined) payload.bio = patch.bio;
  if (patch.logoUrl !== undefined) payload.logo_url = patch.logoUrl;
  if (patch.coverUrl !== undefined) payload.cover_url = patch.coverUrl;
  if (patch.publicPhone !== undefined) payload.public_phone = patch.publicPhone;
  if (patch.businessAddress !== undefined) payload.business_address = patch.businessAddress;
  if (patch.area !== undefined) payload.area = patch.area;
  if (patch.isAcceptingOrders !== undefined) payload.is_accepting_orders = patch.isAcceptingOrders;
  if (patch.opensAt !== undefined) payload.opens_at = patch.opensAt;
  if (patch.closesAt !== undefined) payload.closes_at = patch.closesAt;

  const row = unwrap<Row>(
    await db.from('vendor_profiles').update(payload).eq('id', vendorId).select().single(),
  );
  return toStorefront(row);
}

// ── Listings ───────────────────────────────────────────────────────────────

export async function fetchMyListings(
  db: Client,
  vendorId: string,
  opts: { status?: string; search?: string; includeArchived?: boolean } & PageParams = {},
): Promise<VendorListing[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('listings')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (!opts.includeArchived) q = q.is('archived_at', null);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.search) q = q.ilike('name', `%${opts.search}%`);

  return unwrapList<Row>(await q).map(toListing);
}

/** `sold` is omitted — it is maintained by checkout, not by the vendor. */
export async function upsertListing(
  db: Client,
  // `name`, `category` and `price_kobo` are NOT NULL in the schema.
  input: Partial<VendorListing> & {
    vendorId: string;
    name: string;
    category: string;
    priceKobo: number;
    /** Which branch stocks it. Defaults to the vendor's primary branch. */
    storefrontId?: string;
  },
): Promise<VendorListing> {
  // storefront_id is NOT NULL: a listing is stocked AT a branch. A vendor
  // editing an existing item keeps its branch; a new item without an explicit
  // branch lands on the primary one.
  const storefrontId =
    input.storefrontId ?? (input.id ? undefined : await resolvePrimaryStorefrontId(db, input.vendorId));

  const payload = {
    vendor_id: input.vendorId,
    ...(storefrontId ? { storefront_id: storefrontId } : {}),
    name: input.name,
    description: input.description ?? null,
    category: input.category,
    price_kobo: input.priceKobo,
    stock: input.stock ?? 0,
    status: input.status ?? 'Active',
    image_url: input.imageUrl ?? null,
  };

  const row = input.id
    ? unwrap<Row>(await db.from('listings').update(payload).eq('id', input.id).select().single())
    : unwrap<Row>(await db.from('listings').insert(payload).select().single());

  return toListing(row);
}

/**
 * Archive, not delete. `order_items.listing_id` is ON DELETE SET NULL, so a
 * hard delete would silently detach the item from every historical order.
 * Archiving keeps the link and drops the row out of the storefront.
 */
export async function archiveListings(db: Client, ids: string[]) {
  const { error } = await db
    .from('listings')
    .update({ archived_at: new Date().toISOString(), status: 'Archived' })
    .in('id', ids);
  if (error) throw error;
}

export async function restoreListings(db: Client, ids: string[]) {
  const { error } = await db
    .from('listings')
    .update({ archived_at: null, status: 'Active' })
    .in('id', ids);
  if (error) throw error;
}

/** Real deletion. Offer it only for listings that were never ordered. */
export async function deleteListings(db: Client, ids: string[]) {
  const { error } = await db.from('listings').delete().in('id', ids);
  if (error) throw error;
}

// ── Order inbox ────────────────────────────────────────────────────────────

/**
 * The vendor's order queue.
 *
 * SCOPE BY BRANCH WHEN ONE IS ACTIVE, BY BRAND OTHERWISE.
 *   Filtering on `vendor_id` alone returns EVERY branch's orders merged, which
 *   is wrong for a vendor working one location — and returns nothing at all for
 *   an invited manager, whose uid is not the vendor's. Passing `storefrontId`
 *   fixes both: RLS (orders_select_own) already lets branch staff read their own
 *   branch's orders, so the same call works for owner and manager alike.
 */
export async function fetchVendorOrders(
  db: Client,
  vendorId: string,
  opts: { status?: OrderStatus; storefrontId?: string } & PageParams = {},
): Promise<FoodOrder[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('orders')
    .select('*, order_items(*)')
    .order('placed_at', { ascending: false })
    .range(from, to);

  q = opts.storefrontId
    ? q.eq('storefront_id', opts.storefrontId)
    : q.eq('vendor_id', vendorId);

  if (opts.status) q = q.eq('status', opts.status);

  return unwrapList<Row>(await q).map(toOrder);
}

/**
 * Only the vendor advances fulfilment — that is `orders_update_vendor` in 0006.
 * Money columns are frozen by `guard_order_privileged_cols`, so a vendor cannot
 * mark an order paid or change its total while updating the status.
 */
export async function updateOrderStatus(
  db: Client,
  orderId: string,
  status: OrderStatus,
  reason?: string,
): Promise<FoodOrder> {
  // Cancelling is NOT a status write. A plain update leaves the escrow hold
  // sitting at 'held', and the hourly release cron then pays the vendor in
  // full for an order that never happened — see 20260829100000. Cancelling
  // and refunding have to be one transaction, which is what the RPC is.
  if (status === 'cancelled') return cancelOrder(db, orderId, reason);

  const patch: Database['public']['Tables']['orders']['Update'] = { status };
  if (status === 'delivered') patch.delivered_at = new Date().toISOString();

  const row = unwrap<Row>(
    await db.from('orders').update(patch).eq('id', orderId).select('*, order_items(*)').single(),
  );
  return toOrder(row);
}

/**
 * Cancel an order and refund the student in full, in one transaction.
 *
 * The refund is automatic and needs no staff: the vendor gave up the sale, so
 * there is nothing to arbitrate. Disputes remain for the contested cases.
 * Idempotent server-side, so a second tap costs nothing.
 */
export async function cancelOrder(
  db: Client,
  orderId: string,
  reason?: string,
): Promise<FoodOrder> {
  const { error } = await db.rpc('cancel_order', {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw error;

  const row = unwrap<Row>(
    await db.from('orders').select('*, order_items(*)').eq('id', orderId).single(),
  );
  return toOrder(row);
}

// ── Promotions ─────────────────────────────────────────────────────────────

export async function fetchMyPromotions(db: Client, vendorId: string): Promise<Promotion[]> {
  const rows = unwrapList<Row>(
    await db
      .from('promotions')
      .select('*, listing:listings(name)')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false }),
  );
  return rows.map(toPromotion);
}

/**
 * `redemption_count` is omitted — `guard_promotion_cols` reverts it, because a
 * vendor who could edit it could reset a capped promotion forever.
 *
 * The `promotions_percent_sane` constraint rejects a percentage over 100 and
 * `promotions_window_sane` rejects an end before the start; both are validated
 * here first so the user sees a sentence rather than a constraint name.
 */
export async function upsertPromotion(
  db: Client,
  // NOT NULL in the schema, so required here.
  input: Partial<Promotion> & {
    vendorId: string;
    name: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
  },
): Promise<Promotion> {
  if (input.discountType === 'percent' && (input.discountValue ?? 0) > 100) {
    throw new Error('A percentage discount cannot exceed 100%.');
  }
  if (input.endsAt && input.startsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw new Error('The end date must be after the start date.');
  }

  const payload = {
    vendor_id: input.vendorId,
    code: input.code ?? null,
    name: input.name,
    description: input.description ?? null,
    discount_type: input.discountType,
    discount_value: input.discountValue,
    min_order_kobo: input.minOrderKobo ?? 0,
    max_redemptions: input.maxRedemptions ?? null,
    starts_at: input.startsAt ?? new Date().toISOString(),
    ends_at: input.endsAt ?? null,
    is_active: input.isActive ?? true,
    // null = store-wide. The DB trigger rejects a listing the caller does not
    // own, so a forged id fails loudly rather than silently promoting someone
    // else's product.
    listing_id: input.listingId ?? null,
    promotion_type: input.promotionType ?? null,
    daily_budget_kobo: input.dailyBudgetKobo ?? null,
  };

  const row = input.id
    ? unwrap<Row>(await db.from('promotions').update(payload).eq('id', input.id).select().single())
    : unwrap<Row>(await db.from('promotions').insert(payload).select().single());

  return toPromotion(row);
}

export async function deletePromotion(db: Client, id: string) {
  const { error } = await db.from('promotions').delete().eq('id', id);
  if (error) throw error;
}

// ── Listing images (Supabase Storage) ──────────────────────────────────────

export const MEDIA_BUCKET = 'public-media';

/** 5 MB, matching the bucket's own `file_size_limit`. Checked here too so the
 *  user gets a sentence instead of an opaque storage error. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/**
 * Uploads a listing photo and returns its public URL.
 *
 * PUBLIC URL, NOT SIGNED - unlike chat attachments. A listing photo appears on
 * pages a signed-out visitor can already see, so a permanent URL is the point.
 * Signing them would mean every storefront render burns a round trip minting
 * links that expire.
 *
 * The path starts with the uploader's uuid because the `public_media_insert_own`
 * policy authorizes on the first segment - a vendor can only write under their
 * own folder, so one vendor cannot overwrite another's photo.
 */
export async function uploadVendorImage(
  db: Client,
  input: { userId: string; file: File; folder?: 'listings' | 'logos' | 'stores' },
): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(input.file.type)) {
    throw new Error('Please choose a JPEG, PNG, WebP or AVIF image.');
  }
  if (input.file.size > MAX_IMAGE_BYTES) {
    throw new Error('That image is over 5MB. Please choose a smaller one.');
  }

  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const token = crypto.randomUUID().slice(0, 8);
  // The folder is cosmetic — the POLICY authorizes on the first segment, the
  // uploader's uuid — but it keeps a vendor's own storage browsable when
  // somebody has to go looking for the photo behind a support ticket.
  const path = `${input.userId}/${input.folder ?? 'listings'}/${token}-${safeName}`;

  const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, input.file, {
    contentType: input.file.type,
    // The random prefix makes collisions vanishingly unlikely; an unexpected one
    // should fail rather than silently replace someone's photo.
    upsert: false,
  });
  if (error) throw error;

  const { data } = db.storage.from(MEDIA_BUCKET).getPublicUrl(path);

  return data.publicUrl;
}

/** The original name, kept so existing callers do not all have to change. */
export async function uploadListingImage(
  db: Client,
  input: { userId: string; file: File },
): Promise<string> {
  return uploadVendorImage(db, { ...input, folder: 'listings' });
}

// ── Listing categories ─────────────────────────────────────────────────────

export interface ListingCategory {
  id: string;
  vendorCategory: string;
  name: string;
  slug: string;
  sortOrder: number;
  /** False for the shared platform taxonomy, true for this vendor's own. */
  isCustom: boolean;
}

const toCategory = (r: Row): ListingCategory => ({
  id: r.id,
  vendorCategory: r.vendor_category,
  name: r.name,
  slug: r.slug,
  sortOrder: r.sort_order,
  isCustom: r.vendor_id !== null,
});

/**
 * The categories a given vendor may file a listing under: the shared platform
 * taxonomy for their business type, plus any they have added themselves.
 *
 * One query, not two. `or()` keeps it a single round trip, and the RLS policy
 * already prevents another vendor's custom categories from coming back.
 */
export async function fetchListingCategories(
  db: Client,
  input: { vendorCategory: string; vendorId?: string },
): Promise<ListingCategory[]> {
  const ownership = input.vendorId
    ? `vendor_id.is.null,vendor_id.eq.${input.vendorId}`
    : 'vendor_id.is.null';

  const rows = unwrapList<Row>(
    await db
      .from('listing_categories')
      .select('*')
      .eq('vendor_category', input.vendorCategory)
      .eq('is_active', true)
      .or(ownership)
      .order('sort_order', { ascending: true }),
  );

  return rows.map(toCategory);
}

/**
 * Creates a custom category for this vendor.
 *
 * `vendor_category` is taken from the vendor's storefront rather than the
 * caller: a trigger rejects a mismatch anyway, and deriving it here means the
 * UI cannot get it wrong.
 */
export async function createListingCategory(
  db: Client,
  input: { vendorId: string; vendorCategory: string; name: string },
): Promise<ListingCategory> {
  const name = input.name.trim();

  if (!name) throw new Error('Category name is required.');

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) throw new Error('Please use letters or numbers in the category name.');

  const row = unwrap<Row>(
    await db
      .from('listing_categories')
      .insert({
        vendor_id: input.vendorId,
        vendor_category: input.vendorCategory,
        name,
        slug,
        // Custom categories sort after the platform set.
        sort_order: 1000,
      })
      .select()
      .single(),
  );

  return toCategory(row);
}
