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
import type {
  ActivityEvent,
  CreatedInvite,
  ManagedStorefront,
  StaffRole,
  Storefront,
  StorefrontInput,
  StorefrontInvite,
  StorefrontStaffMember,
  StorefrontWithBrand,
} from './types';

type Client = SupabaseClient<Database>;
type Row = Record<string, any>;

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
  autoPauseAfter: r.auto_pause_after ?? null,
  autoPauseMinutes: r.auto_pause_minutes ?? 10,
  isPrimary: !!r.is_primary,
  archivedAt: r.archived_at ?? null,
  createdAt: r.created_at,
});

const SELECT = '*';

// -- Read --------------------------------------------------------------------

/**
 * Every branch a brand owns, primary first. `vendorId` is the owner's uid,
 * because vendor_profiles.id references profiles.id.
 */
export async function fetchStorefronts(db: Client, vendorId: string): Promise<Storefront[]> {
  return unwrapList<Row>(
    await db
      .from('storefronts')
      .select(SELECT)
      .eq('vendor_id', vendorId)
      .is('archived_at', null)
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
    throw new Error(`Vendor ${vendorId} has no active storefront`);
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
  // Capacity is an operational setting like trading hours, so a manager can
  // set it. `paused_until` is deliberately NOT patchable here — it goes
  // through pause_store/resume_store, which carry the permission check and
  // the reason.
  if (input.autoPauseAfter !== undefined) patch.auto_pause_after = input.autoPauseAfter;
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
 * Soft delete. Hard-deleting would cascade listings and carts away, and
 * `orders.storefront_id` is ON DELETE RESTRICT precisely so a branch with
 * history cannot be erased.
 */
export async function archiveStorefront(db: Client, id: string): Promise<void> {
  const { error } = await db
    .from('storefronts')
    .update({ archived_at: new Date().toISOString(), is_primary: false })
    .eq('id', id);
  if (error) throw error;
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
  ).map((r) => ({ ...toStorefront(r), capacity: 'owner' as const }));

  // storefront_staff_read lets you see your OWN membership rows.
  const memberships = unwrapList<Row>(
    await db
      .from('storefront_staff')
      .select('storefront_id')
      .eq('user_id', userId)
      .is('revoked_at', null),
  );

  const ownedIds = new Set(owned.map((s) => s.id));
  const staffedIds = memberships
    .map((m) => m.storefront_id as string)
    .filter((id) => !ownedIds.has(id));

  if (!staffedIds.length) return owned;

  const staffed = unwrapList<Row>(
    await db.from('storefronts').select(SELECT).in('id', staffedIds).is('archived_at', null),
  ).map((r) => ({ ...toStorefront(r), capacity: 'staff' as const }));

  return [...owned, ...staffed];
}

const toStaff = (r: Row): StorefrontStaffMember => ({
  staffId: r.staff_id,
  storefrontId: r.storefront_id,
  branchName: r.branch_name,
  userId: r.user_id,
  fullName: r.full_name ?? null,
  email: r.email ?? null,
  role: r.role,
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
  input: { storefrontId: string; email: string; role?: StaffRole },
): Promise<CreatedInvite> {
  const { data, error } = await db.rpc('create_storefront_invite', {
    p_storefront_id: input.storefrontId,
    p_email: input.email,
    p_role: input.role ?? 'manager',
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Row;
  if (!row) throw new Error('Invite was not created');
  return { inviteId: row.invite_id, token: row.token, expiresAt: row.expires_at };
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
  opts: { storefrontId?: string; limit?: number } = {},
): Promise<ActivityEvent[]> {
  const { data, error } = await db.rpc('storefront_activity', {
    p_storefront_id: opts.storefrontId,
    p_limit: opts.limit,
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

export async function fetchStoreListings(db: Client, storefrontId: string): Promise<StoreListing[]> {
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
