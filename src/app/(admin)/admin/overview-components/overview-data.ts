/**
 * Server-side fetch for the /admin overview.
 *
 * One RPC, for the same reason as /admin/analytics: counting rows read over
 * PostgREST tops out at a page of 1000 and would freeze every card at 1000
 * once the platform got that big. `admin_overview` counts in SQL.
 *
 * The request-scoped client is used deliberately   the RPC calls `is_staff()`,
 * so the database is the thing enforcing access, not the page's redirect.
 */
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type {
  Activity,
  GrowthPoint,
  RevenuePoint,
  StatCard,
  VendorStatusData,
} from './data';

interface OverviewPayload {
  vendors: number;
  vendors_prev: number;
  users: number;
  users_prev: number;
  verifications: number;
  verifications_prev: number;
  disputes: number;
  disputes_prev: number;
  revenue: { month: string; revenue_kobo: number }[];
  growth: { month: string; users: number }[];
  vendor_status: VendorStatusData;
  activities: { type: Activity['type']; text: string; at: string }[];
}

export interface Overview {
  stats: StatCard[];
  revenue: RevenuePoint[];
  growth: GrowthPoint[];
  vendorStatus: VendorStatusData;
  activities: Activity[];
}

/**
 * Percent change against the same measure 30 days ago. Growth from zero is
 * reported as 0 rather than infinity   the card has nowhere to put ∞, and the
 * first vendor is not an infinite improvement on none.
 */
function change(now: number, before: number): number {
  if (!before) return 0;
  return Math.round(((now - before) / before) * 100);
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units: [number, string][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.35, 'week'],
    [12, 'month'],
  ];
  let value = seconds;
  let label = 'second';
  for (const [size, next] of units) {
    if (value < size) break;
    value = Math.floor(value / size);
    label = next;
  }
  if (label === 'second' && value < 10) return 'just now';
  return `${value} ${label}${value === 1 ? '' : 's'} ago`;
}

export async function getOverview(): Promise<Overview> {
  const db = await createClient();
  const { data, error } = await db.rpc('admin_overview');

  // A refusal is not an empty platform. Rendering zeros would say nobody has
  // ever signed up rather than that the question could not be asked.
  if (error) throw new Error(`Overview unavailable: ${error.message}`);

  const o = data as unknown as OverviewPayload;

  return {
    stats: [
      {
        key: 'vendors',
        label: 'Total Vendors',
        value: o.vendors,
        change: change(o.vendors, o.vendors_prev),
        iconBg: 'bg-blue-500',
        icon: 'vendors',
      },
      {
        key: 'users',
        label: 'Active Users',
        value: o.users,
        change: change(o.users, o.users_prev),
        iconBg: 'bg-emerald-500',
        icon: 'users',
      },
      {
        key: 'verifications',
        label: 'Pending Verifications',
        value: o.verifications,
        change: change(o.verifications, o.verifications_prev),
        iconBg: 'bg-orange-500',
        icon: 'verifications',
      },
      {
        key: 'disputes',
        label: 'Open Disputes',
        value: o.disputes,
        change: change(o.disputes, o.disputes_prev),
        iconBg: 'bg-red-500',
        icon: 'disputes',
      },
    ],
    // The chart's axis is labelled ₦ NGN, so kobo is converted once here.
    revenue: o.revenue.map((r): RevenuePoint => ({
      month: r.month,
      revenue: Math.round(r.revenue_kobo / 100),
    })),
    growth: o.growth.map((g): GrowthPoint => ({ month: g.month, users: g.users })),
    vendorStatus: o.vendor_status,
    // Ids are positional: these rows come from four different tables and share
    // no key, so the index is the only stable handle the list has.
    activities: o.activities.map(
      (a, i): Activity => ({ id: i, text: a.text, timeAgo: timeAgo(a.at), type: a.type }),
    ),
  };
}
