/**
 * Data access for the 'food' module.
 *
 * This is the ONLY file in the module that knows column names. Everything above
 * it works in the domain types from `./types`. Two reasons that boundary earns
 * its keep: the database is snake_case and the app is camelCase, and the schema
 * will keep moving while the UI contract should not.
 *
 * Every function takes the Supabase client as its first argument rather than
 * importing one. The browser client, the request-scoped server client and the
 * service-role client are all different objects with different privileges, and
 * a module that reaches for one of them itself cannot be used from the other
 * two. Hooks pass the browser client; server components pass their own.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { unwrap, unwrapList, unwrapMaybe, toRange, type PageParams } from '@/lib/query/helpers';
import type {
  Cart,
  CheckoutResult,
  DeliveryTracking,
  FoodListing,
  FoodOrder,
  FoodVendor,
  OrderEvent,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped until
   src/types/database.types.ts is generated; see lib/query/helpers.ts. */
type Row = any;
type Client = SupabaseClient<Database>;

// ── Mappers ────────────────────────────────────────────────────────────────

const toVendor = (r: Row): FoodVendor => ({
  id: r.id,
  slug: r.slug,
  businessName: r.business_name,
  tagline: r.tagline,
  logoUrl: r.logo_url,
  coverUrl: r.cover_url,
  area: r.area,
  ratingAvg: Number(r.rating_avg ?? 0),
  ratingCount: r.rating_count ?? 0,
  isAcceptingOrders: r.is_accepting_orders ?? true,
  isVerified: r.verification_status === 'verified',
});

const toListing = (r: Row): FoodListing => ({
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
});

const toOrder = (r: Row): FoodOrder => ({
  id: r.id,
  studentId: r.student_id,
  vendorId: r.vendor_id,
  vendorName: r.vendor?.business_name ?? null,
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

/** PostGIS returns geography as GeoJSON when selected through PostgREST. */
function toLatLng(geo: Row): { lat: number; lng: number } | null {
  if (!geo?.coordinates || geo.coordinates.length < 2) return null;
  // GeoJSON is [longitude, latitude] — the reverse of how everyone says it.
  const [lng, lat] = geo.coordinates;
  return { lat, lng };
}

// ── Browse ─────────────────────────────────────────────────────────────────

export async function fetchFoodVendors(
  db: Client,
  opts: { area?: string; search?: string } & PageParams = {},
): Promise<FoodVendor[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('vendor_profiles')
    .select('*')
    .eq('category', 'food')
    .is('archived_at', null)
    .order('rating_avg', { ascending: false })
    .range(from, to);

  if (opts.area) q = q.eq('area', opts.area);
  if (opts.search) q = q.ilike('business_name', `%${opts.search}%`);

  return unwrapList<Row>(await q).map(toVendor);
}

export async function fetchVendorBySlug(db: Client, slug: string): Promise<FoodVendor | null> {
  const row = unwrapMaybe<Row>(
    await db.from('vendor_profiles').select('*').eq('slug', slug).maybeSingle(),
  );
  return row ? toVendor(row) : null;
}

export async function fetchVendorMenu(db: Client, vendorId: string): Promise<FoodListing[]> {
  const rows = unwrapList<Row>(
    await db
      .from('listings')
      .select('*')
      .eq('vendor_id', vendorId)
      .is('archived_at', null)
      .neq('status', 'Archived')
      .order('created_at', { ascending: false }),
  );
  return rows.map(toListing);
}

// ── Cart ───────────────────────────────────────────────────────────────────

/**
 * One open cart per vendor — enforced by `carts_one_open_per_vendor_idx`, so
 * this is a get-or-create rather than a blind insert.
 */
export async function fetchOrCreateCart(
  db: Client,
  vendorId: string,
  studentId: string,
): Promise<Cart> {
  const existing = unwrapMaybe<Row>(
    await db
      .from('carts')
      .select('id, vendor_id, cart_items(*, listing:listings(name, image_url))')
      .eq('vendor_id', vendorId)
      .eq('status', 'open')
      .maybeSingle(),
  );

  if (existing) return toCart(existing);

  // `student_id` is NOT NULL with no default, so it must be supplied even
  // though `carts_own` would reject any other value anyway. RLS decides what
  // you may write; it does not fill columns in for you.
  const created = unwrap<Row>(
    await db
      .from('carts')
      .insert({ vendor_id: vendorId, student_id: studentId })
      .select('id, vendor_id, cart_items(*, listing:listings(name, image_url))')
      .single(),
  );
  return toCart(created);
}

function toCart(r: Row): Cart {
  const lines = (r.cart_items ?? []).map((i: Row) => ({
    id: i.id,
    listingId: i.listing_id,
    name: i.listing?.name ?? 'Item',
    imageUrl: i.listing?.image_url ?? null,
    quantity: i.quantity,
    unitPriceKobo: Number(i.unit_price_kobo ?? 0),
    lineTotalKobo: Number(i.unit_price_kobo ?? 0) * i.quantity,
    note: i.note,
  }));

  return {
    id: r.id,
    vendorId: r.vendor_id,
    vendorName: r.vendor?.business_name ?? null,
    lines,
    subtotalKobo: lines.reduce((sum: number, l: { lineTotalKobo: number }) => sum + l.lineTotalKobo, 0),
    itemCount: lines.reduce((sum: number, l: { quantity: number }) => sum + l.quantity, 0),
  };
}

export async function addCartItem(
  db: Client,
  input: { cartId: string; listingId: string; quantity: number; unitPriceKobo: number; note?: string },
) {
  // Upsert on (cart_id, listing_id): tapping "add" twice increments rather than
  // erroring on the unique constraint.
  const existing = unwrapMaybe<Row>(
    await db
      .from('cart_items')
      .select('id, quantity')
      .eq('cart_id', input.cartId)
      .eq('listing_id', input.listingId)
      .maybeSingle(),
  );

  if (existing) {
    return unwrap<Row>(
      await db
        .from('cart_items')
        .update({ quantity: existing.quantity + input.quantity })
        .eq('id', existing.id)
        .select()
        .single(),
    );
  }

  return unwrap<Row>(
    await db
      .from('cart_items')
      .insert({
        cart_id: input.cartId,
        listing_id: input.listingId,
        quantity: input.quantity,
        unit_price_kobo: input.unitPriceKobo,
        note: input.note ?? null,
      })
      .select()
      .single(),
  );
}

export async function updateCartItemQuantity(db: Client, itemId: string, quantity: number) {
  if (quantity <= 0) return removeCartItem(db, itemId);
  return unwrap<Row>(
    await db.from('cart_items').update({ quantity }).eq('id', itemId).select().single(),
  );
}

export async function removeCartItem(db: Client, itemId: string) {
  const { error } = await db.from('cart_items').delete().eq('id', itemId);
  if (error) throw error;
  return { id: itemId };
}

// ── Checkout ───────────────────────────────────────────────────────────────

/**
 * Delegates to the `checkout_cart` RPC. Everything the RPC does — validating
 * stock, re-reading live prices, applying the promotion, creating the order,
 * items, escrow hold, conversation and delivery — happens in one transaction.
 * Doing it here as six client calls would leave partial orders behind whenever
 * the network dropped between them.
 */
export async function checkoutCart(
  db: Client,
  input: { cartId: string; deliveryAddress: string; note?: string; promotionCode?: string },
): Promise<CheckoutResult> {
  const rows = unwrapList<Row>(
    await db.rpc('checkout_cart', {
      p_cart_id: input.cartId,
      p_delivery_address: input.deliveryAddress,
      // `undefined`, not `null` — these have SQL defaults, and the generated
      // signature types an omitted argument as optional rather than nullable.
      p_note: input.note,
      p_promotion_code: input.promotionCode,
    }),
  );

  const r = rows[0];
  if (!r) throw new Error('Checkout returned no result');
  return { orderId: r.order_id, totalKobo: Number(r.total_kobo ?? 0), repriced: !!r.repriced };
}

// ── Orders ─────────────────────────────────────────────────────────────────

export async function fetchMyOrders(
  db: Client,
  opts: { status?: string } & PageParams = {},
): Promise<FoodOrder[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('orders')
    .select('*, order_items(*), vendor:vendor_profiles!orders_vendor_id_fkey(business_name)')
    .order('placed_at', { ascending: false })
    .range(from, to);

  if (opts.status) q = q.eq('status', opts.status);

  return unwrapList<Row>(await q).map(toOrder);
}

export async function fetchOrder(db: Client, orderId: string): Promise<FoodOrder | null> {
  const row = unwrapMaybe<Row>(
    await db
      .from('orders')
      .select('*, order_items(*), vendor:vendor_profiles!orders_vendor_id_fkey(business_name)')
      .eq('id', orderId)
      .maybeSingle(),
  );
  return row ? toOrder(row) : null;
}

export async function fetchOrderEvents(db: Client, orderId: string): Promise<OrderEvent[]> {
  const rows = unwrapList<Row>(
    await db
      .from('order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true }),
  );
  return rows.map((r) => ({
    id: r.id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    note: r.note,
    createdAt: r.created_at,
  }));
}

/**
 * Reads `active_delivery_positions`, the view that exposes a rider's location
 * ONLY while a delivery is in flight. Never query `rider_profiles.current_geo`
 * from the client — that would be every rider's live position.
 */
export async function fetchDeliveryTracking(
  db: Client,
  orderId: string,
): Promise<DeliveryTracking | null> {
  const row = unwrapMaybe<Row>(
    await db.from('active_delivery_positions').select('*').eq('order_id', orderId).maybeSingle(),
  );
  if (!row) return null;

  return {
    deliveryId: row.delivery_id,
    orderId: row.order_id,
    riderId: row.rider_id,
    status: row.status,
    riderPosition: toLatLng(row.current_geo),
    lastSeenAt: row.last_seen_at,
  };
}

// ── Favorites ──────────────────────────────────────────────────────────────

/** RPC returns the resulting state, so the UI needs no follow-up read. */
export async function toggleFavorite(
  db: Client,
  entityType: 'vendor' | 'listing' | 'event' | 'service' | 'hotspot',
  entityId: string,
): Promise<boolean> {
  const { data, error } = await db.rpc('toggle_favorite', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) throw error;
  return !!data;
}

export async function fetchFavorites(db: Client, entityType?: string) {
  let q = db.from('favorites').select('*').order('created_at', { ascending: false });
  if (entityType) q = q.eq('entity_type', entityType);
  return unwrapList<Row>(await q);
}
