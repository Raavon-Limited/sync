/**
 * Past orders   delivered and cancelled.
 *
 * A CANCELLED ORDER IS HISTORY TOO
 *   The mock listed only "Delivered". An order the vendor rejected, or the
 *   student cancelled, still happened and still may involve money   hiding it
 *   means a student cannot find the one they need to ask about.
 */
'use client';

import Link from 'next/link';
import { ArrowLeft, Clock3, ShoppingBag } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useMyOrders } from '@/modules/food/hooks';
import type { OrderStatus } from '@/modules/food/types';

const CLOSED: OrderStatus[] = ['delivered', 'cancelled'];
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;

export function OrderHistory() {
  const { data: orders = [], isLoading } = useMyOrders({ pageSize: 100 });
  const past = orders.filter((o) => CLOSED.includes(o.status));

  return (
    <section className="flex flex-col gap-4 pb-24">
      <div className="flex items-center gap-3">
        <Link
          href="/food/orders"
          className="border-line/10 flex h-10 w-10 items-center justify-center rounded-full border"
          aria-label="Back to orders"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="font-display text-content text-xl">Order history</h1>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-ink/5 h-24 animate-pulse rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && past.length === 0 && (
        <div className="border-line/10 bg-panel flex flex-col items-center gap-3 rounded-2xl border px-6 py-10 text-center">
          <ShoppingBag className="text-content-muted size-8" strokeWidth={1.5} />
          <div>
            <p className="font-display text-content text-base font-semibold">Nothing here yet</p>
            <p className="text-content-muted mt-1 text-sm">
              Orders move here once they are delivered or cancelled.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {past.map((o) => (
          <Link
            key={o.id}
            href={`/food/orders/${o.id}/track`}
            className="border-line/10 bg-panel hover:border-line/25 flex flex-col gap-2 rounded-2xl border p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-content truncate font-medium">
                  {o.vendorName ?? 'Vendor'}
                </p>
                <p className="text-content-muted truncate text-xs">
                  {/* Line names are snapshots taken at checkout, so this reads
                      as it was bought even if the vendor renamed the item. */}
                  {o.lines.map((l) => `${l.name} ×${l.qty}`).join(', ') || 'No items recorded'}
                </p>
              </div>
              <Badge
                className={
                  o.status === 'delivered'
                    ? 'bg-lime/15 text-accent-fg'
                    : 'bg-rose-500/10 text-rose-600'
                }
              >
                {o.status === 'delivered' ? 'Delivered' : 'Cancelled'}
              </Badge>
            </div>

            <div className="text-content-muted flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1">
                <Clock3 className="size-3" />
                {new Date(o.deliveredAt ?? o.placedAt).toLocaleDateString('en-NG', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <span className="text-content font-mono font-medium">{naira(o.totalKobo)}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
