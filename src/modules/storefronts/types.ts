/**
 * Domain types for the 'storefronts' module.
 *
 * NAMING, ONCE: the product says **storefront** for the business and **store**
 * for one of its locations. This module's table is called `storefronts` and
 * holds STORES   it was named before the vocabulary settled. The business is
 * `vendor_profiles`. See ./README.md; the `Storefront` type below is a STORE.
 */

export interface Storefront {
  id: string;
  /** The storefront (business) that owns this store. Equals the owner's `auth.uid()`. */
  vendorId: string;
  /** Store name, e.g. "Tanke store"   not the business name. */
  name: string;
  slug: string;
  area?: string | null;
  campusId?: string | null;
  /**
   * null when the vendor never dropped a pin; discovery falls back to `area`.
   * Backed by the plain lat/lng columns   `geo` is derived and unreadable over
   * PostgREST (it returns WKB hex).
   */
  coords?: { lat: number; lng: number } | null;
  address?: string | null;
  publicPhone?: string | null;
  /** "HH:MM:SS" from Postgres `time`, or null when hours were never set. */
  opensAt?: string | null;
  closesAt?: string | null;
  /** The manual switch. Off means closed until somebody turns it back on. */
  isAcceptingOrders: boolean;
  /**
   * The cooldown deadline. A store inside one takes no new orders and then
   * reopens by itself   nothing has to run for the pause to end, which is why
   * this is a timestamp and not a second boolean.
   */
  pausedUntil?: string | null;
  pauseReason?: 'manual' | 'auto_backlog' | null;
  /**
   * Pause automatically once this many orders are accepted and unfinished.
   * `0` = never. Every store starts at DEFAULT_AUTO_PAUSE_AFTER   this used to
   * be null-by-default, which meant the feature existed and protected nobody.
   */
  autoPauseAfter: number;
  /**
   * How long an automatic pause lasts *if nothing moves*. Normally the pause
   * ends earlier, when the backlog drops back under the limit   see
   * `sync_store_backlog_pause` in 20260901090000. This is the floor that stops
   * an abandoned store staying shut forever, not the expected duration.
   */
  autoPauseMinutes: number;
  /** Photo of this location. Null falls back to the business logo. */
  imageUrl?: string | null;
  /** Exactly one per storefront. A link to the business resolves here. */
  isPrimary: boolean;
  /**
   * When an agent stood at this address and confirmed the shop is trading.
   * Null means it has not happened yet   which is the normal state for a store
   * that was created minutes ago, since creating one only QUEUES the visit
   * (20260912120000).
   *
   * Read-only from the client: `guard_storefront_privileged_cols` restores this
   * on any update from `authenticated`, owner included. A shop cannot certify
   * that it exists.
   */
  verifiedAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
}

/**
 * Whether a store takes orders right now. Mirrors `store_accepting_orders()`
 * exactly   if you change one, change the other, or the button and the till
 * will disagree.
 */
export function isStoreOpen(s: Pick<Storefront, 'isAcceptingOrders' | 'pausedUntil' | 'archivedAt'>): boolean {
  if (!s.isAcceptingOrders || s.archivedAt) return false;
  return !s.pausedUntil || new Date(s.pausedUntil) <= new Date();
}

/** Whole minutes left on a cooldown, or 0 when there is none. */
export function pauseMinutesLeft(pausedUntil?: string | null): number {
  if (!pausedUntil) return 0;
  const ms = new Date(pausedUntil).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/** A store plus the business fields a student needs to recognise it. */
export interface StorefrontWithBrand extends Storefront {
  businessName?: string | null;
  logoUrl?: string | null;
  category?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  /** Metres from the point searched. Only set by `fetchNearbyStorefronts`. */
  distanceM?: number | null;
}

export interface StorefrontInput {
  name: string;
  slug?: string;
  area?: string | null;
  campusId?: string | null;
  coords?: { lat: number; lng: number } | null;
  address?: string | null;
  publicPhone?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  isAcceptingOrders?: boolean;
  imageUrl?: string | null;
  /** `0` (or null, which is normalised to 0) turns automatic pausing off. */
  autoPauseAfter?: number | null;
  autoPauseMinutes?: number;
}

// -- Staff --------------------------------------------------------------------

export type StaffRole = 'manager' | 'staff';

/**
 * What one person may reach at one store.
 *
 * MUST MATCH `private.storefront_scope_names()` and the CHECK constraints on
 * `storefront_staff` / `storefront_invites`. The database is the authority  
 * an unknown name here is refused by the RPC rather than silently stored.
 *
 * MONEY IS NOT ON THIS LIST AND WILL NOT BE. Wallet, payouts, bank accounts and
 * the subscription live on `vendor_profiles` (the business); nothing scoped to
 * a store can reach them. See ./README.md.
 */
export type StaffScope = 'orders' | 'listings' | 'inbox' | 'store' | 'promotions';

export const STAFF_SCOPES: ReadonlyArray<{
  value: StaffScope;
  label: string;
  description: string;
  /**
   * False while the database cannot actually enforce the scope. Conversations
   * resolve their vendor from `listings.vendor_id` and carry no
   * `storefront_id`, so a store's messages still reach the owner alone. The
   * grant is recorded for when messaging becomes store-routed; until then it
   * opens nothing, and the UI has to say so rather than imply access.
   */
  enforced: boolean;
  /**
   * True when the grant is NOT limited to the store it was given at.
   * `promotions.vendor_id` points at the business, so there is no such thing
   * as a one-store discount   the picker has to say so before the owner ticks
   * it, not after they find out.
   */
  businessWide?: boolean;
}> = [
  {
    value: 'orders',
    label: 'Orders',
    description: 'See the queue, advance orders, and pause the store when it gets busy.',
    enforced: true,
  },
  {
    value: 'listings',
    label: 'Listings & stock',
    description: 'Add and edit items, prices and stock for this store.',
    enforced: true,
  },
  {
    value: 'inbox',
    label: 'Inbox',
    description: 'Customer messages. Not yet routed per store   messages still reach you only.',
    enforced: false,
  },
  {
    value: 'store',
    label: 'Store settings',
    description: 'Trading hours, area and map pin. Never archiving, primary, or adding stores.',
    enforced: true,
  },
  {
    value: 'promotions',
    label: 'Promotions',
    description:
      'Create and end discount campaigns. A campaign belongs to the business, so it applies at every store   not just this one.',
    enforced: true,
    businessWide: true,
  },
];

/** Every scope, for the "all sections" shortcut. */
export const ALL_STAFF_SCOPES: StaffScope[] = STAFF_SCOPES.map((s) => s.value);

/** The set an invite starts with   the two an extra pair of hands actually needs. */
export const DEFAULT_STAFF_SCOPES: StaffScope[] = ['orders', 'listings'];

/** Every store starts here. `0` means the vendor turned it off. */
export const DEFAULT_AUTO_PAUSE_AFTER = 5;

export function scopeLabel(scope: string): string {
  return STAFF_SCOPES.find((s) => s.value === scope)?.label ?? scope;
}

/** A row from `storefront_roster()`   owner-scoped, so it carries the email. */
export interface StorefrontStaffMember {
  staffId: string;
  storefrontId: string;
  branchName: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  role: StaffRole;
  /** Which parts of the store this person may work. Never empty. */
  scopes: StaffScope[];
  joinedAt: string;
  revokedAt: string | null;
  isActive: boolean;
}

/** From `storefront_invites_pending()`. The token is deliberately absent. */
export interface StorefrontInvite {
  inviteId: string;
  storefrontId: string;
  branchName: string;
  email: string;
  role: StaffRole;
  scopes: StaffScope[];
  invitedAt: string;
  expiresAt: string;
  isExpired: boolean;
}

/** What `create_storefront_invite()` hands back, once. */
export interface CreatedInvite {
  inviteId: string;
  /** Show it once, deliver it out of band. It is never readable again. */
  token: string;
  expiresAt: string;
}

/** One row of the owner's activity feed. */
export interface ActivityEvent {
  occurredAt: string;
  actorId: string | null;
  /** full_name, else email, else "System" / "Removed account"   never blank. */
  actorName: string;
  actorRole: 'owner' | 'staff' | 'system' | string;
  /** e.g. "listing.insert", "order.update.preparing". */
  action: string;
  entityType: string;
  entityId: string | null;
  storefrontId: string;
  summary: {
    name?: string;
    status?: string;
    price_kobo?: string;
    stock?: string;
    total_kobo?: string;
  };
}

/** A branch the signed-in user can act on, and in what capacity. */
export interface ManagedStorefront extends Storefront {
  /** Owners may do everything; staff are limited by RLS and the column guard. */
  capacity: 'owner' | 'staff';
  /**
   * What this user may reach here. Every scope for an owner; whatever they
   * were granted for staff. UX only   RLS is what actually refuses.
   */
  scopes: StaffScope[];
}

/** Whether the signed-in user may work one part of a store. UX, not security. */
export function hasScope(
  store: Pick<ManagedStorefront, 'capacity' | 'scopes'> | null | undefined,
  scope: StaffScope,
): boolean {
  if (!store) return false;
  return store.capacity === 'owner' || store.scopes.includes(scope);
}

// -- Performance --------------------------------------------------------------

/**
 * Per-store reporting. NOT a second ledger   see ./README.md. Money is per
 * business and lives on `vendor_profiles`; these are aggregates over the same
 * orders and escrow rows the earnings screen reads, grouped by store.
 */
export interface StorePerformance {
  storefrontId: string;
  storeName: string;
  /** Archived stores are included: one closed in March still earned in February. */
  isArchived: boolean;
  ordersTotal: number;
  ordersCompleted: number;
  /** Accepted and not yet finished   pending through on_the_way. */
  ordersActive: number;
  ordersCancelled: number;
  ordersRefunded: number;
  /** Released escrow, net of platform commission. What actually arrived. */
  revenueKobo: number;
  /** Paid for and not refunded, released or not. Revenue plus the pipeline. */
  bookedKobo: number;
  refundedKobo: number;
  /** Averaged over delivered orders only   see the RPC for why. */
  avgOrderKobo: number;
  lastOrderAt: string | null;
}

/** One month, one store. Empty months are zeros, never gaps. */
export interface StoreRevenuePoint {
  /** First day of the month, as `YYYY-MM-DD`. */
  month: string;
  storefrontId: string;
  storeName: string;
  revenueKobo: number;
  ordersCount: number;
}

/**
 * The tabs on the transactions table.
 *
 * THESE ARE FILTERS, NOT A PARTITION. `cancel_order` refunds in the same
 * transaction, so a cancelled order is usually also a refunded one and shows
 * under both. Only `all` is the whole set   do not sum the tabs.
 *
 * `refunded` is what the product calls "returned": there is no returns concept
 * in the schema, and money going back (`escrow_holds.status = 'refunded'`) is
 * the real thing underneath it.
 */
export type TransactionBucket = 'all' | 'completed' | 'pending' | 'cancelled' | 'refunded';

export const TRANSACTION_BUCKETS: ReadonlyArray<{ value: TransactionBucket; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'Pending' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'cancelled', label: 'Cancelled' },
];

export interface StoreTransaction {
  orderId: string;
  storefrontId: string;
  storeName: string;
  status: string;
  isRefunded: boolean;
  /** What the customer paid. */
  totalKobo: number;
  /** What reached the vendor   released escrow less commission. 0 until release. */
  netKobo: number;
  itemCount: number;
  placedAt: string;
  deliveredAt: string | null;
  studentName: string;
}
