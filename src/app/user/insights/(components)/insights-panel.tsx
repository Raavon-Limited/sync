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
 * WHAT WAS ADDED, AND WHY EACH ONE IS DERIVABLE
 *   Four tiles, a bar chart and a category split answered "how much" and
 *   nothing else. A student looking at ₦300,000 of hostel spend could not see
 *   WHICH payment that was, when it happened, whether this month is heavier
 *   than last, or what they still owe. All of that is in data already
 *   fetched by this component - it was aggregated away and never shown.
 *
 *     Month on month   two adjacent buckets of `monthly`, already computed.
 *     Money committed  bookings at awaiting_payment: not spend yet, but owed,
 *                      and each carries the deadline it lapses on.
 *     Wallet + escrow  `useWallet` - the balance they can spend and the
 *                      amount of their own money currently frozen in escrow.
 *     Transactions     the line items behind every total on the page.
 *
 * STILL NOT SHOWN, for the same reason as the savings tile: anything that
 * would need a number nothing records. There is no budget feature, so there
 * is no "over budget"; no per-student promotion accounting, so no "saved".
 *
 * WHAT COUNTS AS SPENT
 *   An order that was cancelled is not spend. A booking is only spend once it
 *   has been paid   `paid_at`, set by the payment webhook, not by reaching a
 *   status. A service request counts at its AGREED price, and only once
 *   completed: a quote is not money.
 */
'use client';

import { useMemo } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BedDouble,
  CalendarDays,
  Clock,
  Lock,
  Minus,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { SpendChart } from '../../(components)/SpendChart';
import { useMyOrders } from '@/modules/food/hooks';
import { useMyBookings } from '@/modules/hostels/hooks';
import { useServiceRequests } from '@/modules/services/hooks';
import { useMyTickets } from '@/modules/events/hooks';
import { useWallet } from '@/modules/payments/hooks';

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Spend {
  category: string;
  kobo: number;
  at: string;
  /** What this actually was, so the list is readable without opening it. */
  label: string;
}

export function InsightsPanel() {
  const { data: orders = [], isLoading: lo } = useMyOrders({ pageSize: 200 });
  const { data: bookings = [], isLoading: lb } = useMyBookings();
  const { data: requests = [], isLoading: lr } = useServiceRequests();
  const { data: tickets = [], isLoading: lt } = useMyTickets({ pageSize: 200 });
  // Not spend, but the two numbers a student most wants beside it: what they
  // can spend, and how much of their own money is currently frozen.
  const { data: wallet } = useWallet();
  const isLoading = lo || lb || lr || lt;

  const spends = useMemo<Spend[]>(() => {
    const out: Spend[] = [];

    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      out.push({
        category: 'Food',
        kobo: o.totalKobo,
        at: o.placedAt,
        label: o.vendorName ?? 'Food order',
      });
    }
    for (const b of bookings) {
      // Only actual payment counts. A confirmed booking that has not been paid
      // is a commitment, not spend.
      if (!b.paidAt || !b.pricePerSessionKobo) continue;
      out.push({
        category: 'Hostel',
        kobo: b.pricePerSessionKobo,
        at: b.paidAt,
        label: b.hostelName ?? 'Hostel',
      });
    }
    for (const r of requests) {
      if (r.status !== 'completed') continue;
      const kobo = r.agreedKobo ?? 0;
      if (!kobo) continue;
      const label =
        r.vertical === 'beauty' ? 'Beauty' : r.vertical === 'laundry' ? 'Laundry' : 'Workmanship';
      out.push({
        category: label,
        kobo,
        at: r.completedAt ?? r.createdAt,
        label: r.serviceName ?? label,
      });
    }
    for (const t of tickets) {
      if (t.status === 'refunded') continue;
      out.push({
        category: 'Events & tickets',
        kobo: t.priceKobo,
        at: t.createdAt,
        label: t.eventName ?? 'Ticket',
      });
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
      frame.push({
        month: MONTHS[d.getMonth()],
        amount: 0,
        key: `${d.getFullYear()}-${d.getMonth()}`,
      });
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

  /*
   * THIS MONTH AGAINST LAST, from the two most recent buckets of `monthly`.
   *
   * A total with nothing to compare it to is a number, not an insight.
   * `null` when there is no previous month with spend: a first month is not
   * "up 100%", it is a first month, and saying otherwise invents a trend.
   */
  const thisMonth = monthly[monthly.length - 1]?.amount ?? 0;
  const lastMonth = monthly[monthly.length - 2]?.amount ?? 0;
  const momPct = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  /*
   * MONEY OWED BUT NOT SPENT. A booking at awaiting_payment is a room being
   * held: not spend (nothing has left the wallet) and not nothing either -
   * it is due, and it lapses on a deadline. Kept out of every spend total on
   * this page precisely because it has not been paid.
   */
  const committed = useMemo(
    () =>
      bookings
        .filter((b) => b.status === 'awaiting_payment')
        .map((b) => ({
          id: b.id,
          name: b.hostelName ?? 'Hostel',
          kobo: b.pricePerSessionKobo ?? 0,
          due: b.reservedUntil ?? null,
        })),
    [bookings],
  );
  const committedKobo = committed.reduce((t, c) => t + c.kobo, 0);

  // Newest first. The line items behind every total above - the page had the
  // rows all along and only ever showed their sum.
  const recent = useMemo(
    () => [...spends].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8),
    [spends],
  );

  // Average over months that actually had activity, not over six: dividing a
  // new student's first month by six understates what they spend.
  const activeMonths = monthly.filter((m) => m.amount > 0).length;
  const avgKobo = activeMonths ? totalKobo / activeMonths : 0;
  const top = byCategory[0];

  const stats: { label: string; value: string; sub: string; icon: LucideIcon }[] = [
    {
      label: 'TOTAL SPENT',
      value: naira(totalKobo),
      sub: `${spends.length} transaction${spends.length === 1 ? '' : 's'}`,
      icon: Wallet,
    },
    {
      label: 'AVG / MONTH',
      value: naira(avgKobo),
      sub: activeMonths
        ? `over ${activeMonths} active month${activeMonths === 1 ? '' : 's'}`
        : 'no activity yet',
      icon: TrendingUp,
    },
    {
      label: 'TOP CATEGORY',
      value: top?.label ?? ' ',
      sub: top ? `${top.pct}% of spend` : 'nothing spent yet',
      icon: BedDouble,
    },
    {
      label: 'TICKETS HELD',
      value: String(tickets.filter((t) => t.status === 'valid').length),
      sub: 'valid right now',
      icon: CalendarDays,
    },
    {
      label: 'THIS MONTH',
      value: naira(thisMonth * 100),
      sub:
        momPct === null
          ? 'no spend last month to compare'
          : `${momPct > 0 ? 'up' : momPct < 0 ? 'down' : 'level'} ${Math.abs(momPct)}% on last month`,
      icon: momPct === null ? Minus : momPct > 0 ? ArrowUpRight : ArrowDownRight,
    },
    {
      label: 'IN YOUR WALLET',
      value: naira(wallet?.balanceKobo ?? 0),
      sub: wallet?.pendingKobo
        ? `${naira(wallet.pendingKobo)} held in escrow`
        : 'nothing in escrow',
      icon: Wallet,
    },
    {
      label: 'DUE NOW',
      value: naira(committedKobo),
      sub: committed.length
        ? `${committed.length} room${committed.length === 1 ? '' : 's'} held for you`
        : 'nothing waiting on payment',
      icon: Lock,
    },
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
                    <div
                      className="bg-lime-deep h-full rounded-full"
                      style={{ width: `${c.pct}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/*
        WHAT THE NUMBERS ARE MADE OF.

        Every figure above is a sum, and a sum a student cannot break down is one
        they cannot check. "₦300,000 on hostels" is unarguable and useless; "Rent
        at Crescent villa 2, 7 September" is something they can recognise or
        query. The rows were always here - the page aggregated them and threw the
        detail away.
      */}
      {recent.length > 0 && (
        <div>
          <h2 className="text-content-muted mb-3 font-mono text-sm tracking-wide">
            RECENT ACTIVITY
          </h2>
          <ul className="border-line/10 divide-line/10 divide-y rounded-xl border">
            {recent.map((r, i) => (
              <li
                key={`${r.at}-${i}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-content truncate text-sm font-medium">{r.label}</p>
                  <p className="text-content-muted text-xs">
                    {r.category} ·{' '}
                    {new Date(r.at).toLocaleDateString('en-NG', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <span className="text-content shrink-0 font-mono text-sm tabular-nums">
                  {naira(r.kobo)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        DUE, WHICH IS NOT SPENT.

        Deliberately its own section rather than a line in the totals: none of
        this money has moved. It is rooms being held, each on a clock, and a
        student who reads it as spend would think they had paid for a room they
        are about to lose.
      */}
      {committed.length > 0 && (
        <div>
          <h2 className="text-content-muted mb-3 font-mono text-sm tracking-wide">
            HELD FOR YOU . NOT PAID YET
          </h2>
          <ul className="border-line/10 divide-line/10 divide-y rounded-xl border">
            {committed.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-content truncate text-sm font-medium">{c.name}</p>
                  {c.due && (
                    <p className="text-coral flex items-center gap-1 text-xs">
                      <Clock className="size-3" aria-hidden="true" />
                      pay by{' '}
                      {new Date(c.due).toLocaleString('en-NG', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
                <span className="text-content shrink-0 font-mono text-sm tabular-nums">
                  {naira(c.kobo)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
