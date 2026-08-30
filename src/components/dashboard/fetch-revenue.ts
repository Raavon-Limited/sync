/**
 * The revenue chart's period fetch, for real.
 *
 * REPLACES fetch-revenue-mock.ts
 *   That file was the DEFAULT value of `RevenueChartPanel`'s `fetchRevenue`
 *   prop, and RoleDashboard never passed the prop. So every role dashboard
 *   rendered a true weekly figure on load and then filled the chart with
 *   Math.random() the instant anyone changed the period. Making the default
 *   real is the point of this file: a caller that forgets the prop now gets
 *   correct data instead of invented data.
 *
 * WHY A SERVER ACTION AND NOT A ROUTE HANDLER
 *   The panel is a client component but its parent is an async server
 *   component, and a route handler would need its own auth plumbing. The
 *   action runs as the signed-in user, and the RPC underneath scopes itself
 *   to auth.uid() — there is no owner argument to get wrong.
 */
'use server';

import { createClient } from '@/lib/supabase/server';
import type { RevenueDatum } from './revenue-bar-chart';
import type { RevenuePeriod } from './revenue-period';

export async function fetchRevenueSeries(period: RevenuePeriod): Promise<RevenueDatum[]> {
  const db = await createClient();
  const { data, error } = await db.rpc('my_revenue_series', { p_period: period });

  // The panel catches a rejection and renders an empty chart. Returning []
  // here instead would be indistinguishable from "you earned nothing", which
  // is the failure this whole change is about.
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as { label: string; revenue_kobo: number }[];

  // `week` is the chart's generic bucket-label field across every period —
  // "Aug 14", "Aug W2", "Aug", "2026" — not a week specifically.
  return rows.map((r) => ({ week: r.label, revenue: Math.round(r.revenue_kobo / 100) }));
}
