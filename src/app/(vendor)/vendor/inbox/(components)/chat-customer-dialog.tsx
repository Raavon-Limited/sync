'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChatCustomer, ChatOrder } from '@/modules/vendor/types';

interface ChatCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: ChatCustomer;
}

const statusColor: Record<ChatOrder['status'], string> = {
  Processing: 'text-amber-600',
  Completed: 'text-green-600',
  Cancelled: 'text-red-600',
  Pending: 'text-muted',
};

/**
 * "View Customer" - the same profile the desktop side panel shows, in a dialog
 * so the action also works on mobile where that panel is hidden.
 */
export function ChatCustomerDialog({ open, onOpenChange, customer }: ChatCustomerDialogProps) {
  if (!customer) return null;

  const initials = customer.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Customer</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar className="size-16">
            <AvatarImage src={customer.avatarUrl} alt={customer.name} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>

          <div>
            <p className="text-ink font-display font-semibold">{customer.name}</p>
            <p className="text-muted text-xs">{customer.location}</p>
            <p className="text-muted text-xs">Customer since {customer.memberSince}</p>
          </div>
        </div>

        <div className="border-ink/10 mt-5 grid grid-cols-2 gap-3 rounded-xl border p-3 text-center">
          <div>
            <p className="text-ink text-base font-semibold">{customer.totalOrders}</p>
            <p className="text-muted text-xs">Total orders</p>
          </div>

          <div>
            <p className="text-ink text-base font-semibold">{customer.totalSpent}</p>
            <p className="text-muted text-xs">Total spent</p>
          </div>
        </div>

        {customer.recentOrders.length > 0 && (
          <div className="mt-5">
            <h3 className="text-muted mb-2 text-xs font-medium tracking-wide uppercase">
              Recent orders
            </h3>

            <ul className="space-y-2">
              {customer.recentOrders.map((order) => (
                <li
                  key={order.orderId}
                  className="border-ink/10 flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-ink truncate text-xs font-semibold">{order.orderId}</p>
                    <p className="text-muted truncate text-xs">{order.items}</p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-ink text-xs font-medium">{order.total}</p>
                    <p className={cn('text-xs', statusColor[order.status])}>{order.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
