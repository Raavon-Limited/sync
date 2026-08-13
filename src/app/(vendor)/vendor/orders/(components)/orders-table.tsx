'use client';

import { useState } from 'react';

import { orderColumns } from '@/components/data-table/columns/order-columns';
import { DataTable } from '@/components/data-table/data-table';
import { Order } from '@/types/order';
import { OrderDetailsDialog } from './order-details-dialog';

/**
 * Client wrapper around the orders DataTable. The page itself stays a server
 * component (it exports route metadata), so the row-click state lives here.
 */
export function OrdersTable({ data }: { data: Order[] }) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  return (
    <>
      <DataTable columns={orderColumns} data={data} onRowClick={setSelectedOrder} />

      <OrderDetailsDialog order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </>
  );
}
