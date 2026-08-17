'use client';

import { Order } from '@/types/order';
import { ColumnDef } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { CalendarDays, Hash, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ORDER_PAYMENT_STYLE, ORDER_STATUS_STYLE } from '@/config/order-status';

function Pill({
  icon: Icon,
  className,
  label,
}: {
  icon: LucideIcon;
  className: string;
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

interface OrderColumnOptions {
  /** Opens the inbox thread for this order's customer. */
  onMessage: (order: Order) => void;
}

export function createOrderColumns({ onMessage }: OrderColumnOptions): ColumnDef<Order>[] {
  return [
    {
      accessorKey: 'id',
      header: 'ORDER ID',
      cell: ({ row }) => (
        <span className="text-content-muted inline-flex items-center gap-1 font-mono text-xs tabular-nums">
          <Hash className="size-3.5 shrink-0" aria-hidden="true" />
          {row.original.id.replace(/^#/, '')}
        </span>
      ),
    },
    {
      accessorKey: 'customer',
      header: 'CUSTOMER',
      cell: ({ row }) => (
        <span className="flex items-center gap-2.5">
          <span
            className="bg-lime text-ink flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            aria-hidden="true"
          >
            {row.original.customer.charAt(0).toUpperCase()}
          </span>
          <span className="text-content font-medium">{row.original.customer}</span>
        </span>
      ),
    },
    {
      accessorKey: 'product',
      header: 'PRODUCT',
    },
    {
      accessorKey: 'date',
      header: 'DATE',
      cell: ({ row }) => (
        <span className="text-content-muted inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
          {row.original.date}
        </span>
      ),
    },
    {
      accessorKey: 'amount',
      header: 'AMOUNT',
      cell: ({ row }) => (
        <span className="text-content font-medium tabular-nums">
          ₦{row.original.amount.toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: 'payment',
      header: 'PAYMENT',
      cell: ({ row }) => {
        const { icon, pill } = ORDER_PAYMENT_STYLE[row.original.payment];
        return <Pill icon={icon} className={pill} label={row.original.payment} />;
      },
    },
    {
      accessorKey: 'status',
      header: 'STATUS',
      cell: ({ row }) => {
        const { icon, pill } = ORDER_STATUS_STYLE[row.original.status];
        return <Pill icon={icon} className={pill} label={row.original.status} />;
      },
    },
    {
      id: 'actions',
      header: '',
      enableGlobalFilter: false,
      enableSorting: false,
      cell: ({ row }) => {
        const order = row.original;
        return (
          <button
            type="button"
            /*
             * The row itself opens the details dialog, so keep this click from
             * bubbling - otherwise messaging also pops the dialog behind it.
             */
            onClick={(event) => {
              event.stopPropagation();
              onMessage(order);
            }}
            /*
             * The row also handles Enter/Space for keyboard users, so the key
             * event has to stop here too - otherwise activating this button
             * navigates AND opens the details dialog behind it.
             */
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
            }}
            title={`Message ${order.customer} about ${order.id}`}
            aria-label={`Message ${order.customer} about order ${order.id}`}
            className="text-content-muted focus-visible:ring-accent-fg inline-flex size-8 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none"
          >
            <MessageSquare className="size-4" aria-hidden="true" />
          </button>
        );
      },
    },
  ];
}
