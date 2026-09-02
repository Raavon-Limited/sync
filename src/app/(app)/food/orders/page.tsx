/**
 * ROUTE: /food/orders
 *
 * WHAT CHANGED
 *   This read `getAllDemoOrders()`   a localStorage array written by a fake
 *   checkout. It now reads the student's real orders, and subscribes to them:
 *   `orders` is in the realtime publication, so a vendor moving an order to
 *   "preparing" updates this screen without a refresh.
 *
 * STATUS COVERAGE
 *   The demo shim knew four states. The table allows six   `pending` (placed,
 *   not yet accepted) and `cancelled` were unrepresentable, so an order sitting
 *   in either rendered as nothing at all. Both are handled here.
 */
'use client';

import Link from 'next/link';
import { ChevronRight, ShoppingBag, ClipboardList } from 'lucide-react';
import { useMyOrders, useMyOrdersRealtime } from '@/modules/food/hooks';
import type { FoodOrder, OrderStatus } from '@/modules/food/types';

const STATUS_CONFIG: Record<OrderStatus, { label: string; pct: number; colour: string }> = {
  pending: { label: 'Placed', pct: 10, colour: 'bg-yellow-400' },
  preparing: { label: 'Preparing', pct: 30, colour: 'bg-yellow-400' },
  picked_up: { label: 'Picked up', pct: 55, colour: 'bg-blue-400' },
  on_the_way: { label: 'On the way', pct: 80, colour: 'bg-lime' },
  delivered: { label: 'Delivered', pct: 100, colour: 'bg-lime' },
  cancelled: { label: 'Cancelled', pct: 100, colour: 'bg-coral' },
};

const CLOSED: OrderStatus[] = ['delivered', 'cancelled'];

function timeWindow(placedAt: string, etaMinutes?: number | null) {
  const start = new Date(placedAt);
  if (Number.isNaN(start.getTime())) return '';
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false });
  const end = new Date(start.getTime() + (etaMinutes ?? 30) * 60_000);
  return `${fmt(start)} – ${fmt(end)}`;
}

function OrderCard({ order }: { order: FoodOrder }) {
  const config = STATUS_CONFIG[order.status];
  if (!config) return null;
  const isActive = !CLOSED.includes(order.status);

  return (
    <Link
      href={`/food/orders/${order.id}/track`}
      className="border-line/10 bg-panel shadow-card hover:border-line/20 block overflow-hidden rounded-2xl border transition-colors"
    >
      <div className="flex items-center gap-4 px-4 py-4">
        <div className="bg-surface-deep border-line/10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border">
          <ShoppingBag size={20} className="text-content-muted" />
        </div>

        <div className="min-w-0 flex-1">
          <span
            className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isActive ? 'text-lime-deep dark:text-lime bg-lime/10' : 'text-content-muted bg-surface-deep'
            }`}
          >
            {isActive && <span className="bg-lime h-1.5 w-1.5 animate-pulse rounded-full" />}
            {config.label}
          </span>
          <p className="text-content truncate text-sm font-semibold">
            {order.vendorName ?? 'Vendor'}
          </p>
          <p className="text-content text-xl font-black tracking-tight">
            {timeWindow(order.placedAt, order.etaMinutes)}
          </p>
          <p className="text-content-muted text-xs">
            ₦{(order.totalKobo / 100).toLocaleString()} · {order.lines.length} item
            {order.lines.length === 1 ? '' : 's'}
          </p>
        </div>

        <ChevronRight size={18} className="text-content-muted flex-shrink-0" />
      </div>

      <div className="bg-surface-deep h-1.5">
        <div
          className={`h-full ${config.colour} transition-all duration-700`}
          style={{ width: `${config.pct}%` }}
        />
      </div>
    </Link>
  );
}

export default function OrdersPage() {
  // Keeps the list live while the vendor works through the queue.
  useMyOrdersRealtime();
  const { data: orders = [], isLoading } = useMyOrders();

  const active = orders.filter((o) => !CLOSED.includes(o.status));
  const past = orders.filter((o) => CLOSED.includes(o.status));

  return (
    <div className="flex flex-col gap-6 pb-24">
      <h1 className="text-content text-2xl font-black">Orders</h1>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-ink/5 h-24 animate-pulse rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && active.length > 0 && (
        <section className="flex flex-col gap-3">
          {active.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </section>
      )}

      {!isLoading && orders.length === 0 && (
        <section>
          <div className="border-line/10 bg-panel shadow-card flex flex-col items-center gap-2 rounded-2xl border px-6 py-8 text-center">
            <ShoppingBag size={36} className="text-content-muted/40" strokeWidth={1} />
            <p className="text-content mt-1 text-sm font-semibold">No orders yet</p>
            <p className="text-content-muted text-xs">Your orders will show up here</p>
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-content text-lg font-bold">Past orders</h2>
          {past.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </section>
      )}

      <Link
        href="/food/orders/history"
        className="border-line/10 bg-panel shadow-card hover:border-line/20 flex items-center gap-3 rounded-2xl border px-4 py-4 transition-colors"
      >
        <ClipboardList size={20} className="text-content-muted flex-shrink-0" />
        <div className="flex-1">
          <p className="text-content-muted text-sm">Need to review past orders or reorder?</p>
          <p className="text-content text-sm font-semibold">Order history</p>
        </div>
        <ChevronRight size={18} className="text-content-muted flex-shrink-0" />
      </Link>
    </div>
  );
}
