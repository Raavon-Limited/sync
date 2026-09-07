/**
 * One shape for every kind of account staff can review.
 *
 * WHY THIS FILE IS SEPARATE FROM `accounts.ts`
 *   The loader is service-role and marked 'server-only'. These types are read
 *   by client components   the queue browser and the oversight list   and a
 *   client importing anything out of a 'server-only' module fails the build,
 *   type-only import or not. So the shape lives here and the query lives there.
 *
 * A VENDOR, A LANDLORD, A RIDER, A FLEET, A STUDENT AND AN ORGANISER
 *   are six tables with six different sets of columns, and none of that matters
 *   to the two questions every admin list asks: who is this, and where do they
 *   stand. Flattening once, server-side, is what stops a seventh kind of
 *   account appearing in one list and not the others   which is exactly how
 *   /admin/vendors ended up unable to show a landlord.
 */

export type AccountKind = 'vendor' | 'landlord' | 'rider' | 'company' | 'student' | 'organiser';

export const ACCOUNT_LABEL: Record<AccountKind, string> = {
  vendor: 'Vendor',
  landlord: 'Landlord',
  rider: 'Rider',
  company: 'Fleet',
  student: 'Student',
  organiser: 'Organiser',
};

/**
 * The access area that governs each kind, from modules/access/areas.
 *
 * The tab bar already hides a tab a reviewer cannot open   a rider reviewer is
 * not offered Landlords   so a list that mixes every kind has to be filtered
 * the same way, or 'All' becomes the hole in a permission model the rest of the
 * console is careful about. Fleets sit under riders: same screen, same grant.
 */
export const ACCOUNT_AREA: Record<AccountKind, string> = {
  vendor: 'vendors',
  landlord: 'landlords',
  rider: 'riders',
  company: 'riders',
  student: 'students',
  organiser: 'events',
};

export interface AccountRecord {
  /** The row's own id, in whichever table it came from. */
  id: string;
  /**
   * The PERSON behind it, which is not always `id`. Documents and the live
   * photo hang off profiles, and a logistics company is a row with an owner
   * rather than a person   so anything that reads verification_documents keys
   * off this, never off `id`.
   */
  personId: string;
  kind: AccountKind;
  name: string;
  /** The second line: a vendor category, a department, a role. */
  detail: string;
  /** Businesses only   nobody else has one, so it is optional rather than ' '. */
  area?: string | null;
  /** One of unverified | pending | verified | rejected. */
  status: string;
  /** Fraud block: a rejection that cannot be re-applied against. */
  blocked: boolean;
  /** Suspension, which is a fact about the person and orthogonal to status. */
  suspended: boolean;
  /** The screen that can actually decide this one. */
  href: string;
  createdAt: string;
}

/**
 * Roles that have nothing to verify, ever.
 *
 * WHY THIS EXISTS AS A SHARED RULE
 *   `profiles.verification_status` is `not null default 'unverified'` (0001), so
 *   EVERY account carries that word from the moment it is created   including
 *   the ones that will never apply for anything. Staff do not trade. An agent
 *   arrives by invitation, which is a stronger check than any document review,
 *   and there is no agent application to approve.
 *
 *   So /admin/users listed every super admin and every invited agent as
 *   "Unverified": a task-shaped label against people for whom no such task can
 *   ever exist, sitting in the same column as vendors who genuinely are waiting
 *   on a decision. /admin/accounts had already worked this out for staff and
 *   written its own private STAFF set; agents were added later and nobody
 *   updated it, so they fell through to the same wrong word.
 *
 *   One rule, in a client-safe module, because both screens need it and a
 *   second copy is how the first one came to be out of date.
 */
const NO_VERIFICATION = new Set(['admin', 'super_admin', 'agent']);

/** True when this role can actually hold a verification decision. */
export function hasVerification(role?: string | null): boolean {
  return !!role && !NO_VERIFICATION.has(role);
}

/**
 * The four values `profiles.verification_status` may hold, per 0001's check
 * constraint.
 *
 * 'active' IS NOT ONE OF THEM. /admin/users tested for it in three places   the
 * badge, the stat tile and the filter   so the green badge was unreachable, the
 * "Active" count was permanently 0, and the Active filter returned nothing on a
 * platform full of verified accounts.
 */
export const VERIFICATION_STATUSES = ['unverified', 'pending', 'verified', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
