/**
 * The revenue tracker: what was earned, where from, and the lines behind it.
 *
 * EVERY TOTAL IS INTERROGABLE
 *   A figure nobody can drill into is a figure nobody trusts, and finance
 *   questions always end in "which transactions?". The breakdown names the kind
 *   of charge, and the list underneath is the actual ledger lines - so the
 *   number at the top can be argued with rather than believed.
 *
 * CHARGED AND RETURNED ARE SHOWN SEPARATELY
 *   The headline is net, because net is what Sync kept. But a month of
 *   ₦400,000 charged and ₦90,000 handed back is a different month from
 *   ₦310,000 charged and nothing returned, and only one of them is worth
 *   asking about. Netting them away hides the question.
 *
 * NO CHART LIBRARY. The monthly series is a bar per month drawn with divs: it
 * is one series of at most twelve values, and the dependency would be larger
 * than the feature.
 */
'use client';

import { ArrowDownLeft, ArrowUpRight, Scale, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface RevenueData {
  from: string;
  to: string;
  earned_kobo: number;
  charged_kobo: number;
  returned_kobo: number;
  line_count: number;
  balance_kobo: number;
  by_kind: { kind: string; amount_kobo: number; count: number }[];
  monthly: { month: string; amount_kobo: number }[];
  recent: { kind: string; narrative: string; amount_kobo: number; at: string }[];
}

const naira = (kobo: number) =>
  `₦${Math.round(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

/**
 * What each ledger kind means in the words somebody asking about money uses.
 * The database's vocabulary is right for the database and opaque on a screen:
 * "escrow_release" is where nearly all of it comes from and says nothing.
 */
const KIND_LABEL: Record<string, string> = {
  escrow_release: 'Commission on completed orders',
  order_payment: 'Commission taken at payment',
  order_refund: 'Commission returned on refunds',
  subscription_charge: 'Vendor plan subscriptions',
  ticket_purchase: 'Event ticket fees',
  commission: 'Commission',
  delivery_fee: 'Delivery fees',
  payout: 'Payouts',
  adjustment: 'Manual adjustments',
};

export function RevenuePanel({ data }: { data: RevenueData }) {
  const peak = Math.max(1, ...data.monthly.map((m) => Math.abs(m.amount_kobo)));

  const cards = [
    { label: 'Earned, net', value: naira(data.earned_kobo), icon: Wallet, tone: 'text-lime-deep' },
    {
      label: 'Charged',
      value: naira(data.charged_kobo),
      icon: ArrowUpRight,
      tone: 'text-emerald-600',
    },
    {
      label: 'Returned',
      value: naira(data.returned_kobo),
      icon: ArrowDownLeft,
      tone: 'text-coral',
    },
    // The all-time balance, not the window's. A balance for a date range is not
    // a balance, and this is the figure that has to agree with the books.
    { label: 'Account balance', value: naira(data.balance_kobo), icon: Scale, tone: 'text-content' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="border-line/15 bg-panel flex flex-col gap-2 rounded-xl border p-4">
            <p className="text-content-muted flex items-center gap-1.5 text-[11px] font-semibold tracking-widest uppercase">
              <c.icon className="size-3.5" /> {c.label}
            </p>
            <p className={cn('font-display text-2xl font-bold tabular-nums', c.tone)}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* ── Month by month ── */}
        <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
          <p className="text-content text-sm font-medium">Month by month</p>
          {data.monthly.length === 0 ? (
            <p className="text-content-muted text-sm">Nothing earned in this window yet.</p>
          ) : (
            <div className="flex items-end gap-2" style={{ height: 160 }}>
              {data.monthly.map((m) => (
                <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <span className="text-content-muted text-[10px] tabular-nums">
                    {m.amount_kobo === 0 ? '' : naira(m.amount_kobo)}
                  </span>
                  <div
                    className={cn(
                      'w-full rounded-t',
                      m.amount_kobo < 0 ? 'bg-coral/60' : 'bg-lime',
                    )}
                    style={{
                      height: `${Math.max(2, (Math.abs(m.amount_kobo) / peak) * 110)}px`,
                    }}
                    title={`${m.month}: ${naira(m.amount_kobo)}`}
                  />
                  <span className="text-content-muted truncate text-[10px]">
                    {m.month.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Where it came from ── */}
        <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
          <p className="text-content text-sm font-medium">Where it came from</p>
          {data.by_kind.length === 0 ? (
            <p className="text-content-muted text-sm">No charges in this window.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.by_kind.map((k) => (
                <li key={k.kind} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="text-content block text-sm">
                      {KIND_LABEL[k.kind] ?? k.kind.replace(/_/g, ' ')}
                    </span>
                    <span className="text-content-muted text-xs">
                      {k.count} {k.count === 1 ? 'line' : 'lines'}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-semibold tabular-nums',
                      k.amount_kobo < 0 ? 'text-coral' : 'text-content',
                    )}
                  >
                    {naira(k.amount_kobo)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── The lines themselves ── */}
      <div className="flex flex-col gap-2">
        <span className="text-content-muted text-[11px] tracking-wide uppercase">
          Most recent charges
        </span>
        {data.recent.length === 0 ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
            Nothing on the platform revenue account yet.
          </p>
        ) : (
          <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
            {data.recent.map((r, i) => (
              <div key={`${r.at}-${i}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-content truncate text-sm">{r.narrative}</p>
                  <p className="text-content-muted text-xs">
                    {new Date(r.at).toLocaleString('en-NG', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <Badge className="bg-ink/5 text-content-muted">
                  {KIND_LABEL[r.kind] ?? r.kind.replace(/_/g, ' ')}
                </Badge>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    r.amount_kobo < 0 ? 'text-coral' : 'text-content',
                  )}
                >
                  {naira(r.amount_kobo)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
