/**
 * ROUTE: /vendor
 * ACCESS: authenticated vendor (proxy gates the shell; RLS gates the data)
 * PURPOSE: Vendor dashboard overview - KPIs, pending orders, revenue, products.
 *
 * The whole overview shares ONE design via <RoleDashboard variant="vendor">.
 * This page supplies vendor DATA and the vendor-specific lower sections.
 *
 * Fetched server-side rather than through hooks: `RoleDashboard` is an async
 * server component, so its props must exist before render. The query modules
 * take a Supabase client as their first argument precisely so they work from
 * here as well as from a hook.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Package, ShoppingBag, Truck, Wallet } from 'lucide-react';
import type { PendingRequestItem } from '@/components/dashboard/pending-request-card';
import { RoleDashboard, type DashboardKpi } from '@/components/dashboard/role-dashboard';
import { fetchRevenueSeries } from '@/components/dashboard/fetch-revenue';
import { createClient } from '@/lib/supabase/server';
import { formatKobo, koboToNaira } from '@/lib/query/helpers';
import { fetchVendorDashboard } from '@/modules/vendor/dashboard';
import { fetchMyListings } from '@/modules/vendor/queries';
import EarningsChart from './(components)/EarningChart';
import EarningsSummaryCard from './(components)/EarningsSummaryCard';

export const metadata: Metadata = { title: 'Vendor dashboard' };

/** Percentage change, guarding the divide-by-zero a new vendor always hits. */
function delta(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? 'first sales' : 'no sales yet';

  const pct = Math.round(((current - previous) / previous) * 100);

  return `${pct >= 0 ? '+' : ''}${pct}% vs last week`;
}

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already gates this route; this is defence in depth and, more
  // practically, what stops a null-user render during a session refresh.
  if (!user) redirect('/login');

  // The chart comes from the same RPC the period switcher calls. It used to
  // come from `bucketWeeks`, which counts GROSS value of delivered orders,
  // while every period switch counts NET escrow releases   so touching the
  // dropdown made the vendor's revenue appear to drop by the commission. One
  // chart, one definition.
  const [dash, listings, chart] = await Promise.all([
    fetchVendorDashboard(supabase, user.id),
    fetchMyListings(supabase, user.id, { pageSize: 50 }),
    fetchRevenueSeries('weekly'),
  ]);

  const activeListings = listings.filter((l) => l.status === 'Active');

  /*
   * "Best selling" ranked by REVENUE, not units. A cheap item that moves in
   * volume is not the same business signal as one that earns - the vendor is
   * looking at this to decide what to promote.
   */
  const topSellers = [...listings]
    .map((l) => ({ label: l.name, revenue: koboToNaira(l.priceKobo * l.sold) }))
    .filter((p) => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const kpis: DashboardKpi[] = [
    {
      label: 'TOTAL ORDERS',
      value: String(dash.counts.total),
      sub: `${dash.counts.pending} awaiting action`,
      icon: ShoppingBag,
    },
    {
      label: 'IN PROGRESS',
      value: String(dash.counts.inProgress),
      sub: `${dash.counts.delivered} delivered`,
      icon: Truck,
    },
    {
      label: 'THIS WEEK',
      value: formatKobo(Math.round(dash.earnings.thisWeek * 100)),
      sub: delta(dash.earnings.thisWeek, dash.earnings.lastWeek),
      icon: Wallet,
    },
    {
      label: 'ACTIVE LISTINGS',
      value: String(activeListings.length),
      sub: `${listings.length} total`,
      icon: Package,
    },
  ];

  const pending: PendingRequestItem[] = dash.pendingOrders.map((o) => ({
    id: o.id,
    name: o.customerName ?? 'Customer',
    badge: o.id.slice(0, 8).toUpperCase(),
    subtitle: o.lines.map((l) => l.name).join(', ') || 'Order',
    amount: formatKobo(o.totalKobo),
    tags: [o.deliveryAddress ? 'Delivery' : 'Pickup'],
  }));

  return (
    <RoleDashboard
      variant="vendor"
      count={dash.counts.pending}
      kpis={kpis}
      pending={pending}
      chart={chart}
    >
      <section className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start lg:gap-8">
        <div className="min-w-0 flex-1">
          <h2 className="text-content-muted mb-2 max-w-xl font-mono text-sm tracking-wide">
            BEST SELLING FOOD
          </h2>
          <EarningsChart data={topSellers} />
        </div>
        <div className="border-line/10 shadow-card w-full rounded-xl border p-4 lg:w-auto lg:min-w-[280px]">
          <h2 className="text-content-muted mb-2 max-w-xl font-mono text-sm tracking-wide">
            MY EARNINGS
          </h2>
          <EarningsSummaryCard data={dash.earnings} />
        </div>
      </section>
    </RoleDashboard>
  );
}
