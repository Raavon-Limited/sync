'use client';

import { CalendarDays, Package, Receipt, User } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Order } from '@/types/order';

interface OrderDetailsDialogProps {
  order: Order | null;
  onClose: () => void;
}

const statusVariant: Record<Order['status'], string> = {
  Pending: 'bg-ink/8 text-ink',
  Processing: 'bg-amber-100 text-amber-700',
  Delivered: 'bg-green-100 text-green-700',
  Cancelled: 'bg-red-100 text-red-700',
};

const paymentVariant: Record<Order['payment'], string> = {
  Paid: 'bg-green-100 text-green-700',
  Pending: 'bg-amber-100 text-amber-700',
  Failed: 'bg-red-100 text-red-700',
};

/**
 * The dialog's contents. Split out from the Dialog wrapper because Radix
 * renders dialog content through a Portal, which means it can't be rendered -
 * or asserted on - outside a browser.
 */
export function OrderDetailsBody({ order }: { order: Order }) {
  const rows = [
    { icon: User, label: 'Customer', value: order.customer },
    { icon: Package, label: 'Product', value: order.product },
    { icon: CalendarDays, label: 'Date', value: order.date },
    { icon: Receipt, label: 'Order ID', value: order.id },
  ];

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-medium',
            statusVariant[order.status],
          )}
        >
          {order.status}
        </span>

        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-medium',
            paymentVariant[order.payment],
          )}
        >
          Payment: {order.payment}
        </span>
      </div>

      <dl className="border-line/10 mt-5 divide-y divide-current/5 rounded-xl border">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3">
            <span className="bg-ink/5 flex size-8 shrink-0 items-center justify-center rounded-lg">
              <Icon className="size-4" />
            </span>

            <dt className="text-muted text-xs">{label}</dt>

            <dd className="text-content ml-auto min-w-0 truncate text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="border-line/10 mt-4 flex items-center justify-between rounded-xl border px-4 py-3">
        <span className="text-muted text-xs tracking-wide uppercase">Total</span>

        <span className="text-content font-display text-lg font-semibold">
          ₦{order.amount.toLocaleString()}
        </span>
      </div>
    </>
  );
}

/**
 * Details for a single order, opened by clicking its row in the orders table.
 */
export function OrderDetailsDialog({ order, onClose }: OrderDetailsDialogProps) {
  /*
   * Driven straight off `order` so there's no second "is it open" state to keep
   * in sync. Radix still needs the node mounted long enough to animate out, but
   * the parent clears the selection on close, which is the same thing.
   */
  const open = order !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle>Order {order.id}</DialogTitle>
            </DialogHeader>

            <OrderDetailsBody order={order} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
