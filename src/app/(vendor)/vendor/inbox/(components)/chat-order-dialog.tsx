'use client';

import { Package } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChatOrder } from '@/modules/vendor/types';
import { ORDER_STATUS_PILL } from './order-status';

interface ChatOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: ChatOrder;
  orders?: ChatOrder[];
}

/**
 * "Order Details" - the order pinned to this conversation, plus the customer's
 * other recent orders for context.
 */
export function ChatOrderDialog({ open, onOpenChange, order, orders = [] }: ChatOrderDialogProps) {
  const others = orders.filter((item) => item.orderId !== order?.orderId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Order Details</DialogTitle>
        </DialogHeader>

        {!order ? (
          <p className="text-content-muted py-10 text-center text-sm">
            No order is linked to this conversation.
          </p>
        ) : (
          <>
            <div className="border-line/15 rounded-xl border p-4">
              <div className="flex items-center gap-3">
                <span className="bg-surface-deep flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <Package className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-content truncate text-sm font-semibold">{order.orderId}</p>
                  <p className="text-content-muted truncate text-xs">{order.items}</p>
                </div>

                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
                    ORDER_STATUS_PILL[order.status],
                  )}
                >
                  {order.status}
                </span>
              </div>

              <div className="border-line/15 mt-4 flex items-center justify-between border-t pt-3">
                <span className="text-content-muted text-xs">Total</span>
                <span className="text-content text-sm font-semibold">{order.total}</span>
              </div>
            </div>

            {others.length > 0 && (
              <div className="mt-5">
                <h3 className="text-content-muted mb-2 text-xs font-medium tracking-wide uppercase">
                  Other recent orders
                </h3>

                <ul className="space-y-2">
                  {others.map((item) => (
                    <li
                      key={item.orderId}
                      className="border-line/15 flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-content truncate text-xs font-semibold">
                          {item.orderId}
                        </p>
                        <p className="text-content-muted truncate text-xs">{item.items}</p>
                      </div>

                      <span className="text-content shrink-0 text-xs font-medium">
                        {item.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
