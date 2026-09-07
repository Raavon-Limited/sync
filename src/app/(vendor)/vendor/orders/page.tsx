/**
 * ROUTE: /vendor/orders
 * ACCESS: authenticated vendor (enforced by the proxy, and by RLS underneath)
 * PURPOSE: Live orders queue with status counts and the full order table.
 *
 * The page itself stays a server component so the metadata and shell render on
 * the server; the two live pieces are client islands. Both read the SAME cached
 * query, so the counts and the rows cannot disagree.
 */

import type { Metadata } from 'next';
import { Button } from '@/components/ui';
import { Download } from 'lucide-react';
import { VendorOrdersView } from './(components)/orders-view';
import { VendorOrderStats } from './(components)/orders-stats';

export const metadata: Metadata = { title: 'Orders' };

export default function Page() {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-muted max-w-xl font-mono text-sm tracking-wide">ORDERS</h1>
          <h2 className="text-section text-content font-display mt-2 font-medium">
            Your <span className="text-lime-deep">order queue.</span>
          </h2>
        </div>
        <Button className="bg-lime-deep hover:bg-lime-deep/90 flex items-center gap-2 text-white">
          <Download />
          Export
        </Button>
      </div>

      <section>
        <VendorOrderStats />
      </section>

      <section className="p-2 sm:p-4 md:p-6">
        <VendorOrdersView />
      </section>
    </section>
  );
}
