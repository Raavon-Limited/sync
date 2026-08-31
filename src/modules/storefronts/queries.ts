/**
 * Data access for the 'storefronts' module.
 *
 * The only file here that knows column names. See ./README.md for the
 * vendor_id (who owns it) vs storefront_id (where it happens) distinction —
 * getting those backwards is the most likely bug in anything built on this.
 *
 * Every function takes the Supabase client as its first argument rather than
 * importing one, so the same code serves the browser client, the request-scoped
 * server client and the service-role client.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { unwrap, unwrapList, unwrapMaybe } from '@/lib/query/helpers';
import {
  ALL_STAFF_SCOPES,
  DEFAULT_AUTO_PAUSE_AFTER,
  DEFAULT_STAFF_SCOPES,
  type ActivityEvent,
  type CreatedInvite,
  type ManagedStorefront,
  type StaffRole,
  type StaffScope,
  type Storefront,
  type StorefrontInput,
  type StorefrontInvite,
  type StorefrontStaffMember,
  type StorefrontWithBrand,
  type StorePerformance,
  type StoreRevenuePoint,
  type StoreTransaction,
  type TransactionBucket,
} from './types';

type Client = SupabaseClient<Database>;
import type { Row } from '@/lib/supabase/row';

/**
 * Coordinates come from the plain `lat`/`lng` columns, never from `geo`.
 * Over PostgREST a geography column reads back as WKB hex ("0101000020E61..."),
 * so `geo.coordinates` is always undefined — a reader written against it fails
 * silently and simply never renders a pin. See 20260822100000_storefront_coords.
 */
function toCoords(r: Row) {
  if (typeof r.lat !== 'number' || typeof r.lng !== 'number') return null;
  return { lat: r.lat, lng: r.lng };
}

const toStorefront = (r: Row): Storefront => ({
  id: r.id,
  vendorId: r.vendor_id,
  name: r.name,
  slug: r.slug,
  area: r.area ?? null,
  campusId: r.campus_id ?? null,
  coords: toCoords(r),
  address: r.address ?? null,
  publicPhone: r.public_phone ?? null,
  opensAt: r.opens_at ?? null,
  closesAt: r.closes_at ?? null,
  isAcceptingOrders: r.is_accepting_orders ?? true,
  pausedUntil: r.paused_until ?? null,
  pauseReason: r.pause_reason ?? null,
  // `?? DEFAULT` rather than `?? null`: the column is NOT NULL since
  // 20260901090000, and a row read back from an older cache should still
  // describe the behaviour the database will actually apply.
  autoPauseAfter: r.auto_pause_after ?? DEFAULT_AUTO_PAUSE_AFTER,
  autoPauseMinutes: r.auto_pause_minutes ?? 10,
  imageUrl: r.image_url ?? null,
  isPrimary: !!r.is_primary,
  archivedAt: r.archived_at ?? null,
  createdAt: r.created_at,
});

const SELECT = '*';

// -- Read --------------------------------------------------------------------

/**
 * Every branch a brand owns, primary first. `vendorId` is the owner's uid,
 * because vendor_profiles.id references profiles.id.
 *
 * `includeArchived` exists for the owner's own management screen and nothing
 * else. Archived stores are invisible to students at the policy level
 * (`storefronts_select_public` is `using (archived_at is null)`), so this flag
 * cannot leak one — the owner's own policy is what returns them, and only to
 * them. Every other caller wants the default.
 */
export async function fetchStorefronts(
  db: Client,
  vendorId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Storefront[]> {
  let q = db.from('storefronts').select(SELECT).eq('vendor_id', vendorId);
  if (!opts.includeArchived) q = q.is('archived_at', null);
  return unwrapList<Row>(
    await q
      // Archived stores sink to the bottom of the owner's list — they are
      // history, not somewhere they are choosing to work today.
      .order('archived_at', { ascending: true, nullsFirst: true })
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true }),
  ).map(toStorefront);
}

export async function fetchStorefrontBySlug(db: Client, slug: string): Promise<Storefront | null> {
  const row = unwrapMaybe<Row>(
    await db.from('storefronts').select(SELECT).eq('slug', slug).maybeSingle(),
  );
  return row ? toStorefront(row) : null;
}

/**
 * Branches near a point, nearest first.
 *
 * No brand embed: `storefronts.vendor_id` points at vendor_profiles, but the
 * RPC already joins the brand columns, which avoids a second round trip AND the
 * class of broken PostgREST embed that bit orders and conversations.
 *
 * Omit `radiusM` to RANK by distance rather than filter by it — a hard cutoff
 * shows an empty app to anyone just outside it.
 */
export async function fetchNearbyStorefronts(
  db: Client,
  opts: { lat: number; lng: number; radiusM?: number; category?: string; limit?: number },
): Promise<StorefrontWithBrand[]> {
  const { data, error } = await db.rpc('nearby_storefronts', {
    p_lat: opts.lat,
    p_lng: opts.lng,
    p_radius_m: opts.radiusM,
    p_category: opts.category,
    p_limit: opts.limit,
  });
  if (error) throw error;

  return ((data ?? []) as Row[]).map((r) => ({
    ...toStorefront(r),
    businessName: r.business_name ?? null,
    logoUrl: r.logo_url ?? null,
    category: r.category ?? null,
    ratingAvg: Number(r.rating_avg ?? 0),
    ratingCount: r.rating_count ?? 0,
    distanceM: r.distance_m === null || r.distance_m === undefined ? null : Number(r.distance_m),
  }));
}

/**
 * The branch a brand-level action belongs to when the caller has not picked one.
 *
 * `listings.storefront_id` and `carts.storefront_id` are NOT NULL, so every
 * write has to name a branch. Callers that only know the brand (a link to the
 * business, a vendor creating their first item) resolve through here, which is
 * the same rule a brand URL follows: the primary branch.
 */
export async function resolvePrimaryStorefrontId(db: Client, vendorId: string): Promise<string> {
  const row = unwrapMaybe<Row>(
    await db
      .from('storefronts')
      .select('id')
      .eq('vendor_id', vendorId)
      .is('archived_at', null)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  );
  if (!row?.id) {
    // Every vendor_profiles row got a "Main branch" in the storefronts
    // backfill, so this means the brand itself is missing or archived.
    //
    // The vendor id stays in the log, not in the message: this throw reaches a
    // toast, and "Vendor 8f3c…-… has no active storefront" tells the person
    // holding the phone nothing and hands them an internal id.
    console.error('[storefronts] no active storefront for vendor', vendorId);
    throw new Error('This business has no active branch yet. Add a branch first.');
  }
  return row.id as string;
}

// -- Write -------------------------------------------------------------------

/** Slugs are globally unique; suffixing the brand slug keeps branches grouped. */
function slugify(vendorSlugOrName: string, branchName: string) {
  const base = `${vendorSlugOrName}-${branchName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `branch-${Date.now()}`;
}

export async function createStorefront(
  db: Client,
  vendorId: string,
  input: StorefrontInput & { brandSlug?: string },
): Promise<Storefront> {
  const row = unwrap<Row>(
    await db
      .from('storefronts')
      .insert({
        vendor_id: vendorId,
        name: input.name,
        slug: input.slug ?? slugify(input.brandSlug ?? vendorId.slice(0, 8), input.name),
        area: input.area ?? null,
        campus_id: input.campusId ?? null,
        // Plain columns; the storefronts_sync_geo trigger derives `geo`.
        // Writing `geo` directly here would need WKT, and GeoJSON is rejected.
        lat: input.coords?.lat ?? null,
        lng: input.coords?.lng ?? null,
        address: input.address ?? null,
        public_phone: input.publicPhone ?? null,
        opens_at: input.opensAt ?? null,
        closes_at: input.closesAt ?? null,
        is_accepting_orders: input.isAcceptingOrders ?? true,
        image_url: input.imageUrl ?? null,
        // Never on create. Promotion goes through set_primary_storefront, which
        // is the only path that cannot leave a brand with zero primary.
        is_primary: false,
      })
      .select(SELECT)
      .single(),
  );
  return toStorefront(row);
}

export async function updateStorefront(
  db: Client,
  id: string,
  input: Partial<StorefrontInput>,
): Promise<Storefront> {
  // Typed against the table rather than Record<string, any>: a patch builder is
  // exactly where a typo becomes a silently-ignored column.
  type Patch = Database['public']['Tables']['storefronts']['Update'];
  const patch: Patch = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.area !== undefined) patch.area = input.area;
  if (input.campusId !== undefined) patch.campus_id = input.campusId;
  if (input.address !== undefined) patch.address = input.address;
  if (input.publicPhone !== undefined) patch.public_phone = input.publicPhone;
  if (input.opensAt !== undefined) patch.opens_at = input.opensAt;
  if (input.closesAt !== undefined) patch.closes_at = input.closesAt;
  if (input.isAcceptingOrders !== undefined) patch.is_accepting_orders = input.isAcceptingOrders;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
  // Capacity is an operational setting like trading hours, so a manager can
  // set it. `paused_until` is deliberately NOT patchable here — it goes
  // through pause_store/resume_store, which carry the permission check and
  // the reason.
  // NOT NULL since 20260901090000, where 0 became the explicit "never". A UI
  // that still sends null for an empty field means the same thing and must not
  // hit a constraint violation to find that out.
  if (input.autoPauseAfter !== undefined) {
    patch.auto_pause_after = Math.max(0, Math.trunc(input.autoPauseAfter ?? 0));
  }
  if (input.autoPauseMinutes !== undefined) patch.auto_pause_minutes = input.autoPauseMinutes;
  if (input.coords !== undefined) {
    // Both or neither — storefronts_coords_both_or_neither rejects a half pin.
    patch.lat = input.coords?.lat ?? null;
    patch.lng = input.coords?.lng ?? null;
  }

  const row = unwrap<Row>(
    await db.from('storefronts').update(patch).eq('id', id).select(SELECT).single(),
  );
  return toStorefront(row);
}

/**
 * Take a store out of circulation, or put it back.
 *
 * ONE RPC, NOT A COLUMN WRITE. The plain update this replaces set
 * `archived_at` and cleared `is_primary`, which could leave a business with no
 * primary store at all — `storefronts_one_primary_idx` permits zero — and
 * happily archived a store with orders a student had already paid for.
 * `set_storefront_archived` refuses both and hands the primary flag on.
 *
 * Archived stores are already invisible to students: `storefronts_select_public`
 * is `using (archived_at is null)`, so discovery, `nearby_storefronts` and the
 * store's own page all drop it with no extra filtering anywhere.
 */
export async function setStorefrontArchived(
  db: Client,
  id: string,
  archived: boolean,
): Promise<Storefront> {
  const { data, error } = await db.rpc('set_storefront_archived', {
    p_storefront_id: id,
    p_archived: archived,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Row;
  if (!row) throw new Error('The store could not be updated');
  return toStorefront(row);
}

/** Soft delete. Kept as a named alias so existing callers keep the guards. */
export async function archiveStorefront(db: Client, id: string): Promise<void> {
  await setStorefrontArchived(db, id, true);
}

/** Atomic — see set_primary_storefront in 20260822090000_storefronts.sql. */
export async function setPrimaryStorefront(db: Client, id: string): Promise<void> {
  const { error } = await db.rpc('set_primary_storefront', { p_storefront_id: id });
  if (error) throw error;
}

// -- Staff --------------------------------------------------------------------

/**
 * Every branch the caller can act on, and in what capacity.
 *
 * `fetchStorefronts` filters on `vendor_id = you`, which is right for an owner
 * and wrong for a manager — an invited manager owns nothing and would see an
 * empty sidebar. This is the query the vendor shell should use.
 *
 * Two round trips rather than one: `storefronts` is publicly readable, so a
 * single query cannot express "mine or ones I staff" without leaking the shape
 * of the second half. The membership read is what RLS scopes.
 */
export async function fetchManagedStorefronts(
  db: Client,
  userId: string,
): Promise<ManagedStorefront[]> {
  const owned = unwrapList<Row>(
    await db
      .from('storefronts')
      .select(SELECT)
      .eq('vendor_id', userId)
      .is('archived_at', null)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true }),
    // An owner is not staff of their own store and has no row to read scopes
    // from. They hold every one by definition.
  ).map((r) => ({ ...toStorefront(r), capacity: 'owner' as const, scopes: ALL_STAFF_SCOPES }));

  // storefront_staff_read lets you see your OWN membership rows — including
  // the scopes, which is how the shell knows to hide a section this person was
  // never granted rather than let them walk into an empty page.
  const memberships = unwrapList<Row>(
    await db
      .from('storefront_staff')
      .select('storefront_id, scopes')
      .eq('user_id', userId)
      .is('revoked_at', null),
  );

  const ownedIds = new Set(owned.map((s) => s.id));
  const staffScopes = new Map<string, StaffScope[]>();
  for (const m of memberships) {
    const id = m.storefront_id as string;
    if (!ownedIds.has(id)) staffScopes.set(id, toScopes(m.scopes));
  }

  if (!staffScopes.size) return owned;

  const staffed = unwrapList<Row>(
    await db
      .from('storefronts')
      .select(SELECT)
      .in('id', [...staffScopes.keys()])
      .is('archived_at', null),
  ).map((r) => ({
    ...toStorefront(r),
    capacity: 'staff' as const,
    scopes: staffScopes.get(r.id as string) ?? [],
  }));

  return [...owned, ...staffed];
}

/**
 * A `text[]` column, defended against the two things it can arrive as.
 * PostgREST returns a JSON array, but a row that predates the column (a stale
 * cache, a hand-written fixture) has none at all — and a member with no scopes
 * would silently render as "can do nothing" rather than as an error.
 */
function toScopes(v: unknown): StaffScope[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is StaffScope => ALL_STAFF_SCOPES.includes(s as StaffScope));
}

const toStaff = (r: Row): StorefrontStaffMember => ({
  staffId: r.staff_id,
  storefrontId: r.storefront_id,
  branchName: r.branch_name,
  userId: r.user_id,
  fullName: r.full_name ?? null,
  email: r.email ?? null,
  role: r.role,
  scopes: toScopes(r.scopes),
  joinedAt: r.joined_at,
  revokedAt: r.revoked_at ?? null,
  isActive: !!r.is_active,
});

/** Owner-scoped. Returns names and emails, which the plain table cannot. */
export async function fetchRoster(
  db: Client,
  storefrontId?: string,
): Promise<StorefrontStaffMember[]> {
  const { data, error } = await db.rpc('storefront_roster', {
    p_storefront_id: storefrontId,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toStaff);
}

export async function fetchPendingInvites(
  db: Client,
  storefrontId?: string,
): Promise<StorefrontInvite[]> {
  const { data, error } = await db.rpc('storefront_invites_pending', {
    p_storefront_id: storefrontId,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    inviteId: r.invite_id,
    storefrontId: r.storefront_id,
    branchName: r.branch_name,
    email: r.email,
    role: r.role,
    scopes: toScopes(r.scopes),
    invitedAt: r.invited_at,
    expiresAt: r.expires_at,
    isExpired: !!r.is_expired,
  }));
}

/**
 * Owner only. The returned token is the credential and is never readable again
 * — show it once, or send it. Re-inviting the same address supersedes the
 * previous invite rather than colliding with it.
 */
export async function createInvite(
  db: Client,
  input: { storefrontId: string; email: string; role?: StaffRole; scopes?: StaffScope[] },
): Promise<CreatedInvite> {
  const { data, error } = await db.rpc('create_storefront_invite', {
    p_storefront_id: input.storefrontId,
    p_email: input.email,
    p_role: input.role ?? 'manager',
    // Never sent as an empty array: the RPC refuses one, and defaulting here
    // rather than there would let a caller with a bug hand someone nothing.
    p_scopes: input.scopes?.length ? input.scopes : DEFAULT_STAFF_SCOPES,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Row;
  if (!row) throw new Error('Invite was not created');
  return { inviteId: row.invite_id, token: row.token, expiresAt: row.expires_at };
}

/**
 * Change what an existing manager may reach.
 *
 * The alternative — revoke and re-invite — loses their history and makes them
 * redeem a second token to get back a job they never left.
 */
export async function setStaffScopes(
  db: Client,
  staffId: string,
  scopes: StaffScope[],
): Promise<void> {
  const { error } = await db.rpc('set_storefront_staff_scopes', {
    p_staff_id: staffId,
    p_scopes: scopes,
  });
  if (error) throw error;
}

/** Cancel an invite that has not been redeemed. The token dies with it. */
export async function revokeInvite(db: Client, inviteId: string): Promise<void> {
  const { error } = await db.rpc('revoke_storefront_invite', { p_invite_id: inviteId });
  if (error) throw error;
}

/** Returns the branch joined. Requires a CONFIRMED email matching the invite. */
export async function acceptInvite(db: Client, token: string): Promise<string> {
  const { data, error } = await db.rpc('accept_storefront_invite', { p_token: token });
  if (error) throw error;
  return data as string;
}

/** Revokes, never deletes — the activity trail must still resolve the actor. */
export async function revokeStaff(db: Client, staffId: string): Promise<void> {
  const { error } = await db.rpc('revoke_storefront_staff', { p_staff_id: staffId });
  if (error) throw error;
}

/**
 * The owner's oversight feed. Staff cannot read this by design: it is the
 * record of what they did, and someone who can read it can see what has been
 * noticed.
 */
export async function fetchActivity(
  db: Client,
  opts: { storefrontId?: string; limit?: number; search?: string; actorId?: string } = {},
): Promise<ActivityEvent[]> {
  const { data, error } = await db.rpc('storefront_activity', {
    p_storefront_id: opts.storefrontId,
    p_limit: opts.limit,
    // Searching happens in SQL, before the limit. Filtering a fetched page in
    // the component would only ever search the most recent N events and call
    // the result "everything this person did".
    p_search: opts.search?.trim() || undefined,
    p_actor_id: opts.actorId,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    occurredAt: r.occurred_at,
    actorId: r.actor_id ?? null,
    actorName: r.actor_name ?? 'System',
    actorRole: r.actor_role ?? 'system',
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id ?? null,
    storefrontId: r.storefront_id,
    summary: r.summary ?? {},
  }));
}

// -- Cooldown -----------------------------------------------------------------

/**
 * Pause a store for a few minutes. Returns the deadline the server set, not
 * the one the caller asked for: the clock that matters is the database's, and
 * a phone whose time is wrong would otherwise count down against the wrong
 * one.
 *
 * Permission lives in `pause_store` (`can_manage_storefront`), so staff who
 * are actually being buried can stop the tickets without phoning the owner.
 */
export async function pauseStore(db: Client, id: string, minutes: number): Promise<string> {
  const { data, error } = await db.rpc('pause_store', {
    p_storefront_id: id,
    p_minutes: minutes,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function resumeStore(db: Client, id: string): Promise<void> {
  const { error } = await db.rpc('resume_store', { p_storefront_id: id });
  if (error) throw error;
}

// -- Availability -------------------------------------------------------------

/**
 * What one store carries, and on what terms.
 *
 * `isAvailable` is a GENERATED column, not something written here — the
 * schema derives it from `isListed` and `stock` so a reader cannot disagree
 * with checkout about whether an item can be bought.
 */
export interface StoreListing {
  storefrontId: string;
  listingId: string;
  /** null = inherit the catalogue price. */
  priceKobo: number | null;
  /** null = untracked (cooked to order). 0 = sold out. */
  stock: number | null;
  /** The manual "not today", independent of stock. */
  isListed: boolean;
  isAvailable: boolean;
}

const toStoreListing = (r: Row): StoreListing => ({
  storefrontId: r.storefront_id,
  listingId: r.listing_id,
  priceKobo: r.price_kobo ?? null,
  stock: r.stock ?? null,
  isListed: !!r.is_listed,
  isAvailable: !!r.is_available,
});

export async function fetchStoreListings(
  db: Client,
  storefrontId: string,
): Promise<StoreListing[]> {
  return unwrapList<Row>(
    await db.from('storefront_listings').select('*').eq('storefront_id', storefrontId),
  ).map(toStoreListing);
}

/**
 * Set which stores carry an item and on what terms. Upserts, because "this
 * store now carries this" and "this store's price changed" are the same
 * gesture from the vendor's side.
 */
export async function setStoreListing(
  db: Client,
  input: {
    storefrontId: string;
    listingId: string;
    priceKobo?: number | null;
    stock?: number | null;
    isListed?: boolean;
  },
): Promise<StoreListing> {
  const row = unwrap<Row>(
    await db
      .from('storefront_listings')
      .upsert(
        {
          storefront_id: input.storefrontId,
          listing_id: input.listingId,
          ...(input.priceKobo !== undefined ? { price_kobo: input.priceKobo } : {}),
          ...(input.stock !== undefined ? { stock: input.stock } : {}),
          ...(input.isListed !== undefined ? { is_listed: input.isListed } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'storefront_id,listing_id' },
      )
      .select('*')
      .single(),
  );
  return toStoreListing(row);
}

/**
 * "Sold out" and "back in stock", the one-tap version.
 *
 * Sold out is `stock = 0`, not `is_listed = false`: the two mean different
 * things and conflating them loses the distinction between "we ran out today"
 * and "we do not do this here". Coming back sets stock to null — untracked —
 * because a vendor tapping "back in stock" is saying they have some, not
 * committing to count them.
 */
export async function setSoldOut(
  db: Client,
  storefrontId: string,
  listingId: string,
  soldOut: boolean,
): Promise<StoreListing> {
  return setStoreListing(db, { storefrontId, listingId, stock: soldOut ? 0 : null });
}

// -- Performance ---------------------------------------------------------------

/**
 * Per-store reporting. NOT a second ledger — money is per business and lives on
 * `vendor_profiles`; this is a `group by storefront_id` over the same orders
 * and escrow rows the earnings screen reads. See ./README.md.
 */
export async function fetchStorePerformance(db: Client): Promise<StorePerformance[]> {
  const { data, error } = await db.rpc('store_performance');
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    storefrontId: r.storefront_id,
    storeName: r.store_name,
    isArchived: !!r.is_archived,
    ordersTotal: r.orders_total ?? 0,
    ordersCompleted: r.orders_completed ?? 0,
    ordersActive: r.orders_active ?? 0,
    ordersCancelled: r.orders_cancelled ?? 0,
    ordersRefunded: r.orders_refunded ?? 0,
    // bigint arrives as a string over PostgREST once it passes 2^53 — and as a
    // number below it. Number() takes both; reading it as-is silently gives a
    // string that formats fine and adds up wrong.
    revenueKobo: Number(r.revenue_kobo ?? 0),
    bookedKobo: Number(r.booked_kobo ?? 0),
    refundedKobo: Number(r.refunded_kobo ?? 0),
    avgOrderKobo: Number(r.avg_order_kobo ?? 0),
    lastOrderAt: r.last_order_at ?? null,
  }));
}

export async function fetchStoreRevenueMonthly(
  db: Client,
  months = 6,
): Promise<StoreRevenuePoint[]> {
  const { data, error } = await db.rpc('store_revenue_monthly', { p_months: months });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    month: r.month,
    storefrontId: r.storefront_id,
    storeName: r.store_name,
    revenueKobo: Number(r.revenue_kobo ?? 0),
    ordersCount: r.orders_count ?? 0,
  }));
}

/**
 * One page of a store's orders.
 *
 * `totalRows` rides along on every row rather than coming from a second COUNT
 * query — two queries with the same filter can still disagree if an order
 * lands between them, and the pager is what shows the disagreement.
 */
export async function fetchStoreTransactions(
  db: Client,
  opts: {
    storefrontId?: string | null;
    bucket?: TransactionBucket;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ rows: StoreTransaction[]; total: number }> {
  const { data, error } = await db.rpc('store_transactions', {
    p_storefront_id: opts.storefrontId ?? undefined,
    p_bucket: opts.bucket ?? 'all',
    p_limit: opts.limit ?? 25,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw error;

  const raw = (data ?? []) as Row[];
  return {
    rows: raw.map((r) => ({
      orderId: r.order_id,
      storefrontId: r.storefront_id,
      storeName: r.store_name,
      status: r.status,
      isRefunded: !!r.is_refunded,
      totalKobo: Number(r.total_kobo ?? 0),
      netKobo: Number(r.net_kobo ?? 0),
      itemCount: r.item_count ?? 0,
      placedAt: r.placed_at,
      deliveredAt: r.delivered_at ?? null,
      studentName: r.student_name ?? 'Customer',
    })),
    // An empty page carries no row to read the count off, and that is not the
    // same as "we do not know" — it is zero.
    total: Number(raw[0]?.total_rows ?? 0),
  };
}
