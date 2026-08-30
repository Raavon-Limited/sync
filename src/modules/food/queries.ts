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
import { resolvePrimaryStorefrontId } from '@/modules/storefronts/queries';
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
  opensAt: r.opens_at ?? null,
  closesAt: r.closes_at ?? null,
  publicPhone: r.public_phone ?? null,
  businessAddress: r.business_address ?? null,
});

const toListing = (r: Row): FoodListing => ({
  id: r.id,
  vendorId: r.vendor_id,
  name: r.name,
  description: r.description,
  category: r.category,
  priceKobo: Number(r.price_kobo ?? 0),
  // Catalogue defaults. A listing read outside a store has no store terms, so
  // it reports itself available and untracked; `toStoreListing` below overlays
  // the real ones when a store is in scope.
  stock: null,
  sold: r.sold ?? 0,
  status: r.status,
  isAvailable: r.status === 'Active',
  imageUrl: r.image_url,
});

/**
 * A catalogue row seen through one store: its price, its stock and whether
 * that store can sell it at all.
 *
 * The overlay is the point of the shared catalogue — the name, photo and
 * description are the business's and are edited once, while price and stock
 * belong to the location standing in front of the student.
 */
const toStoreListing = (r: Row, sl: Row | undefined): FoodListing => ({
  ...toListing(r),
  priceKobo: Number(sl?.price_kobo ?? r.price_kobo ?? 0),
  stock: sl?.stock ?? null,
  isAvailable: !!sl?.is_available,
});

/**
 * No vendor embed. `orders.vendor_id` is a FK to public.profiles — NOT to
 * vendor_profiles — so `vendor:vendor_profiles!orders_vendor_id_fkey(...)`
 * asked PostgREST for a relationship that does not exist and failed the whole
 * query with "Could not find a relationship". Routing it through profiles
 * instead would parse, then return null forever, because profiles is readable
 * only for your own row. Storefront names are therefore joined in code below.
 */
const ORDER_SELECT = '*, order_items(*)';

/** vendor_profiles.id === profiles.id === orders.vendor_id, and vendor_profiles
 *  is publicly readable, so this is a plain lookup rather than an embed. */
async function attachVendorNames(db: Client, rows: Row[]): Promise<Row[]> {
  const ids = [...new Set(rows.map((r) => r.vendor_id).filter(Boolean))];
  if (!ids.length) return rows;
  const { data } = await db.from('vendor_profiles').select('id, business_name').in('id', ids);
  const names = new Map((data ?? []).map((v: Row) => [v.id, v.business_name]));
  return rows.map((r) => ({ ...r, vendor: { business_name: names.get(r.vendor_id) ?? null } }));
}

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

/*
 * `toLatLng` lived here and always returned null: it read `geo.coordinates`,
 * but a geography column comes back over PostgREST as WKB hex. Its last caller
 * (delivery tracking) now reads the plain lat/lng columns, so it is gone rather
 * than left as a trap for the next person. Vendor location belongs to a BRANCH
 * now — see modules/storefronts.
 */

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

/**
 * Resolve a storefront route slug to a BRANCH.
 *
 * `/food/[slug]` used to resolve a vendor_profiles row and then list every
 * listing that brand owned — which merged all of its branches into one menu the
 * moment a vendor had more than one. Since listings are per branch, the page
 * has to resolve a branch.
 *
 * Brand slugs still work: they land on the primary branch, which is exactly
 * what a link to "the business" should mean, and keeps older links alive.
 */
export async function resolveStorefrontBySlug(
  db: Client,
  slug: string,
): Promise<{ storefrontId: string; vendorId: string; branchName: string } | null> {
  const branch = unwrapMaybe<Row>(
    await db
      .from('storefronts')
      .select('id, vendor_id, name')
      .eq('slug', slug)
      .is('archived_at', null)
      .maybeSingle(),
  );
  if (branch) {
    return { storefrontId: branch.id, vendorId: branch.vendor_id, branchName: branch.name };
  }

  // Not a branch slug — try the brand, and use its primary branch.
  const brand = unwrapMaybe<Row>(
    await db.from('vendor_profiles').select('id').eq('slug', slug).maybeSingle(),
  );
  if (!brand) return null;

  const primary = unwrapMaybe<Row>(
    await db
      .from('storefronts')
      .select('id, vendor_id, name')
      .eq('vendor_id', brand.id)
      .is('archived_at', null)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  );
  return primary
    ? { storefrontId: primary.id, vendorId: primary.vendor_id, branchName: primary.name }
    : null;
}

/** What THIS branch sells. Not the brand's whole catalogue. */
/**
 * What one store sells.
 *
 * READS storefront_listings, NOT listings.storefront_id. Since the shared
 * catalogue (20260829090000) an item belongs to the BUSINESS and
 * `storefront_listings` says which stores carry it — so filtering on
 * `listings.storefront_id` would show only the items that happened to be
 * created at this store and miss every one it was later opted into.
 *
 * Sold-out items are returned, not filtered out. A menu that silently drops
 * this evening's finished dish looks like the vendor stopped selling it;
 * showing it greyed with "Sold out" is the information the student wants.
 */
export async function fetchStorefrontMenu(
  db: Client,
  storefrontId: string,
): Promise<FoodListing[]> {
  const carried = unwrapList<Row>(
    await db
      .from('storefront_listings')
      .select('listing_id, price_kobo, stock, is_available')
      .eq('storefront_id', storefrontId)
      .eq('is_listed', true),
  );
  if (!carried.length) return [];

  // Joined in code: `storefront_listings` embeds would be a third table in a
  // PostgREST relationship chain, and embeds on this schema have bitten us
  // repeatedly. Two plain reads are cheaper than one silent empty result.
  const byListing = new Map(carried.map((c) => [c.listing_id as string, c]));

  const rows = unwrapList<Row>(
    await db
      .from('listings')
      .select('*')
      .in('id', [...byListing.keys()])
      .is('archived_at', null)
      .neq('status', 'Archived')
      .order('created_at', { ascending: false }),
  );

  return rows.map((r) => toStoreListing(r, byListing.get(r.id as string)));
}

/** Food branches, with their brand. Discovery lists BRANCHES, not brands. */
export async function fetchFoodStorefronts(
  db: Client,
  opts: { area?: string } & PageParams = {},
): Promise<
  Array<{
    id: string;
    /** The BRAND behind this branch — what `favorites` can currently store. */
    vendorId: string;
    slug: string;
    branchName: string;
    pausedUntil: string | null;
    area: string | null;
    isAcceptingOrders: boolean;
    businessName: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
    ratingAvg: number;
    ratingCount: number;
  }>
> {
  const [from, to] = toRange(opts);
  let q = db
    .from('storefronts')
    .select('id, slug, name, area, is_accepting_orders, vendor_id')
    .is('archived_at', null)
    .range(from, to);
  if (opts.area) q = q.eq('area', opts.area);

  const branches = unwrapList<Row>(await q);
  if (!branches.length) return [];

  // vendor_profiles is publicly readable, so this is a plain lookup rather than
  // an embed — storefronts.vendor_id points at it, but PostgREST embeds on this
  // schema have bitten us three times now.
  const ids = [...new Set(branches.map((b) => b.vendor_id))];
  const brands = unwrapList<Row>(
    await db
      .from('vendor_profiles')
      .select('id, business_name, logo_url, cover_url, rating_avg, rating_count, category, archived_at')
      .in('id', ids),
  );
  const byId = new Map(brands.map((b) => [b.id, b]));

  return branches
    .filter((b) => {
      const brand = byId.get(b.vendor_id);
      return brand && brand.category === 'food' && !brand.archived_at;
    })
    .map((b) => {
      const brand = byId.get(b.vendor_id)!;
      return {
        id: b.id,
        vendorId: b.vendor_id,
        slug: b.slug,
        branchName: b.name,
        area: b.area ?? null,
        isAcceptingOrders: b.is_accepting_orders ?? true,
        // A cooldown is separate from the manual switch: the store is open,
        // it is just briefly not taking orders. The card needs both to say
        // "back in 8 min" rather than "closed".
        pausedUntil: b.paused_until ?? null,
        businessName: brand.business_name ?? null,
        logoUrl: brand.logo_url ?? null,
        coverUrl: brand.cover_url ?? null,
        ratingAvg: Number(brand.rating_avg ?? 0),
        ratingCount: brand.rating_count ?? 0,
      };
    });
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
  /**
   * The BRANCH this cart belongs to. Optional so callers holding only a brand
   * still work; they get the primary branch, matching what a brand link
   * resolves to. Pass it explicitly once the UI knows which branch is open —
   * carts_one_open_per_storefront_idx is per branch, and two branches of one
   * brand are deliberately two carts.
   */
  storefrontId?: string,
): Promise<Cart> {
  const branchId = storefrontId ?? (await resolvePrimaryStorefrontId(db, vendorId));

  const existing = unwrapMaybe<Row>(
    await db
      .from('carts')
      .select('id, vendor_id, cart_items(*, listing:listings(name, image_url))')
      .eq('storefront_id', branchId)
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
      .insert({ vendor_id: vendorId, student_id: studentId, storefront_id: branchId })
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
    .select(ORDER_SELECT)
    .order('placed_at', { ascending: false })
    .range(from, to);

  if (opts.status) q = q.eq('status', opts.status);

  const rows = await attachVendorNames(db, unwrapList<Row>(await q));
  return rows.map(toOrder);
}

export async function fetchOrder(db: Client, orderId: string): Promise<FoodOrder | null> {
  const row = unwrapMaybe<Row>(
    await db
      .from('orders')
      .select(ORDER_SELECT)
      .eq('id', orderId)
      .maybeSingle(),
  );
  if (!row) return null;
  const [withVendor] = await attachVendorNames(db, [row]);
  return toOrder(withVendor);
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
    // lat/lng, not `current_geo`: the geography column reads back as WKB hex
    // over PostgREST, so the old `toLatLng(row.current_geo)` was null for every
    // rider and the map never showed one. See 20260825090000_rider_coords.
    riderPosition:
      typeof row.lat === 'number' && typeof row.lng === 'number'
        ? { lat: row.lat, lng: row.lng }
        : null,
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
