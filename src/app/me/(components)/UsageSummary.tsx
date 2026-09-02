// Client component: reads useMyOrders / useMyBookings / useMyTickets, and /me/page.tsx is a server component.
'use client';

/**
 * UsageSummary - KPI strip at the top of the student dashboard.
 *
 * EVERY FIGURE IS DERIVED, NONE IS STORED
 *   Spend comes from the student's own orders, bookings from `bookings`,
 *   tickets from `tickets`. A stored counter drifts the moment anything is
 *   refunded or cancelled, and a dashboard that disagrees with the page it
 *   links to is worse than no dashboard.
 *
 * THE FOURTH TILE IS GONE
 *   The mock's "SAVED VIA SYNC · ₦18,200 across deals" has nothing behind it.
 *   Promotions record a redemption count on the promotion, not a per-student
 *   saving, so that number cannot be computed from this schema. Showing a real
 *   three beats showing four with one invented.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Wallet, BedDouble, CalendarDays } from 'lucide-react';
import { useMyOrders } from '@/modules/food/hooks';
import { useMyBookings } from '@/modules/hostels/hooks';
import { useMyTickets } from '@/modules/events/hooks';
import type { BookingStatus } from '@/modules/hostels/types';

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;

/** A booking still in play   neither finished nor called off. */
const CLOSED: BookingStatus[] = ['completed', 'cancelled', 'expired'];

export function UsageSummary() {
  const { data: orders = [], isLoading: lo } = useMyOrders({ pageSize: 100 });
  const { data: bookings = [], isLoading: lb } = useMyBookings();
  const { data: tickets = [], isLoading: lt } = useMyTickets({ status: 'valid', pageSize: 50 });
  const isLoading = lo || lb || lt;

  // Cancelled orders are not spend. Everything else the student committed to is.
  const spentKobo = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.totalKobo, 0);

  const active = bookings.filter((b) => !CLOSED.includes(b.status));
  const endingSoon = active.filter(
    (b) => b.endDate && new Date(b.endDate).getTime() - Date.now() <= 30 * 86_400_000,
  ).length;

  const stats = [
    {
      label: 'TOTAL SPENT',
      value: naira(spentKobo),
      sub: `across ${orders.length} order${orders.length === 1 ? '' : 's'}`,
      icon: Wallet,
    },
    {
      label: 'ACTIVE BOOKINGS',
      value: String(active.length),
      sub: endingSoon ? `${endingSoon} ending soon` : 'none ending soon',
      icon: BedDouble,
    },
    {
      label: 'TICKETS HELD',
      value: String(tickets.length),
      sub: tickets.length ? 'ready to scan' : 'no tickets yet',
      icon: CalendarDays,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {stats.map(({ label, value, sub, icon: Icon }) => (
        <Card key={label} className="border-line/10 border">
          <CardHeader>
            <CardTitle className="text-content-muted flex items-center gap-2 font-mono text-xs tracking-wide">
              <Icon className="size-4 shrink-0" />
              {label}
            </CardTitle>
          </CardHeader>
          <CardContent className="font-body">
            {isLoading ? (
              <div className="bg-ink/5 h-8 w-20 animate-pulse rounded" />
            ) : (
              <p className="text-content text-2xl font-bold">{value}</p>
            )}
            <p className="text-content-muted mt-1 text-xs">{sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
