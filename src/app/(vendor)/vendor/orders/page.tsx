import { OrdersTable } from './(components)/orders-table';
/**
 * ROUTE: /vendor/orders
 * ACCESS: authenticated vendor
 * PURPOSE: Orders queue with status flow (new → accepted → in progress → completed → paid out).
 * BUILT HERE: <Tabs> per status, order rows, <OrderStageTracker>, accept/reject actions.
 * TODO: implement the full screen once dependent modules + data are wired.
 */

import { Button } from '@/components/ui';
import { orders } from '@/mock/vendor';
import { Download } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Orders' };

export default function Page() {
  const numberOfOrders = orders.length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-content-muted max-w-xl font-mono text-sm tracking-wide">ORDERS</h1>
          <h2 className="text-section text-content font-display mt-2 font-medium">
            {numberOfOrders} total <span className="text-lime-deep">orders.</span>
          </h2>
        </div>
        <Button className="bg-lime-deep hover:bg-lime-deep/90 flex items-center gap-2 text-white">
          <Download />
          Export
        </Button>
      </div>
      {/* Stat cards double as the status filter, so they live with the table. */}
      <OrdersTable data={orders} />
    </section>
  );
}
