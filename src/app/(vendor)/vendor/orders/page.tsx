import { OrdersTable } from './(components)/orders-table';
/**
 * ROUTE: /vendor/orders
 * ACCESS: authenticated vendor
 * PURPOSE: Orders queue with status flow (new → accepted → in progress → completed → paid out).
 * BUILT HERE: <Tabs> per status, order rows, <OrderStageTracker>, accept/reject actions.
 * TODO: implement the full screen once dependent modules + data are wired.
 */

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { orders, orderStats, vendorStats } from '@/mock/vendor';
import { Download } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Orders' };

export default function Page() {
  const numberOfOrders = orders.length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-muted max-w-xl font-mono text-sm tracking-wide">ORDERS</h1>
          <h2 className="text-section text-content font-display mt-2 font-medium">
            {numberOfOrders} total <span className="text-lime-deep">orders.</span>
          </h2>
        </div>
        <Button className="bg-lime-deep hover:bg-lime-deep/90 flex items-center gap-2 text-white">
          <Download />
          Export
        </Button>
      </div>
      <section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-5">
          {orderStats.map(({ label, value, icon: Icon, iconColor }) => (
            <Card key={label} className="border-line/5 border bg-transparent">
              <CardHeader>
                <CardTitle className="text-muted font-mono tracking-wide">{label}</CardTitle>
              </CardHeader>
              <CardContent className="text-section font-body text-3xl font-bold">
                <CardDescription className="mt-3.5 border-transparent">
                  <span
                    className={`font-body flex items-center justify-between gap-1 text-sm font-medium ${iconColor}`}
                  >
                    {Icon && <Icon className="size-[25px]" />}
                    <span className="text-2xl">{value}</span>
                  </span>
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section className="p-2 sm:p-4 md:p-6">
        <OrdersTable data={orders} />
      </section>
    </section>
  );
}
