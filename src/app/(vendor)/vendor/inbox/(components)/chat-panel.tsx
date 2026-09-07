'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { Button } from '@/components/ui';

import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatCustomer } from '@/modules/vendor/types';
import { ORDER_STATUS_TEXT } from './order-status';

interface ChatCustomerPanelProps {
  customer: ChatCustomer;
  onViewProfile?: () => void;
  onViewAllOrders?: () => void;
}

export function ChatCustomerPanel({
  customer,
  onViewProfile,
  onViewAllOrders,
}: ChatCustomerPanelProps) {
  const initials = customer.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);

  return (
    <div className="border-line/10 flex h-full w-64 shrink-0 flex-col gap-5 border-l px-4 py-5">
      {/* Customer identity */}
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar className="size-16">
          <AvatarImage src={customer.avatarUrl} alt={customer.name} />
          <AvatarFallback className="text-lg">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-content font-display font-semibold">{customer.name}</p>
          <p className="text-content-muted text-xs">{customer.location}</p>
          <p className="text-content-muted text-xs">Customer since {customer.memberSince}</p>
        </div>
      </div>

      <div className="border-line/10 border-t" />

      {/* Stats */}
      <div>
        <p className="text-content-muted mb-2 font-mono text-[10px] tracking-widest uppercase">
          Customer Stats
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface-deep rounded-lg p-3 text-center">
            <p className="text-content text-xl font-bold">{customer.totalOrders}</p>
            <p className="text-content-muted text-xs">Orders</p>
          </div>
          <div className="bg-surface-deep rounded-lg p-3 text-center">
            <p className="text-content text-lg font-bold">{customer.totalSpent}</p>
            <p className="text-content-muted text-xs">Spent</p>
          </div>
        </div>
      </div>

      {/* Recent orders */}
      <div className="flex flex-col gap-2">
        <p className="text-content-muted font-mono text-[10px] tracking-widest uppercase">
          Recent Orders
        </p>
        {customer.recentOrders.map((order) => (
          <div
            key={order.orderId}
            className="border-line/10 flex items-start justify-between border-b pb-2"
          >
            <div>
              <p className="text-accent-fg text-xs font-semibold">{order.orderId}</p>
              <p className="text-content-muted text-xs">{order.items}</p>
            </div>
            <div className="text-right">
              <p className="text-content text-xs font-semibold">{order.total}</p>
              <p className={cn('text-xs font-medium', ORDER_STATUS_TEXT[order.status])}>
                {order.status}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <Button variant="dark" size="sm" className="w-full rounded-lg" onClick={onViewProfile}>
          View Full Profile
        </Button>
        <Button variant="outline" size="sm" className="w-full rounded-lg" onClick={onViewAllOrders}>
          All Orders <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
