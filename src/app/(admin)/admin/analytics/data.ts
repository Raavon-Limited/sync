/**
 * Shapes and presentation constants for /admin/analytics.
 *
 * This file used to BE the analytics: a `makeTrend()` that produced 148 days of
 * Math.random(), four invented KPI cards, five fictional vendors. All of that
 * now comes from `public.admin_analytics`   see `analytics-data.ts`. What is
 * left here is only what the charts need to draw: the types, the palette, and
 * the range vocabulary.
 *
 * It stays free of server imports because every chart component pulls its prop
 * type from here, and those components are client components.
 */

export type TimeRange = 'Last 7 days' | 'Last 30 days' | 'Last 90 days' | 'Last year';

/** The only ranges the selector offers, and the window each one means. */
export const RANGES: Record<TimeRange, number> = {
  'Last 7 days': 7,
  'Last 30 days': 30,
  'Last 90 days': 90,
  'Last year': 365,
};

export const DEFAULT_RANGE: TimeRange = 'Last 30 days';

/** Round-trips a `?range=` query value back into a range the RPC accepts. */
export function rangeFromParam(raw: string | undefined): TimeRange {
  return raw && raw in RANGES ? (raw as TimeRange) : DEFAULT_RANGE;
}

export interface StatCard {
  key: string;
  label: string;
  value: string;
  change: number;
  iconBg: string;
  icon: string;
}

export interface TrendPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface CategorySlice {
  label: string;
  pct: number;
  color: string;
}

export interface HourPoint {
  hour: string;
  users: number;
}

export interface VendorBar {
  name: string;
  revenue: number;
}

export interface TopProduct {
  rank: number;
  name: string;
  orders: number;
  revenue: number;
}

/**
 * Slice colours, assigned by position. Categories come from the database and
 * the set will grow, so this cycles rather than mapping category names   a new
 * vendor category should get a colour, not a blank wedge.
 */
export const SLICE_COLORS = [
  '#90d505',
  '#3b82f6',
  '#a855f7',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#eab308',
  '#6366f1',
];
