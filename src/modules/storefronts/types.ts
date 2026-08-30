/**
 * Domain types for the 'storefronts' module.
 *
 * NAMING, ONCE: the product says **storefront** for the business and **store**
 * for one of its locations. This module's table is called `storefronts` and
 * holds STORES — it was named before the vocabulary settled. The business is
 * `vendor_profiles`. See ./README.md; the `Storefront` type below is a STORE.
 */

export interface Storefront {
  id: string;
  /** The storefront (business) that owns this store. Equals the owner's `auth.uid()`. */
  vendorId: string;
  /** Store name, e.g. "Tanke store" — not the business name. */
  name: string;
  slug: string;
  area?: string | null;
  campusId?: string | null;
  /**
   * null when the vendor never dropped a pin; discovery falls back to `area`.
   * Backed by the plain lat/lng columns — `geo` is derived and unreadable over
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
   * reopens by itself — nothing has to run for the pause to end, which is why
   * this is a timestamp and not a second boolean.
   */
  pausedUntil?: string | null;
  pauseReason?: 'manual' | 'auto_backlog' | null;
  /**
   * Pause automatically once this many orders are accepted and unfinished.
   * null = never; a vendor has to say what their kitchen can hold.
   */
  autoPauseAfter?: number | null;
  /** How long an automatic pause lasts. */
  autoPauseMinutes: number;
  /** Exactly one per storefront. A link to the business resolves here. */
  isPrimary: boolean;
  archivedAt?: string | null;
  createdAt: string;
}

/**
 * Whether a store takes orders right now. Mirrors `store_accepting_orders()`
 * exactly — if you change one, change the other, or the button and the till
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
  autoPauseAfter?: number | null;
  autoPauseMinutes?: number;
}

// -- Staff --------------------------------------------------------------------

export type StaffRole = 'manager' | 'staff';

/** A row from `storefront_roster()` — owner-scoped, so it carries the email. */
export interface StorefrontStaffMember {
  staffId: string;
  storefrontId: string;
  branchName: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  role: StaffRole;
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
  /** full_name, else email, else "System" / "Removed account" — never blank. */
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
}
