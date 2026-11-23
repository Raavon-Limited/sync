/**
 * Server-side analytics fetch for /admin/analytics.
 *
 * ONE RPC, NOT SIX SELECTS
 *   `public.admin_analytics` aggregates in SQL. Reading orders here and summing
 *   them in JavaScript would silently stop at PostgREST's 1000-row page and
 *   report a revenue figure that is wrong with no error to show for it.
 *
 * THE REQUEST-SCOPED CLIENT, NOT THE SERVICE ROLE
 *   The RPC calls `is_staff()`, which reads the caller's JWT. Going through the
 *   service role would bypass exactly the check that makes this data safe to
 *   compute. The page's own redirect is a courtesy; this is the boundary.
 *
 * MONEY ARRIVES IN KOBO AND LEAVES IN NAIRA
 *   Every chart component formats with a bare `₦`, so the conversion happens
 *   once, here, rather than in five components that could disagree.
 */
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import {
  RANGES,
  SLICE_COLORS,
  type CategorySlice,
  type HourPoint,
  type StatCard,
  type TimeRange,
  type TopProduct,
  type TrendPoint,
  type VendorBar,
} from './data';

interface AnalyticsPayload {
  days: number;
  revenue_kobo: number;
  orders: number;
  customers: number;
  prev_revenue_kobo: number;
  prev_orders: number;
  prev_customers: number;
  trend: { date: string; revenue_kobo: number; orders: number }[];
  categories: { label: string; revenue_kobo: number }[];
  hours: { hour: number; orders: number }[];
  vendors: { name: string; revenue_kobo: number }[];
  products: { name: string; orders: number; revenue_kobo: number }[];
}

export interface Analytics {
  stats: StatCard[];
  trend: TrendPoint[];
  categories: CategorySlice[];
  hours: HourPoint[];
  vendors: VendorBar[];
  products: TopProduct[];
  empty: boolean;
}

const naira = (kobo: number) => Math.round(kobo / 100);

/**
 * Percent change against the previous window. Growth from nothing is reported
 * as 0, not as infinity: a first sale is not an infinite improvement, and the
 * card has nowhere to put ∞.
 */
function change(now: number, before: number): number {
  if (!before) return 0;
  return Number((((now - before) / before) * 100).toFixed(1));
}

const CATEGORY_LABEL: Record<string, string> = {
  food: 'Food',
  groceries: 'Groceries',
  fashion: 'Fashion',
  services: 'Services',
  landlord: 'Hostels',
  other: 'Other',
};

const HOUR_LABEL = (h: number) => {
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour} ${suffix}`;
};

const compactNaira = (kobo: number) => {
  const n = kobo / 100;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}k`;
  return `₦${n.toLocaleString('en-NG')}`;
};

export async function getAnalytics(range: TimeRange): Promise<Analytics> {
  const db = await createClient();
  const { data, error } = await db.rpc('admin_analytics', { p_days: RANGES[range] });

  // A staff-gated RPC that refuses is not an empty dataset, and rendering zeros
  // would say the platform made no money rather than that we could not ask.
  if (error) throw new Error(`Analytics unavailable: ${error.message}`);

  const a = data as unknown as AnalyticsPayload;

  const aov = a.orders ? a.revenue_kobo / a.orders : 0;
  const prevAov = a.prev_orders ? a.prev_revenue_kobo / a.prev_orders : 0;

  const stats: StatCard[] = [
    {
      key: 'revenue',
      label: 'Total Revenue',
      value: compactNaira(a.revenue_kobo),
      change: change(a.revenue_kobo, a.prev_revenue_kobo),
      iconBg: 'bg-leaf',
      icon: 'revenue',
    },
    {
      key: 'orders',
      label: 'Paid Orders',
      value: a.orders.toLocaleString('en-NG'),
      change: change(a.orders, a.prev_orders),
      iconBg: 'bg-blue-500',
      icon: 'orders',
    },
    {
      key: 'avg',
      label: 'Avg Order Value',
      value: compactNaira(aov),
      change: change(aov, prevAov),
      iconBg: 'bg-orange-500',
      icon: 'avg',
    },
    {
      key: 'customers',
      label: 'Paying Customers',
      value: a.customers.toLocaleString('en-NG'),
      change: change(a.customers, a.prev_customers),
      iconBg: 'bg-purple-500',
      icon: 'customers',
    },
  ];

  const totalCategoryKobo = a.categories.reduce((sum, c) => sum + c.revenue_kobo, 0);

  return {
    stats,
    trend: a.trend.map((t) => ({
      date: t.date,
      revenue: naira(t.revenue_kobo),
      orders: t.orders,
    })),
    // Percentages are computed here rather than in SQL so they always total
    // 100 against the same denominator the wedges are drawn from.
    categories: a.categories.map((c, i): CategorySlice => ({
      label: CATEGORY_LABEL[c.label] ?? c.label,
      pct: totalCategoryKobo ? (c.revenue_kobo / totalCategoryKobo) * 100 : 0,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
    })),
    // `users` is the chart's word for the series; what is plotted is paid
    // orders in that hour, which is what the database can actually see.
    hours: a.hours.map((h): HourPoint => ({ hour: HOUR_LABEL(h.hour), users: h.orders })),
    vendors: a.vendors.map((v): VendorBar => ({ name: v.name, revenue: naira(v.revenue_kobo) })),
    products: a.products.map(
      (p, i): TopProduct => ({
        rank: i + 1,
        name: p.name,
        orders: p.orders,
        revenue: naira(p.revenue_kobo),
      }),
    ),
    // Distinguishes "nothing sold in this window" from "something broke", so
    // the page can say which.
    empty: a.orders === 0,
  };
}
