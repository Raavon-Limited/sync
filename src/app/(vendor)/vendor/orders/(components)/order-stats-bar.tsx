'use client';

import { CustomCard } from '@/components/shared/card';
import { cn } from '@/lib/utils';
import {
  ALL_ORDERS_STYLE,
  ORDER_STATUSES,
  ORDER_STATUS_STYLE,
  countByStatus,
  type OrderStatusFilter,
} from '@/config/order-status';
import type { Order } from '@/types/order';

interface OrderStatsBarProps {
  /** Always the full set - counts describe everything, not the current filter. */
  orders: Order[];
  active: OrderStatusFilter;
  onSelect: (status: OrderStatusFilter) => void;
}

/**
 * Order counts by status, doubling as the status filter.
 *
 * The counts are derived from `orders` rather than read from a hardcoded list,
 * so a card can never claim a number the table can't produce. Clicking a card
 * filters the table; clicking the active one clears back to "All".
 */
export function OrderStatsBar({ orders, active, onSelect }: OrderStatsBarProps) {
  const counts = countByStatus(orders);

  const cards = [
    { key: 'all' as const, label: 'ALL ORDERS', value: orders.length, style: ALL_ORDERS_STYLE },
    ...ORDER_STATUSES.map((status) => ({
      key: status,
      label: status.toUpperCase(),
      value: counts[status],
      style: ORDER_STATUS_STYLE[status],
    })),
  ];

  return (
    <div
      role="group"
      aria-label="Filter orders by status"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5"
    >
      {cards.map(({ key, label, value, style }) => {
        const isActive = active === key;
        const Icon = style.icon;

        return (
          <CustomCard
            key={key}
            label={label}
            value={<span className={style.tint}>{value}</span>}
            icon={<Icon className={cn('size-5', style.tint)} aria-hidden="true" />}
            iconBg={style.badge}
            // Clicking the active card clears the filter, so the cards can't
            // strand you in a filtered view with no visible way out.
            onClick={() => onSelect(isActive ? 'all' : key)}
            selected={isActive}
            className={cn(
              'text-left transition-shadow',
              isActive && 'ring-accent-fg ring-2',
              value === 0 && !isActive && 'opacity-60',
            )}
          />
        );
      })}
    </div>
  );
}
