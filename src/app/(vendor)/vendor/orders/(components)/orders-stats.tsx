/**
 * Order KPI strip, derived from the live queue.
 *
 * Counts come from the same cached query the table uses, so the tiles and the
 * rows can never disagree   a second query for counts would drift between
 * refetches and show "3 pending" above a table with four.
 */
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { CheckCircle2, Clock, ListOrdered, Truck, XCircle } from 'lucide-react';
import { useVendorOrders } from '@/modules/vendor/hooks';
import { useActiveStorefront } from '@/modules/storefronts/active-storefront';

export function VendorOrderStats() {
  // Same filter as the table below it: counts that disagree with the rows
  // they sit above are worse than no counts.
  const { activeId } = useActiveStorefront();
  const { data: orders = [] } = useVendorOrders({ storefrontId: activeId ?? undefined });

  const count = (fn: (s: string) => boolean) => orders.filter((o) => fn(o.status)).length;

  const stats = [
    {
      label: 'TOTAL',
      value: orders.length,
      icon: ListOrdered,
      iconColor: 'text-blue-600',
    },
    { label: 'PENDING', value: count((s) => s === 'pending'), icon: Clock, iconColor: 'text-amber-600' },
    {
      label: 'IN PROGRESS',
      value: count((s) => ['preparing', 'picked_up', 'on_the_way'].includes(s)),
      icon: Truck,
      iconColor: 'text-indigo-600',
    },
    {
      label: 'DELIVERED',
      value: count((s) => s === 'delivered'),
      icon: CheckCircle2,
      iconColor: 'text-lime-deep',
    },
    {
      label: 'CANCELLED',
      value: count((s) => s === 'cancelled'),
      icon: XCircle,
      iconColor: 'text-red-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-5">
      {stats.map(({ label, value, icon: Icon, iconColor }) => (
        <Card key={label} className="border-line/5 border">
          <CardHeader>
            <CardTitle className="text-muted font-mono tracking-wide">{label}</CardTitle>
          </CardHeader>
          <CardContent className="text-section font-body text-3xl font-bold">
            <CardDescription className="mt-3.5 border-transparent">
              <span
                className={`font-body flex items-center justify-between gap-1 text-sm font-medium ${iconColor}`}
              >
                <Icon className="size-[25px]" />
                <span className="text-2xl">{value}</span>
              </span>
            </CardDescription>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
