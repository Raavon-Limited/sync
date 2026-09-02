/**
 * Student spend analytics.
 *
 * WHAT IS ACTUALLY DERIVABLE
 *   Four spend sources exist and each is countable: food orders, hostel
 *   bookings, service requests, event tickets. Monthly totals and a category
 *   split fall out of those.
 *
 * WHAT IS NOT, AND SO IS NOT SHOWN
 *   The mock's "SAVED VIA SYNC · ₦18,200 across deals" has nothing behind it  
 *   promotions record a redemption count on the promotion, not a per-student
 *   saving. Same tile was removed from the dashboard for the same reason.
 *
 * WHAT COUNTS AS SPENT
 *   An order that was cancelled is not spend. A booking is only spend once it
 *   has been paid   `paid_at`, set by the payment webhook, not by reaching a
 *   status. A service request counts at its AGREED price, and only once
 *   completed: a quote is not money.
 */
'use client';

import { useMemo } from 'react';
import { BedDouble, CalendarDays, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { SpendChart } from '../../(components)/SpendChart';
import { useMyOrders } from '@/modules/food/hooks';
import { useMyBookings } from '@/modules/hostels/hooks';
import { useServiceRequests } from '@/modules/services/hooks';
import { useMyTickets } from '@/modules/events/hooks';

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Spend {
  category: string;
  kobo: number;
  at: string;
}

export function InsightsPanel() {
  const { data: orders = [], isLoading: lo } = useMyOrders({ pageSize: 200 });
  const { data: bookings = [], isLoading: lb } = useMyBookings();
  const { data: requests = [], isLoading: lr } = useServiceRequests();
  const { data: tickets = [], isLoading: lt } = useMyTickets({ pageSize: 200 });
  const isLoading = lo || lb || lr || lt;

  const spends = useMemo<Spend[]>(() => {
    const out: Spend[] = [];

    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      out.push({ category: 'Food', kobo: o.totalKobo, at: o.placedAt });
    }
    for (const b of bookings) {
      // Only actual payment counts. A confirmed booking that has not been paid
      // is a commitment, not spend.
      if (!b.paidAt || !b.pricePerSessionKobo) continue;
      out.push({ category: 'Hostel', kobo: b.pricePerSessionKobo, at: b.paidAt });
    }
    for (const r of requests) {
      if (r.status !== 'completed') continue;
      const kobo = r.agreedKobo ?? 0;
      if (!kobo) continue;
      const label = r.vertical === 'beauty' ? 'Beauty' : r.vertical === 'laundry' ? 'Laundry' : 'Workmanship';
      out.push({ category: label, kobo, at: r.completedAt ?? r.createdAt });
    }
    for (const t of tickets) {
      if (t.status === 'refunded') continue;
      out.push({ category: 'Events & tickets', kobo: t.priceKobo, at: t.createdAt });
    }
    return out;
  }, [orders, bookings, requests, tickets]);

  const totalKobo = spends.reduce((s, x) => s + x.kobo, 0);

  // Last six calendar months, oldest first, including months with no spend  
  // gaps are information, and a chart that silently skips them misleads.
  const monthly = useMemo(() => {
    const now = new Date();
    const frame: { month: string; amount: number; key: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      frame.push({ month: MONTHS[d.getMonth()], amount: 0, key: `${d.getFullYear()}-${d.getMonth()}` });
    }
    for (const s of spends) {
      const d = new Date(s.at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const slot = frame.find((f) => f.key === key);
      if (slot) slot.amount += s.kobo / 100;
    }
    return frame.map(({ month, amount }) => ({ month, amount }));
  }, [spends]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of spends) map.set(s.category, (map.get(s.category) ?? 0) + s.kobo);
    return [...map.entries()]
      .map(([label, kobo]) => ({
        label,
        amount: Math.round(kobo / 100),
        pct: totalKobo ? Math.round((kobo / totalKobo) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [spends, totalKobo]);

  // Average over months that actually had activity, not over six   dividing a
  // new student's first month by six understates what they spend.
  const activeMonths = monthly.filter((m) => m.amount > 0).length;
  const avgKobo = activeMonths ? totalKobo / activeMonths : 0;
  const top = byCategory[0];

  const stats: { label: string; value: string; sub: string; icon: LucideIcon }[] = [
    { label: 'TOTAL SPENT', value: naira(totalKobo), sub: `${spends.length} transaction${spends.length === 1 ? '' : 's'}`, icon: Wallet },
    { label: 'AVG / MONTH', value: naira(avgKobo), sub: activeMonths ? `over ${activeMonths} active month${activeMonths === 1 ? '' : 's'}` : 'no activity yet', icon: TrendingUp },
    { label: 'TOP CATEGORY', value: top?.label ?? ' ', sub: top ? `${top.pct}% of spend` : 'nothing spent yet', icon: BedDouble },
    { label: 'TICKETS HELD', value: String(tickets.filter((t) => t.status === 'valid').length), sub: 'valid right now', icon: CalendarDays },
  ];

  return (
    <section className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <h2 className="text-content-muted mb-3 font-mono text-sm tracking-wide">
            MONTHLY SPEND . LAST 6 MONTHS
          </h2>
          <SpendChart data={monthly} />
        </div>

        <div className="w-full shrink-0 lg:w-80">
          <h2 className="text-content-muted mb-3 font-mono text-sm tracking-wide">
            SPEND BY CATEGORY
          </h2>
          <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-5">
            {byCategory.length === 0 ? (
              <p className="text-content-muted text-sm">
                Nothing spent yet. Orders, bookings and tickets show up here.
              </p>
            ) : (
              byCategory.map((c) => (
                <div key={c.label} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-content text-sm">{c.label}</span>
                    <span className="text-content-muted font-mono text-xs">
                      ₦{c.amount.toLocaleString()} · {c.pct}%
                    </span>
                  </div>
                  <div className="bg-surface-deep h-1.5 overflow-hidden rounded-full">
                    <div className="bg-lime-deep h-full rounded-full" style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
