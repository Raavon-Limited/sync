/**
 * Every order a store has taken, filtered by what happened to it.
 *
 * THE TABS ARE FILTERS, NOT A PARTITION   do not add them up. `cancel_order`
 * refunds in the same transaction, so a cancelled order is usually also a
 * refunded one and appears under both. Forcing them apart would mean hiding
 * cancellations from Cancelled or refunds from Refunded; an honest overlap
 * beats either.
 *
 * "REFUNDED" IS WHAT THE PRODUCT MEANS BY "RETURNED". There is no returns
 * concept in this schema   no goods come back, no restock happens. What exists
 * is money going back (`escrow_holds.status = 'refunded'`), so the tab is
 * named for the thing that is real.
 *
 * TWO MONEY COLUMNS, DELIBERATELY. "Paid" is what the customer was charged;
 * "You get" is released escrow net of the platform's commission, and it is 0
 * until the hold releases. One column would have to pick, and either choice
 * misleads: the gross overstates every row, and the net makes a delivered
 * order look free while it is still in escrow.
 */
'use client';

import { useState } from 'react';
import { Receipt, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { useStoreTransactions } from '@/modules/storefronts/hooks';
import {
  TRANSACTION_BUCKETS,
  type StoreTransaction,
  type TransactionBucket,
} from '@/modules/storefronts/types';

const PAGE = 20;

function naira(kobo: number) {
  return `₦${Math.round(kobo / 100).toLocaleString()}`;
}

/** The badge a person reads, not the enum a database stores. */
function statusOf(t: StoreTransaction): { label: string; className: string } {
  if (t.isRefunded) return { label: 'Refunded', className: 'bg-red-500/10 text-red-600' };
  switch (t.status) {
    case 'delivered':
      return { label: 'Completed', className: 'bg-lime/15 text-accent-fg' };
    case 'cancelled':
      return { label: 'Cancelled', className: 'bg-ink/5 text-content-muted' };
    case 'pending':
      return { label: 'New', className: 'bg-amber-500/10 text-amber-600' };
    case 'preparing':
      return { label: 'Preparing', className: 'bg-amber-500/10 text-amber-600' };
    case 'picked_up':
    case 'on_the_way':
      return { label: 'On the way', className: 'bg-blue-500/10 text-blue-600' };
    default:
      return { label: t.status, className: 'bg-ink/5 text-content-muted' };
  }
}

export function StoreTransactions({
  storefrontId,
  storeName,
}: {
  /** null = every store the caller can see. */
  storefrontId?: string | null;
  storeName?: string | null;
}) {
  const [bucket, setBucket] = useState<TransactionBucket>('all');
  const [page, setPage] = useState(0);

  const { data, isLoading, isFetching } = useStoreTransactions({
    storefrontId,
    bucket,
    limit: PAGE,
    offset: page * PAGE,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE) - 1);

  // Changing the filter has to reset the page. Landing on page 4 of a tab with
  // one page shows an empty table and a pager that says there is nothing  
  // indistinguishable from having no orders at all.
  const pick = (next: TransactionBucket) => {
    setBucket(next);
    setPage(0);
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-content flex flex-wrap items-center gap-2 text-lg font-semibold">
        <Receipt className="size-4" /> Transactions
        {storeName && (
          <span className="text-content-muted text-sm font-normal">at {storeName}</span>
        )}
      </h2>

      <div className="flex flex-wrap items-center gap-1" role="tablist">
        {TRANSACTION_BUCKETS.map((b) => (
          <button
            key={b.value}
            type="button"
            role="tab"
            aria-selected={bucket === b.value}
            onClick={() => pick(b.value)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              bucket === b.value
                ? 'bg-lime text-ink font-medium'
                : 'border-line/10 text-content-muted hover:border-line/25 hover:text-content border'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="bg-ink/5 h-40 animate-pulse rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
          {bucket === 'all'
            ? 'No orders here yet.'
            : `No ${TRANSACTION_BUCKETS.find((b) => b.value === bucket)?.label.toLowerCase()} orders.`}
        </p>
      ) : (
        <div
          className={`border-line/10 bg-panel overflow-x-auto rounded-xl border transition-opacity ${
            // Dimmed rather than replaced while the next page loads   see the
            // keepPreviousData note on the hook.
            isFetching ? 'opacity-60' : ''
          }`}
        >
          <table className="w-full min-w-150 text-sm">
            <thead>
              <tr className="text-content-muted border-line/10 border-b text-left font-mono text-[10px] tracking-widest uppercase">
                <th className="px-4 py-3">Order</th>
                {!storefrontId && <th className="px-4 py-3">Store</th>}
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">You get</th>
                <th className="px-4 py-3 text-right">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-line/10 divide-y">
              {rows.map((t) => {
                const s = statusOf(t);
                return (
                  <tr key={t.orderId}>
                    <td className="text-content-muted px-4 py-3 font-mono text-xs">
                      #{t.orderId.slice(0, 8)}
                      <span className="text-content-muted block text-[10px]">
                        {t.itemCount} item{t.itemCount === 1 ? '' : 's'}
                      </span>
                    </td>
                    {!storefrontId && (
                      <td className="text-content-muted px-4 py-3">{t.storeName}</td>
                    )}
                    <td className="text-content px-4 py-3">{t.studentName}</td>
                    <td className="px-4 py-3">
                      <Badge className={s.className}>{s.label}</Badge>
                    </td>
                    <td className="text-content-muted px-4 py-3 text-right">
                      {naira(t.totalKobo)}
                    </td>
                    <td className="text-content px-4 py-3 text-right font-medium">
                      {t.netKobo > 0 ? (
                        naira(t.netKobo)
                      ) : (
                        // An em-dash, not ₦0: nothing has been released yet,
                        // which is not the same as the order being worth zero.
                        <span className="text-content-muted" title="Not released from escrow yet">
                           
                        </span>
                      )}
                    </td>
                    <td className="text-content-muted px-4 py-3 text-right whitespace-nowrap">
                      {new Date(t.placedAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-content-muted text-xs">
            {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="gap-1"
            >
              <ChevronLeft className="size-3" /> Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              className="gap-1"
            >
              Next <ChevronRight className="size-3" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
