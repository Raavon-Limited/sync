/**
 * Shapes for the /admin overview. The seed data that used to live here   1248
 * vendors, six months of invented revenue, four fictional activity lines   is
 * gone; everything now comes from `public.admin_overview` via `overview-data.ts`.
 *
 * The types stay in this file because the chart components are client
 * components and import them directly.
 */

export interface StatCard {
  key: string;
  label: string;
  value: number;
  change: number;
  iconBg: string;
  icon: string;
}

export interface RevenuePoint {
  month: string;
  revenue: number;
}

export interface GrowthPoint {
  month: string;
  users: number;
}

export interface Activity {
  id: number;
  text: string;
  timeAgo: string;
  type: 'vendor' | 'dispute' | 'verification' | 'user';
}

export interface VendorStatusData {
  active: number;
  pending: number;
  suspended: number;
}
