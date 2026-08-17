'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { createOrderColumns } from '@/components/data-table/columns/order-columns';
import { DataTable } from '@/components/data-table/data-table';
import { Order } from '@/types/order';
import { inboxHrefForOrder } from '@/lib/order-chat';
import type { OrderStatusFilter } from '@/config/order-status';
import { OrderDetailsDialog } from './order-details-dialog';
import { OrderStatsBar } from './order-stats-bar';

/**
 * Client wrapper around the orders queue. The page itself stays a server
 * component (it exports route metadata), so the interactive state lives here:
 * the row-click selection and the status filter shared by the stat cards and
 * the table.
 */
export function OrdersTable({ data }: { data: Order[] }) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState<OrderStatusFilter>('all');
  const router = useRouter();
  const pathname = usePathname();

  // Filtered here rather than through a column filter so the stat cards are the
  // single control for status - one piece of state, no two filters to reconcile.
  const visible = useMemo(
    () => (status === 'all' ? data : data.filter((order) => order.status === status)),
    [data, status],
  );

  const columns = useMemo(
    () =>
      createOrderColumns({
        // Deep-link into the inbox with the customer + order in the query, so the
        // thread opens already pointed at the order being discussed.
        onMessage: (order) => router.push(inboxHrefForOrder(pathname, order)),
      }),
    [router, pathname],
  );

  return (
    <div className="flex flex-col gap-5">
      <OrderStatsBar orders={data} active={status} onSelect={setStatus} />

      <DataTable
        columns={columns}
        data={visible}
        onRowClick={setSelectedOrder}
        // A queue reads newest-first; without this rows sat in array order.
        initialSorting={[{ id: 'date', desc: true }]}
        emptyMessage={
          status === 'all' ? 'No orders yet.' : `No ${status.toLowerCase()} orders right now.`
        }
      />

      <OrderDetailsDialog order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}
