'use client';

import { useState } from 'react';

import { orderColumns } from '@/components/data-table/columns/order-columns';
import { DataTable } from '@/components/data-table/data-table';
import { Order } from '@/types/order';
import type { FoodOrder } from '@/modules/food/types';
import { OrderDetailsDialog } from './order-details-dialog';

/**
 * Client wrapper around the orders DataTable. The page itself stays a server
 * component (it exports route metadata), so the row-click state lives here.
 */
export function OrdersTable({ data, orders }: { data: Order[]; orders: FoodOrder[] }) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // `Order` collapses six database states into four for the table, so it
  // cannot tell 'pending' from 'preparing'   which is exactly what decides
  // the next action. The domain row is looked up rather than widening the
  // presentation type the DataTable is built against.
  const domain = selectedOrder ? (orders.find((o) => o.id === selectedOrder.id) ?? null) : null;

  return (
    <>
      <DataTable columns={orderColumns} data={data} onRowClick={setSelectedOrder} />

      <OrderDetailsDialog
        order={selectedOrder}
        domainOrder={domain}
        onClose={() => setSelectedOrder(null)}
      />
    </>
  );
}
