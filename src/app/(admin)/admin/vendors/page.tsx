/**
 * ROUTE: /admin/vendors
 * ACCESS: admin / super_admin only, enforced here AND in every server action.
 * PURPOSE: The account queue   review what somebody uploaded and decide whether
 *          they are real.
 *
 * IT ONLY EVER SERVES A TRADE NOW
 *   This page used to have two jobs: `?category=food` narrowed the list to one
 *   trade, and no category at all listed EVERYTHING   which is what
 *   /admin/accounts is for. That second job is why the tab bar carried a
 *   "Businesses" tab whose contents were students and riders.
 *
 *   Without a category it redirects there. `?category=` still narrows the same
 *   flattened list to one trade, which is the only thing this route was ever
 *   uniquely good at.
 *
 * IT LISTS EVERYONE, IT DOES NOT DECIDE FOR EVERYONE
 *   A row opens the review screen belonging to its own kind   a landlord on
 *   /admin/landlord where the hostels are, a rider on /admin/riders, a student
 *   on /admin/students. Listing in one place and deciding in the right place is
 *   the shape here, and the reason this page can afford to hold every kind.
 *
 * The route guard mirrors /admin/users: read the trusted role, redirect to /403
 * otherwise, then use the service-role client. Admin work is cross-tenant, so
 * it deliberately bypasses RLS   which is exactly why the guard is repeated in
 * `modules/admin/actions` rather than trusted from here alone.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireStaffArea } from '@/modules/admin/guard';
import { visibleAreas } from '@/modules/access/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';
import { listAccounts } from '@/modules/admin/accounts';
import { ACCOUNT_AREA, type AccountKind } from '@/modules/admin/account-types';
import { selfieUrlsFor } from '@/modules/admin/selfies';
import { AccountTabs, type AccountTabKey } from '@/components/admin/account-tabs';
import { VerificationQueue, type QueueEntry } from './(components)/verification-queue';

export const metadata: Metadata = { title: 'Accounts   Admin' };

/**
 * The business categories this page can be narrowed to.
 *
 * There is no 'landlord' tab: landlords have a screen of their own, where the
 * properties they let can be shown. They are still in the unfiltered list
 * they are businesses   and a landlord row there opens that screen.
 *
 * Anything not in this list is ignored rather than passed to the database   a
 * category comes from the URL, and an unrecognised one should show the full
 * list, not an empty one or a query error.
 */
/**
 * The requirement-list role each kind of account is asked under   the same
 * vocabulary verification_documents.role uses. It lives here because this is
 * the only screen that has to translate between "kind of card" and "which
 * application its documents belong to".
 */
const ROLE_OF_KIND: Record<AccountKind, string> = {
  vendor: 'vendor',
  landlord: 'landlord',
  rider: 'rider',
  company: 'company',
  student: 'student',
  organiser: 'event_manager',
};

/** All of them, for spreading an unattributed document across every card. */
const ACCOUNT_ROLES = Object.values(ROLE_OF_KIND);

const CATEGORIES = {
  food: 'Food',
  beauty: 'Beauty',
  laundry: 'Laundry',
  tradesman: 'Workmanship',
} as const;

type Category = keyof typeof CATEGORIES;

function parseCategory(value: string | undefined): Category | null {
  return value && value in CATEGORIES ? (value as Category) : null;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireStaffArea('vendors');

  const category = parseCategory((await searchParams).category);

  // NO CATEGORY, NO PAGE. Unfiltered, this route rendered every kind of account
  // under the heading "Account verification"   which is /admin/accounts, built
  // for exactly that and reached by the All tab. Two routes answering one
  // question is how the Businesses tab came to be the All tab wearing the wrong
  // label. This one now serves a trade or sends you to the list that serves
  // everybody, and old links keep working either way.
  if (!category) redirect('/admin/accounts');

  const admin = createAdminClient();

  const [accounts, areas, { data: docs }] = await Promise.all([
    listAccounts(),
    // null is a super admin: no filtering. Otherwise this list is cut to the
    // kinds the viewer is allowed to open   see ACCOUNT_AREA.
    visibleAreas(),
    // Documents are fetched separately rather than embedded: verification_documents
    // has no FK to vendor_profiles (it points at profiles), and this codebase has
    // been bitten repeatedly by embeds that cannot resolve.
    admin.from('verification_documents').select('owner_id, role, status'),
  ]);

  // Narrowed AFTER the read, not in the query: the tabs cut one flattened list
  // six tables wide, and re-deriving "vendors of this trade" from the tables
  // would be a second definition of the same thing   which is the bug this
  // page just came out of. Only the filtered rows are sent to the browser.
  const rows = accounts.filter(
    (a) => (!areas || areas.includes(ACCOUNT_AREA[a.kind])) && (!category || a.detail === category),
  );

  /*
   * COUNTED PER OWNER *AND* PER ROLE.
   *
   * This list holds six kinds of account and the documents are keyed on the
   * person, so a landlord who is also a student was credited with the student's
   * approved school ID   and vice versa. Keying the tally on "owner + the role
   * this row is about" is what makes the number on a card mean the same thing
   * as the folder it opens.
   *
   * A null role still counts for whichever card asks: it predates the column
   * and belongs to no single application.
   */
  const key = (owner: string, role: string) => owner + ':' + role;
  const docCount = new Map<string, { total: number; approved: number }>();
  for (const d of (docs ?? []) as Row[]) {
    const owner = d.owner_id as string;
    const role = (d.role as string | null) ?? null;
    // A null-role row is counted under every kind; a stamped one under its own.
    const roles = role === null ? ACCOUNT_ROLES : [role];
    for (const r of roles) {
      const c = docCount.get(key(owner, r)) ?? { total: 0, approved: 0 };
      c.total += 1;
      if (d.status === 'approved') c.approved += 1;
      docCount.set(key(owner, r), c);
    }
  }

  // The face for the card. One round trip for the whole page   see
  // modules/admin/selfies for why the queue is scannable by sight at all.
  const selfieByOwner = await selfieUrlsFor([...new Set(rows.map((r) => r.personId))]);

  const entries: QueueEntry[] = rows.map((r) => {
    // The row's kind IS the application its documents belong to. 'company' is
    // a fleet, asked for the rider set under its own role name.
    const counted = docCount.get(key(r.personId, ROLE_OF_KIND[r.kind])) ?? {
      total: 0,
      approved: 0,
    };
    return {
      ...r,
      selfieUrl: selfieByOwner.get(r.personId),
      docsTotal: counted.total,
      docsApproved: counted.approved,
    };
  });

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / ACCOUNTS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          {category ? CATEGORIES[category] : 'Account'}{' '}
          <span className="text-lime-deep">verification.</span>
        </h2>
      </div>

      {/* The active tab is named, not inferred: this one route serves five of
          them and the pathname is identical for all five. */}
      <AccountTabs active={category as AccountTabKey} />

      <VerificationQueue rows={entries} />
    </section>
  );
}
