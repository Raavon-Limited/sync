/**
 * How an order's status and payment state are presented - icon, tint, and the
 * badge colour behind them.
 *
 * Previously the orders table, the details dialog and the stat cards each kept
 * their own copy of this mapping, which is how the stat cards drifted to
 * labels ("NEW", "SHIPPED", "COMPLETED") that no `Order['status']` value could
 * ever match. Keyed off the union here, so a new status is a compile error in
 * one file instead of three screens quietly disagreeing.
 *
 * Tinted fills (`bg-*-500/15`) rather than the `-100` solids: they sit correctly
 * on both the cream and ink surfaces, where a solid pastel only works on light.
 */
import {
  Ban,
  CheckCircle2,
  Clock,
  Package,
  PackageCheck,
  ShoppingBag,
  Truck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { Order } from '@/types/order';

export type OrderStatus = Order['status'];
export type OrderPayment = Order['payment'];

/** Queue order: roughly the lifecycle a vendor walks an order through. */
export const ORDER_STATUSES: readonly OrderStatus[] = [
  'Pending',
  'Processing',
  'Delivered',
  'Cancelled',
] as const;

export interface StatePresentation {
  icon: LucideIcon;
  /** Pill fill + text, for table cells and dialog badges. */
  pill: string;
  /** Icon glyph colour, for the stat-card badge and pill icon. */
  tint: string;
  /** Stat-card badge background behind the glyph. */
  badge: string;
}

export const ORDER_STATUS_STYLE: Record<OrderStatus, StatePresentation> = {
  Pending: {
    icon: Package,
    pill: 'bg-amber-500/15 text-amber-600',
    tint: 'text-amber-600',
    badge: 'bg-amber-500/15',
  },
  Processing: {
    icon: Truck,
    pill: 'bg-blue-500/15 text-blue-600',
    tint: 'text-blue-600',
    badge: 'bg-blue-500/15',
  },
  Delivered: {
    icon: PackageCheck,
    pill: 'bg-green-500/15 text-green-600',
    tint: 'text-green-600',
    badge: 'bg-green-500/15',
  },
  Cancelled: {
    icon: Ban,
    pill: 'bg-red-500/15 text-red-600',
    tint: 'text-red-600',
    badge: 'bg-red-500/15',
  },
};

export const ORDER_PAYMENT_STYLE: Record<OrderPayment, StatePresentation> = {
  Paid: {
    icon: CheckCircle2,
    pill: 'bg-green-500/15 text-green-600',
    tint: 'text-green-600',
    badge: 'bg-green-500/15',
  },
  Pending: {
    icon: Clock,
    pill: 'bg-amber-500/15 text-amber-600',
    tint: 'text-amber-600',
    badge: 'bg-amber-500/15',
  },
  Failed: {
    icon: XCircle,
    pill: 'bg-red-500/15 text-red-600',
    tint: 'text-red-600',
    badge: 'bg-red-500/15',
  },
};

/** The "no filter" card that sits ahead of the per-status ones. */
export const ALL_ORDERS_STYLE: StatePresentation = {
  icon: ShoppingBag,
  pill: 'bg-content/10 text-content',
  tint: 'text-content',
  badge: 'bg-content/10',
};

/** Selected status, or `all` for the unfiltered view. */
export type OrderStatusFilter = OrderStatus | 'all';

/** Counts per status, derived from the orders themselves - never hardcoded. */
export function countByStatus(orders: Order[]): Record<OrderStatus, number> {
  const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<
    OrderStatus,
    number
  >;

  for (const order of orders) counts[order.status] += 1;

  return counts;
}
