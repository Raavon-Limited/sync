/**
 * ROUTE: /admin
 * ACCESS: admin / super_admin only.
 * PURPOSE: The platform at a glance   counts, six months of revenue and
 * signups, the vendor status split, and what has just happened.
 *
 * Was a client component over a seed file: every figure on the platform's
 * front door was invented. It now reads `public.admin_overview`; the charts
 * below are the same presentational components, hardened for numbers that can
 * start at zero.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/modules/admin/guard';
import { accessLevel, visibleAreas } from '@/modules/access/guard';
import { ADMIN_AREAS } from '@/modules/access/areas';
import { StatCards } from './overview-components/StatCards';
import { RevenueChart } from './overview-components/RevenueChart';
import { GrowthChart } from './overview-components/GrowthChart';
import { RecentActivities } from './overview-components/RecentActivities';
import { VendorStatus } from './overview-components/VendorStatus';
import { getOverview } from './overview-components/overview-data';

export const metadata: Metadata = { title: 'Overview   Admin' };

// Queue sizes and the activity feed are stale the moment anything happens.
export const dynamic = 'force-dynamic';

/**
 * THE CONSOLE ROOT CANNOT REQUIRE ONE PARTICULAR AREA.
 *
 * It called `requireStaffArea('overview')`, so a scoped admin who was not
 * granted `overview` hit /403 the moment they signed in   and again every
 * time they clicked Dashboard, because that is where Dashboard points. A
 * reviewer granted Finance (payouts and disputes) could not open the console
 * at all, despite holding two areas inside it.
 *
 * The sidebar already solved this for the Accounts row: it points at the first
 * area the viewer actually holds. The root now does the same, and only refuses
 * somebody who holds nothing   which is the one case where /403 is the honest
 * answer.
 */
export default async function AdminOverviewPage() {
  await requireStaff();

  if ((await accessLevel('overview')) === 'none') {
    const held = (await visibleAreas()) ?? [];
    // An area with no `href` has no page yet, so it cannot be landed on even
    // though the grant is real   see the notes in areas.ts. And /admin itself
    // is skipped, or this redirects to the page it is already on.
    const first = ADMIN_AREAS.find(
      (a) => held.includes(a.key) && a.href && a.href !== '/admin',
    );
    redirect(first?.href ?? '/403');
  }

  const o = await getOverview();

  return (
    <div className="min-h-screen transition-colors duration-300">
      <div className="mb-4 select-none">
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / OVERVIEW</h1>
        <p className="text-content-muted mt-1 text-xs sm:text-sm">
          Counts are live. Change is against the same measure 30 days ago.
        </p>
      </div>

      <StatCards stats={o.stats} />

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RevenueChart data={o.revenue} />
        <GrowthChart data={o.growth} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <RecentActivities initial={o.activities} />
        <VendorStatus data={o.vendorStatus} />
      </div>
    </div>
  );
}
