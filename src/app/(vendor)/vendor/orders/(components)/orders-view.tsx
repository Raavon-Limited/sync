/**
 * Live vendor order queue.
 *
 * A client island rather than a server component: the queue is realtime, and a
 * vendor refreshing a page to discover they have work is how orders go cold.
 * `useVendorOrdersRealtime` opens one filtered channel; the query underneath
 * keeps a slow poll as a backstop for a dropped socket.
 */
'use client';

import { useMemo } from 'react';
import { formatDate } from '@/lib/utils';
import { koboToNaira } from '@/lib/query/helpers';
import { useVendorOrders, useVendorOrdersRealtime } from '@/modules/vendor/hooks';
import { useActiveStorefront } from '@/modules/storefronts/active-storefront';
import type { FoodOrder, OrderStatus } from '@/modules/food/types';
import type { Order } from '@/types/order';
import { OrdersTable } from './orders-table';

/**
 * The database tracks six fulfilment states; the table renders four. Collapsing
 * them here rather than widening `Order` keeps the presentation contract stable
 * while the pipeline gains steps — `picked_up` and `on_the_way` are both simply
 * "in progress" from the vendor's point of view, because the rider owns them.
 */
const STATUS_LABEL: Record<OrderStatus, Order['status']> = {
  pending: 'Pending',
  preparing: 'Processing',
  picked_up: 'Processing',
  on_the_way: 'Processing',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function toRow(o: FoodOrder): Order {
  return {
    id: o.id,
    // The snapshot, not a join: vendors cannot read `profiles`.
    customer: o.customerName ?? 'Customer',
    product:
      o.lines.length === 0
        ? '-'
        : o.lines.length === 1
          ? o.lines[0].name
          : o.lines[0].name + ' +' + (o.lines.length - 1) + ' more',
    date: formatDate(o.placedAt),
    amount: koboToNaira(o.totalKobo),
    payment: o.paidAt ? 'Paid' : o.status === 'cancelled' ? 'Failed' : 'Pending',
    status: STATUS_LABEL[o.status] ?? 'Pending',
  };
}

export function VendorOrdersView() {
  // Both the socket and the query are scoped to the branch in the switcher,
  // so the rows and the live updates cannot describe different places.
  const { activeId } = useActiveStorefront();
  useVendorOrdersRealtime(activeId ?? undefined);

  const { data: orders, isLoading, isError, error } = useVendorOrders({
    storefrontId: activeId ?? undefined,
  });
  const rows = useMemo(() => (orders ?? []).map(toRow), [orders]);

  if (isError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Could not load your orders: {(error as Error)?.message ?? 'unknown error'}
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-14 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted py-16 text-center text-sm">
        No orders yet. They will appear here the moment a customer checks out.
      </p>
    );
  }

  return <OrdersTable data={rows} orders={orders ?? []} />;
}
