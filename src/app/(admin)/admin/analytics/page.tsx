/**
 * ROUTE: /admin/analytics
 * ACCESS: admin / super_admin only.
 * PURPOSE: What the platform actually did — revenue, orders, who and when.
 *
 * Was a client component over `data.ts`, which generated its own numbers. It is
 * now a server component: the window comes from `?range=`, the figures come
 * from `public.admin_analytics`, and the charts are the same presentational
 * components they always were.
 */
import type { Metadata } from 'next';
import { requireStaff } from '@/modules/admin/guard';
import { AnalyticsStatCards } from './components/AnalyticsStatCards';
import { RevenueTrendChart } from './components/RevenueTrendChart';
import { CategoryPieChart } from './components/CategoryPieChart';
import { ActivityByHourChart } from './components/ActivityByHourChart';
import { TopVendorsChart } from './components/TopVendorsChart';
import { TopProductsList } from './components/TopProductsList';
import { TimeRangeSelector } from './components/TimeRangeSelector';
import { rangeFromParam } from './data';
import { getAnalytics } from './analytics-data';

export const metadata: Metadata = { title: 'Analytics — Admin' };

// Money figures go stale the moment an order is paid, and an admin reading a
// cached page would be reading yesterday.
export const dynamic = 'force-dynamic';

const CARD = 'bg-panel border border-line/15 rounded-xl p-5 shadow-xs overflow-hidden';
const CARD_TITLE = 'text-[10px] uppercase tracking-widest font-bold text-content-muted/60 mb-4';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const [{ range: rawRange }] = await Promise.all([searchParams, requireStaff()]);

  const range = rangeFromParam(rawRange);
  const a = await getAnalytics(range);

  return (
    <section className="flex select-none flex-col gap-5">
      <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / ANALYTICS</h1>
          <p className="text-content-muted mt-1 text-xs sm:text-sm">
            Paid orders only, in Africa/Lagos time. Change is against the previous {range
              .replace('Last ', '')
              .replace('year', '365 days')}.
          </p>
        </div>
        <div className="shrink-0 self-start sm:self-center">
          <TimeRangeSelector value={range} />
        </div>
      </div>

      <div className="w-full">
        <AnalyticsStatCards stats={a.stats} />
      </div>

      {/* An empty window is a fact about the business, not a broken page. Say
          so once, plainly, instead of rendering six charts of nothing. */}
      {a.empty ? (
        <p className="text-content-muted border-line/15 rounded-xl border border-dashed p-10 text-center text-sm">
          No paid orders in this window. Try a longer range.
        </p>
      ) : (
        <>
          <div className={`w-full ${CARD}`}>
            <h2 className={CARD_TITLE}>Revenue & Orders</h2>
            <RevenueTrendChart data={a.trend} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className={`${CARD} flex flex-col justify-between`}>
              <h2 className={CARD_TITLE}>Revenue by Vendor Category</h2>
              <CategoryPieChart data={a.categories} />
            </div>

            <div className={`${CARD} flex flex-col justify-between`}>
              <h2 className={CARD_TITLE}>Paid Orders by Hour</h2>
              <ActivityByHourChart data={a.hours} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className={`${CARD} flex flex-col justify-between`}>
              <h2 className={CARD_TITLE}>Top Performing Vendors</h2>
              <TopVendorsChart data={a.vendors} />
            </div>

            <div className={`${CARD} flex flex-col justify-between`}>
              <h2 className={CARD_TITLE}>Highest Volume Inventory</h2>
              <TopProductsList products={a.products} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
