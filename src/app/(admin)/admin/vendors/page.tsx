/**
 * ROUTE: /admin/vendors
 * ACCESS: admin / super_admin only, enforced here AND in every server action.
 * PURPOSE: The account queue   review what somebody uploaded and decide whether
 *          they are real.
 *
 * "ALL" MEANS ALL
 *   This page used to list vendor_profiles minus landlords, under a tab reading
 *   "All businesses". On a platform whose only registered business was a
 *   landlord that tab said "No vendors registered yet" while the overview card
 *   two clicks away counted one   and a reviewer had no single screen showing
 *   who exists and where each of them stands.
 *
 *   The unfiltered tab is now every account with a verification state, from
 *   modules/admin/accounts: businesses, landlords, riders, fleets, students and
 *   organisers, each with its role and its status on the card. `?category=`
 *   narrows the same list to one trade.
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
import { requireStaffArea } from '@/modules/admin/guard';
import { visibleAreas } from '@/modules/access/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';
import { listAccounts } from '@/modules/admin/accounts';
import { ACCOUNT_AREA } from '@/modules/admin/account-types';
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
  const admin = createAdminClient();

  const [accounts, areas, { data: docs }] = await Promise.all([
    listAccounts(),
    // null is a super admin: no filtering. Otherwise this list is cut to the
    // kinds the viewer is allowed to open   see ACCOUNT_AREA.
    visibleAreas(),
    // Documents are fetched separately rather than embedded: verification_documents
    // has no FK to vendor_profiles (it points at profiles), and this codebase has
    // been bitten repeatedly by embeds that cannot resolve.
    admin.from('verification_documents').select('owner_id, status'),
  ]);

  // Narrowed AFTER the read, not in the query: the tabs cut one flattened list
  // six tables wide, and re-deriving "vendors of this trade" from the tables
  // would be a second definition of the same thing   which is the bug this
  // page just came out of. Only the filtered rows are sent to the browser.
  const rows = accounts.filter(
    (a) => (!areas || areas.includes(ACCOUNT_AREA[a.kind])) && (!category || a.detail === category),
  );

  const docCount = new Map<string, { total: number; approved: number }>();
  for (const d of (docs ?? []) as Row[]) {
    const owner = d.owner_id as string;
    const c = docCount.get(owner) ?? { total: 0, approved: 0 };
    c.total += 1;
    if (d.status === 'approved') c.approved += 1;
    docCount.set(owner, c);
  }

  // The face for the card. One round trip for the whole page   see
  // modules/admin/selfies for why the queue is scannable by sight at all.
  const selfieByOwner = await selfieUrlsFor([...new Set(rows.map((r) => r.personId))]);

  const entries: QueueEntry[] = rows.map((r) => ({
    ...r,
    selfieUrl: selfieByOwner.get(r.personId),
    docsTotal: docCount.get(r.personId)?.total ?? 0,
    docsApproved: docCount.get(r.personId)?.approved ?? 0,
  }));

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
      <AccountTabs active={(category ?? 'vendors') as AccountTabKey} />

      <VerificationQueue rows={entries} />
    </section>
  );
}
