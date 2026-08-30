/**
 * ROUTE: /admin
 * ACCESS: admin / super_admin only.
 * PURPOSE: The platform at a glance — counts, six months of revenue and
 * signups, the vendor status split, and what has just happened.
 *
 * Was a client component over a seed file: every figure on the platform's
 * front door was invented. It now reads `public.admin_overview`; the charts
 * below are the same presentational components, hardened for numbers that can
 * start at zero.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { adminRoleForEmail } from '@/lib/admin-emails';
import { StatCards } from './overview-components/StatCards';
import { RevenueChart } from './overview-components/RevenueChart';
import { GrowthChart } from './overview-components/GrowthChart';
import { RecentActivities } from './overview-components/RecentActivities';
import { VendorStatus } from './overview-components/VendorStatus';
import { getOverview } from './overview-components/overview-data';

export const metadata: Metadata = { title: 'Overview — Admin' };

// Queue sizes and the activity feed are stale the moment anything happens.
export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  const role = profile?.role ?? adminRoleForEmail(user?.email);
  if (role !== 'admin' && role !== 'super_admin') redirect('/403');

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
