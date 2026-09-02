/**
 * Live order tracking.
 *
 * THE OLD PAGE SIMULATED PROGRESS
 *   It read a localStorage order and ran a `setInterval` that advanced the
 *   status on a timer   so the tracker moved whether or not anything happened,
 *   and told a student their food was on the way when nobody had touched it.
 *   Status now comes from the order row, and moves when the vendor moves it.
 *
 * REALTIME, NOT POLLING
 *   `orders` is in the realtime publication, so a vendor advancing the queue
 *   updates this screen directly. `order_events` gives the history underneath,
 *   which is what turns a progress bar into an account of what happened.
 *
 * THE ETA IS A PROJECTION AND SAYS SO
 *   `orders.eta_minutes` is set at checkout and nothing recalculates it. It is
 *   labelled "estimated" rather than counted down to zero, because a countdown
 *   that hits zero while the food is still cooking is worse than no countdown.
 */
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Clock, MapPin, Package, ChefHat, Bike, HelpCircle } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { useOrder, useOrderEvents, useOrderRealtime, useDeliveryTracking } from '@/modules/food/hooks';
import { useReleaseOrderEscrow, usePayOrderFromWallet, useEscrowHolds } from '@/modules/payments/hooks';
import type { OrderStatus } from '@/modules/food/types';

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;

/** The real lifecycle, in order. `cancelled` is not on it   it ends the line. */
const STAGES: { status: OrderStatus; label: string; icon: typeof ChefHat }[] = [
  { status: 'pending', label: 'Order placed', icon: Package },
  { status: 'preparing', label: 'Being prepared', icon: ChefHat },
  { status: 'picked_up', label: 'Picked up by rider', icon: Bike },
  { status: 'on_the_way', label: 'On the way to you', icon: Bike },
  { status: 'delivered', label: 'Delivered', icon: Check },
];

export function TrackPanel({ orderId }: { orderId: string }) {
  useOrderRealtime(orderId);
  const release = useReleaseOrderEscrow();
  const pay = usePayOrderFromWallet();
  const { data: holds = [] } = useEscrowHolds('held');
  const [actionError, setActionError] = useState<string | null>(null);
  const { data: order, isLoading, isError } = useOrder(orderId);
  const { data: events = [] } = useOrderEvents(orderId);
  // Only returns a row while the delivery is actually in flight.
  const { data: tracking } = useDeliveryTracking(orderId, order?.status !== 'delivered');

  const stageIndex = useMemo(() => {
    if (!order) return 0;
    const i = STAGES.findIndex((s) => s.status === order.status);
    return i < 0 ? 0 : i;
  }, [order]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-ink/5 h-24 animate-pulse rounded-2xl" />
        <div className="bg-ink/5 h-64 animate-pulse rounded-2xl" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="border-line/10 flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
        <HelpCircle className="text-content-muted size-8" strokeWidth={1.5} />
        <p className="text-content font-medium">Order not found</p>
        <p className="text-content-muted text-sm">
          It may belong to another account, or the link is wrong.
        </p>
        <Button asChild variant="outline">
          <Link href="/food/orders">Back to orders</Link>
        </Button>
      </div>
    );
  }

  const cancelled = order.status === 'cancelled';

  return (
    <div className="flex flex-col gap-6">
      <div className="border-line/10 bg-panel flex flex-wrap items-start justify-between gap-4 rounded-2xl border p-5">
        <div>
          <p className="text-content-muted font-mono text-[11px] tracking-wide uppercase">
            Order {order.id.slice(0, 8).toUpperCase()}
          </p>
          <h1 className="font-display text-content mt-1 text-2xl">
            {order.vendorName ?? 'Your order'}
          </h1>
          <p className="text-content-muted mt-1 flex items-center gap-1 text-sm">
            <MapPin className="size-3.5" />
            {order.deliveryAddress ?? 'No delivery address given'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-content text-xl font-semibold">{naira(order.totalKobo)}</p>
          {!cancelled && order.etaMinutes ? (
            <p className="text-content-muted mt-1 flex items-center justify-end gap-1 text-xs">
              <Clock className="size-3" /> Estimated {order.etaMinutes} min
            </p>
          ) : null}
          {cancelled && <Badge className="mt-1 bg-rose-500/90 text-white">Cancelled</Badge>}
        </div>
      </div>

      {cancelled ? (
        <p className="text-content-muted border-line/10 rounded-2xl border border-dashed p-6 text-sm">
          This order was cancelled. If you were charged, the refund goes back to your wallet.
        </p>
      ) : (
        <section className="border-line/10 bg-panel flex flex-col gap-4 rounded-2xl border p-5">
          {STAGES.map((stage, i) => {
            const done = i < stageIndex;
            const active = i === stageIndex;
            const Icon = stage.icon;
            return (
              <div key={stage.status + i} className="flex items-start gap-3">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                    done
                      ? 'bg-lime-deep text-white'
                      : active
                        ? 'bg-lime/20 text-lime-deep'
                        : 'bg-surface-deep text-content-muted'
                  }`}
                >
                  {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm ${active ? 'text-content font-medium' : done ? 'text-content-muted' : 'text-content-muted/60'}`}
                  >
                    {stage.label}
                  </p>
                  {active && (
                    <p className="text-content-muted text-xs">
                      {stage.status === 'pending'
                        ? 'Waiting for the vendor to accept.'
                        : 'In progress.'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Only when a rider has actually reported a position. */}
      {tracking?.riderPosition && (
        <section className="border-line/10 bg-panel flex items-center justify-between gap-3 rounded-2xl border p-4">
          <div>
            <p className="text-content text-sm font-medium">Rider is on the move</p>
            <p className="text-content-muted text-xs">
              Last seen{' '}
              {tracking.lastSeenAt
                ? new Date(tracking.lastSeenAt).toLocaleTimeString('en-NG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'just now'}
            </p>
          </div>
          <Button asChild variant="outline" className="gap-1">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${tracking.riderPosition.lat},${tracking.riderPosition.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin className="size-4" /> View
            </a>
          </Button>
        </section>
      )}

      {actionError && (
        <p className="text-coral border-coral/30 bg-coral/5 rounded-lg border px-3 py-2 text-sm">
          {actionError}
        </p>
      )}

      {/* UNPAID: checkout creates the order and pays separately, so a payment
          failure lands here with a recoverable order rather than a lost cart. */}
      {!order.paidAt && !cancelled && (
        <section className="border-line/10 flex flex-col gap-2 rounded-2xl border border-dashed p-4">
          <p className="text-content text-sm font-medium">This order is not paid yet</p>
          <p className="text-content-muted text-xs">
            It is held for you. Pay from your wallet to send it to the vendor.
          </p>
          <Button
            className="self-start"
            disabled={pay.isPending}
            onClick={() => {
              setActionError(null);
              pay.mutate(orderId, {
                onError: (e) =>
                  setActionError(e instanceof Error ? e.message : 'Payment failed'),
              });
            }}
          >
            {pay.isPending ? 'Paying…' : 'Pay from wallet'}
          </Button>
        </section>
      )}

      {/* CONFIRM: releasing escrow is the payer's call. The vendor cannot do it,
          and a cron settles it after release_after if the student never does. */}
      {order.paidAt && order.status === 'delivered' && holds.some((h) => h.orderId === orderId) && (
        <section className="border-lime-deep/30 bg-lime/5 flex flex-col gap-2 rounded-2xl border p-4">
          <p className="text-content text-sm font-medium">Did your order arrive?</p>
          <p className="text-content-muted text-xs">
            Confirming releases payment to the vendor. If you do nothing it releases
            automatically once the hold matures.
          </p>
          <Button
            className="self-start"
            disabled={release.isPending}
            onClick={() => {
              setActionError(null);
              release.mutate(orderId, {
                onError: (e) =>
                  setActionError(e instanceof Error ? e.message : 'Could not confirm'),
              });
            }}
          >
            {release.isPending ? 'Confirming…' : 'Yes, it arrived'}
          </Button>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">ITEMS</h2>
        <div className="border-line/10 bg-panel divide-line/5 divide-y rounded-2xl border">
          {order.lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-content text-sm">
                {l.name} <span className="text-content-muted">× {l.qty}</span>
              </span>
              <span className="text-content-muted font-mono text-sm">
                {naira(l.priceKobo * l.qty)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {events.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-content-muted font-mono text-sm tracking-wide">HISTORY</h2>
          <ol className="border-line/10 bg-panel divide-line/5 divide-y rounded-2xl border">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-content text-sm capitalize">
                  {e.toStatus.replace(/_/g, ' ')}
                  {e.note ? `   ${e.note}` : ''}
                </span>
                <span className="text-content-muted font-mono text-xs">
                  {new Date(e.createdAt).toLocaleTimeString('en-NG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
