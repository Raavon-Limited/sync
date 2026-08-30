/**
 * ROUTE: /food/orders/[orderId]/track
 * ACCESS: authenticated student (RLS scopes the order to them)
 * PURPOSE: Live tracking for one order — status, rider, items and history.
 */
import type { Metadata } from 'next';
import { TrackPanel } from './(components)/track-panel';

export const metadata: Metadata = { title: 'Track order' };

export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-3 py-4">
      <TrackPanel orderId={orderId} />
    </section>
  );
}
