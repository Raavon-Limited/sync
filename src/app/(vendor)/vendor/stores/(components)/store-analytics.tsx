/**
 * How each store is actually doing.
 *
 * WHY THIS IS NOT ON /vendor/earnings
 *   Earnings are per BUSINESS — the wallet, the payouts and the subscription
 *   all hang off `vendor_profiles`, so that screen shows one number no matter
 *   how many locations produced it. The question multi-store creates is
 *   "which location produced it?", and the answer is a `group by
 *   storefront_id`, not a second ledger. It belongs beside the stores.
 *
 * REVENUE HERE MEANS WHAT ARRIVED — released escrow, net of the platform's
 * commission. Booked money (paid, still in escrow) is shown beside it rather
 * than folded in: a vendor told they have earned money they cannot withdraw
 * yet will go looking for it in their wallet and not find it.
 */
'use client';

import { useMemo } from 'react';
import { Trophy, TrendingUp, Wallet, Undo2, BarChart3 } from 'lucide-react';
import { CustomCard } from '@/components/shared/card';
import { Badge } from '@/components/ui';
import { useStorePerformance, useStoreRevenueMonthly } from '@/modules/storefronts/hooks';
import type { StorePerformance, StoreRevenuePoint } from '@/modules/storefronts/types';

const MONTHS = 6;

function naira(kobo: number) {
  return `₦${Math.round(kobo / 100).toLocaleString()}`;
}

/** "2026-03-01" -> "Mar". Parsed as UTC so a late-evening load cannot slip a month. */
function monthLabel(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleString(undefined, { month: 'short', timeZone: 'UTC' });
}

export function StoreAnalytics() {
  const { data: rows = [], isLoading } = useStorePerformance();
  const { data: series = [] } = useStoreRevenueMonthly(MONTHS);

  const totals = useMemo(() => {
    const revenue = rows.reduce((n, r) => n + r.revenueKobo, 0);
    const booked = rows.reduce((n, r) => n + r.bookedKobo, 0);
    const refunded = rows.reduce((n, r) => n + r.refundedKobo, 0);
    const completed = rows.reduce((n, r) => n + r.ordersCompleted, 0);
    // Already ordered by revenue in SQL, but read the max rather than rows[0]:
    // a caller that re-sorts this list should not silently change the answer.
    const best = rows.reduce<StorePerformance | null>(
      (top, r) => (!top || r.revenueKobo > top.revenueKobo ? r : top),
      null,
    );
    return { revenue, booked, refunded, completed, best };
  }, [rows]);

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-24 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  // Nothing has been sold yet. Four zeroes and an empty chart is a worse
  // answer than saying so — zeroes read as a broken query.
  if (!rows.length || totals.completed === 0) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-4 text-sm">
        No completed orders yet. Once a store starts delivering, its takings and monthly trend
        appear here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CustomCard
          label="BEST STORE"
          value={<span className="text-content">{totals.best?.storeName ?? '—'}</span>}
          subtext={
            totals.best ? `${naira(totals.best.revenueKobo)} from ${totals.best.ordersCompleted} orders` : undefined
          }
          icon={<Trophy className="size-5 text-amber-600" />}
          iconBg="bg-amber-100"
        />
        <CustomCard
          label="RECEIVED"
          value={<span className="text-content">{naira(totals.revenue)}</span>}
          subtext="Released to you, after commission"
          icon={<Wallet className="size-5 text-green-600" />}
          iconBg="bg-green-100"
        />
        <CustomCard
          label="IN ESCROW"
          value={<span className="text-content">{naira(Math.max(0, totals.booked - totals.revenue))}</span>}
          subtext="Paid for, not released yet"
          icon={<TrendingUp className="size-5 text-blue-600" />}
          iconBg="bg-blue-100"
        />
        <CustomCard
          label="REFUNDED"
          value={<span className="text-content">{naira(totals.refunded)}</span>}
          subtext="Returned to customers"
          icon={<Undo2 className="size-5 text-red-600" />}
          iconBg="bg-red-100"
        />
      </div>

      <MonthlyTracks series={series} />

      {/* The per-store breakdown the cards summarise. A table rather than more
          cards: past two stores, cards stop being comparable. */}
      <div className="border-line/10 bg-panel overflow-x-auto rounded-xl border">
        <table className="w-full min-w-125 text-sm">
          <thead>
            <tr className="text-content-muted border-line/10 border-b text-left font-mono text-[10px] tracking-widest uppercase">
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3 text-right">Completed</th>
              <th className="px-4 py-3 text-right">Open</th>
              <th className="px-4 py-3 text-right">Refunded</th>
              <th className="px-4 py-3 text-right">Avg order</th>
              <th className="px-4 py-3 text-right">Received</th>
            </tr>
          </thead>
          <tbody className="divide-line/10 divide-y">
            {rows.map((r) => (
              <tr key={r.storefrontId}>
                <td className="text-content px-4 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    {r.storeName}
                    {r.isArchived && (
                      <Badge className="bg-ink/5 text-content-muted">Archived</Badge>
                    )}
                  </span>
                </td>
                <td className="text-content-muted px-4 py-3 text-right">{r.ordersCompleted}</td>
                <td className="text-content-muted px-4 py-3 text-right">{r.ordersActive}</td>
                <td className="text-content-muted px-4 py-3 text-right">{r.ordersRefunded}</td>
                <td className="text-content-muted px-4 py-3 text-right">{naira(r.avgOrderKobo)}</td>
                <td className="text-content px-4 py-3 text-right font-medium">
                  {naira(r.revenueKobo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Revenue per store, per month.
 *
 * BARS SCALED TO THE BUSY MONTH, NOT TO EACH STORE. Normalising each row to its
 * own maximum makes a store taking ₦4,000 look identical to one taking
 * ₦400,000, which is the exact comparison this panel exists to make.
 */
function MonthlyTracks({ series }: { series: StoreRevenuePoint[] }) {
  const { months, byStore, peak } = useMemo(() => {
    const months = [...new Set(series.map((p) => p.month))].sort();
    const byStore = new Map<string, { name: string; points: Map<string, number> }>();
    let peak = 0;
    for (const p of series) {
      if (!byStore.has(p.storefrontId)) {
        byStore.set(p.storefrontId, { name: p.storeName, points: new Map() });
      }
      byStore.get(p.storefrontId)!.points.set(p.month, p.revenueKobo);
      if (p.revenueKobo > peak) peak = p.revenueKobo;
    }
    return { months, byStore, peak };
  }, [series]);

  // Every month empty. The grid would be a row of flat lines claiming nothing
  // happened, which is true but is better said than drawn.
  if (!months.length || peak === 0) return null;

  return (
    <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
      <h3 className="text-content flex items-center gap-2 text-sm font-semibold">
        <BarChart3 className="size-4" /> Revenue by month
        <span className="text-content-muted text-xs font-normal">
          last {months.length} months · bars share one scale
        </span>
      </h3>

      <div className="flex flex-col gap-3">
        {[...byStore.entries()].map(([id, store]) => (
          <div key={id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-content truncate text-xs font-medium">{store.name}</span>
              <span className="text-content-muted text-xs">
                {naira([...store.points.values()].reduce((n, v) => n + v, 0))} total
              </span>
            </div>
            <div className="flex items-end gap-1" style={{ height: 44 }}>
              {months.map((m) => {
                const v = store.points.get(m) ?? 0;
                return (
                  <div
                    key={m}
                    // title, not a tooltip component: this is a dense grid and
                    // the exact figure is a hover away rather than a click.
                    title={`${monthLabel(m)} · ${naira(v)}`}
                    className="bg-ink/5 flex flex-1 items-end overflow-hidden rounded-sm"
                    style={{ height: '100%' }}
                  >
                    <div
                      className="bg-lime-deep/70 w-full rounded-sm"
                      // A month with revenue always draws something: a 1px
                      // sliver reads as "a little", a 0px bar reads as "none".
                      style={{ height: v > 0 ? `${Math.max(6, (v / peak) * 100)}%` : 0 }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="text-content-muted flex gap-1 text-[10px]">
        {months.map((m) => (
          <span key={m} className="flex-1 text-center">
            {monthLabel(m)}
          </span>
        ))}
      </div>
    </div>
  );
}
