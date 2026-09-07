/**
 * Vendor dashboard aggregation.
 *
 * WHERE THIS RUNS
 * Server-side, from the RSC page. It takes a Supabase client as its first
 * argument like every other query module, which is exactly why that convention
 * exists: `RoleDashboard` is an async server component, so the data has to be
 * fetched before render rather than by a hook.
 *
 * WHY THE BUCKETING IS DONE HERE AND NOT IN SQL
 * Revenue-by-week is a group-by, and doing it in JavaScript over a vendor's
 * order list is the wrong shape at scale   it drags every row across the wire to
 * produce eight numbers. It is the right shape TODAY, because a vendor has tens
 * of orders and the alternative is a materialised view that has to be refreshed
 * on a schedule for data nobody is looking at yet.
 *
 * The upgrade path is written down: BACKEND_BLUEPRINT §14 specifies
 * `mv_vendor_daily`, refreshed hourly by pg_cron, which every earnings chart
 * should read instead of `orders`. Move to it when a vendor passes a few hundred
 * orders, not before.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { koboToNaira } from '@/lib/query/helpers';
import { fetchVendorOrders } from './queries';
import type { FoodOrder } from '@/modules/food/types';

type Client = SupabaseClient<Database>;

export interface RevenueBucket {
  week: string;
  revenue: number;
}

export interface VendorDashboardData {
  orders: FoodOrder[];
  pendingOrders: FoodOrder[];
  revenueWeekly: RevenueBucket[];
  earnings: { thisWeek: number; lastWeek: number; thisMonth: number; lastMonth: number };
  counts: { total: number; pending: number; inProgress: number; delivered: number };
}

/** Only delivered orders count as revenue. A cancelled order is not income. */
export const isRevenue = (o: FoodOrder) => o.status === 'delivered';

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  // Monday-based: Sunday (0) belongs to the week that started six days earlier.
  const diff = day === 0 ? 6 : day - 1;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function sumBetween(orders: FoodOrder[], from: Date, to: Date): number {
  return orders
    .filter(isRevenue)
    .filter((o) => {
      const t = new Date(o.deliveredAt ?? o.placedAt).getTime();
      return t >= from.getTime() && t < to.getTime();
    })
    .reduce((sum, o) => sum + o.totalKobo, 0);
}

/**
 * Eight trailing weeks, oldest first   the shape `RevenueBarChart` expects.
 * Empty weeks are kept as zero rather than dropped, so the x-axis stays evenly
 * spaced and a quiet week reads as quiet rather than disappearing.
 */
export function bucketWeeks(orders: FoodOrder[], now: Date, weeks = 8): RevenueBucket[] {
  const thisWeekStart = startOfWeek(now);
  const out: RevenueBucket[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const from = new Date(thisWeekStart);
    from.setDate(from.getDate() - i * 7);

    const to = new Date(from);
    to.setDate(to.getDate() + 7);

    out.push({
      week: from.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' }),
      revenue: koboToNaira(sumBetween(orders, from, to)),
    });
  }

  return out;
}

/**
 * Trailing calendar months, oldest first.
 *
 * Shares `sumBetween` with the weekly buckets so the earnings page and the
 * dashboard cannot disagree about what a month earned - two implementations of
 * "revenue in a period" is how a KPI tile ends up contradicting the chart
 * directly beneath it.
 */
export function bucketMonths(orders: FoodOrder[], now: Date, months = 12): RevenueBucket[] {
  const out: RevenueBucket[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

    out.push({
      week: from.toLocaleDateString('en-NG', { month: 'short' }),
      revenue: koboToNaira(sumBetween(orders, from, to)),
    });
  }

  return out;
}

export async function fetchVendorDashboard(
  db: Client,
  vendorId: string,
  now: Date = new Date(),
): Promise<VendorDashboardData> {
  // One read, many derivations   the KPI tiles, the chart and the pending list
  // are all views of the same set, so they cannot disagree with each other.
  const orders = await fetchVendorOrders(db, vendorId, { pageSize: 200 });

  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return {
    orders,
    pendingOrders: orders.filter((o) => o.status === 'pending'),
    revenueWeekly: bucketWeeks(orders, now),
    earnings: {
      thisWeek: koboToNaira(sumBetween(orders, thisWeekStart, new Date(now.getTime() + 1))),
      lastWeek: koboToNaira(sumBetween(orders, lastWeekStart, thisWeekStart)),
      thisMonth: koboToNaira(sumBetween(orders, thisMonthStart, new Date(now.getTime() + 1))),
      lastMonth: koboToNaira(sumBetween(orders, lastMonthStart, thisMonthStart)),
    },
    counts: {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      inProgress: orders.filter((o) =>
        ['preparing', 'picked_up', 'on_the_way'].includes(o.status),
      ).length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
    },
  };
}
