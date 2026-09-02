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
