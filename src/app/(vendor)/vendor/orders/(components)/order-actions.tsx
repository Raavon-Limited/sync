/**
 * The vendor's actions on one order.
 *
 * WHY THIS DID NOT EXIST
 *   `useUpdateOrderStatus` has been in the codebase with zero callers, and
 *   `order-details-dialog` had no button in it. The vendor orders page was
 *   read-only: a vendor could watch orders arrive and could not accept, fulfil
 *   or refuse a single one of them.
 *
 * CANCELLING IS NOT A STATUS CHANGE
 *   It moves money. `updateOrderStatus` routes 'cancelled' through the
 *   `cancel_order` RPC, which cancels and refunds the student in one
 *   transaction   see 20260829100000. Writing the status directly would leave
 *   the escrow hold sitting at 'held' and the hourly cron would pay the vendor
 *   in full for an order that never happened.
 *
 *   Which is why it asks first. Every other action here is recoverable by
 *   tapping the next one; this one hands money back and is not.
 */
'use client';

import { useState } from 'react';
import { Check, ChefHat, TriangleAlert, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useUpdateOrderStatus } from '@/modules/vendor/hooks';
import type { FoodOrder, OrderStatus } from '@/modules/food/types';

/**
 * What the vendor can do next, by where the order is.
 *
 * `picked_up` and `on_the_way` are the rider's states   the vendor's part is
 * done   so they offer no forward action, only the ability to cancel while the
 * food has not arrived.
 */
const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string; icon: typeof Check }>> = {
  pending: { status: 'preparing', label: 'Accept & start preparing', icon: ChefHat },
  preparing: { status: 'delivered', label: 'Mark delivered', icon: Check },
};

/** Nothing to do once the food arrived or the order is already off. */
const TERMINAL: OrderStatus[] = ['delivered', 'cancelled'];

export function OrderActions({ order }: { order: FoodOrder }) {
  const update = useUpdateOrderStatus();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  if (TERMINAL.includes(order.status)) {
    return (
      <p className="text-content-muted mt-4 text-xs">
        {order.status === 'delivered'
          ? 'Delivered. Escrow releases to you automatically.'
          : 'Cancelled. The customer has been refunded in full.'}
      </p>
    );
  }

  const next = NEXT[order.status];
  const busy = update.isPending;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {!confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          {next && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => update.mutate({ orderId: order.id, status: next.status })}
              className="gap-2"
            >
              <next.icon className="size-4" />
              {busy ? 'Saving…' : next.label}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="text-coral gap-2"
          >
            <X className="size-4" /> Cancel & refund
          </Button>
        </div>
      ) : (
        <div className="border-coral/30 bg-coral/5 flex flex-col gap-3 rounded-xl border p-3">
          <p className="text-content flex items-start gap-2 text-sm">
            <TriangleAlert className="text-coral mt-0.5 size-4 shrink-0" />
            {/* The amount is stated because this is the number leaving the
                vendor's takings, and "cancel" on its own does not convey it. */}
            <span>
              This refunds ₦{(order.totalKobo / 100).toLocaleString('en-NG')} to the customer
              immediately. It cannot be undone.
            </span>
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-content-muted text-xs">
              Reason (shown on the customer&apos;s receipt)
            </span>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Sold out of jollof rice"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                update.mutate(
                  { orderId: order.id, status: 'cancelled', reason: reason.trim() || undefined },
                  { onSuccess: () => setConfirming(false) },
                )
              }
              className="bg-coral gap-2 text-white"
            >
              {busy ? 'Refunding…' : 'Cancel and refund'}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              Keep the order
            </Button>
          </div>
        </div>
      )}

      {update.isError && (
        <p className="text-coral text-xs">{(update.error as Error).message}</p>
      )}
    </div>
  );
}
