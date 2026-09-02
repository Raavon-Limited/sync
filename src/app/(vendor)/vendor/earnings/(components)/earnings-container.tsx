/**
 * Live container for /vendor/earnings.
 *
 * `EarningsPage` is presentation-only and takes an `EarningsData` prop, so this
 * assembles that shape from the backend and leaves the 530-line component
 * alone.
 *
 * WHERE EACH NUMBER COMES FROM
 *   availableBalance  wallets.balance_kobo - the ledger-derived cache
 *   pendingBalance    escrow still held, i.e. earned but not yet released
 *   lifetime/withdrawn/totalPayouts   the vendor_earnings_summary RPC
 *   monthly/weekly    bucketed from delivered orders, sharing the exact helpers
 *                     the dashboard uses so the two screens cannot disagree
 *   transactions      the wallet_transactions view over the ledger
 *
 * Deliberately NOT invented: `nextPayoutDate` is derived from the earliest
 * escrow release rather than a made-up schedule, because no payout cron exists
 * yet. If nothing is held, it says so instead of printing a date that means
 * nothing.
 */
'use client';

import * as React from 'react';
import EarningsPage from './EarningsPage';
import type { EarningsData, Transaction } from './types';
import {
  useWallet,
  useEarningsSummary,
  useBankAccounts,
  useWalletTransactions,
  useEscrowHolds,
} from '@/modules/payments/hooks';
import { useVendorOrders, useMyListings } from '@/modules/vendor/hooks';
import { bucketMonths, bucketWeeks } from '@/modules/vendor/dashboard';
import { koboToNaira } from '@/lib/query/helpers';
import type { LedgerKind, WalletTransaction } from '@/modules/payments/types';

/** Ledger kinds collapse to the three the statement table renders. */
function txnType(kind: LedgerKind): Transaction['type'] {
  if (kind === 'payout' || kind === 'wallet_withdrawal') return 'withdrawal';
  if (kind === 'order_refund') return 'refund';
  return 'order';
}

function toTransaction(t: WalletTransaction): Transaction {
  return {
    id: String(t.id),
    description: t.narrative,
    type: txnType(t.kind),
    date: new Date(t.createdAt).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    amount: koboToNaira(t.amountKobo),
    // A ledger entry only exists once the money has actually moved, so anything
    // in this list is settled by definition. Pending money lives in escrow and
    // is reported separately as `pendingBalance`.
    status: 'Settled',
  };
}

export function EarningsContainer() {
  const { data: wallet } = useWallet();
  const { data: summary } = useEarningsSummary();
  const { data: banks = [] } = useBankAccounts();
  const { data: txns = [] } = useWalletTransactions({ pageSize: 100 });
  const { data: held = [] } = useEscrowHolds('held');
  const { data: orders = [] } = useVendorOrders({ pageSize: 200 });
  const { data: listings = [] } = useMyListings();

  const data: EarningsData = React.useMemo(() => {
    const now = new Date();
    const monthly = bucketMonths(orders, now, 12);

    // Growth against the previous month. Guarded, because a vendor's first
    // month divides by zero and "Infinity%" is not a growth figure.
    const thisMonth = monthly[monthly.length - 1]?.revenue ?? 0;
    const lastMonth = monthly[monthly.length - 2]?.revenue ?? 0;
    const growthPct =
      lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;

    const defaultBank = banks.find((b) => b.isDefault) ?? banks[0];

    // Earliest escrow release is the soonest money can actually arrive.
    const nextRelease = held
      .map((h) => h.releaseAfter)
      .filter((d): d is string => !!d)
      .sort()[0];

    return {
      availableBalance: koboToNaira(wallet?.balanceKobo ?? 0),
      pendingBalance: koboToNaira(summary?.pendingKobo ?? 0),
      lifetimeEarnings: koboToNaira(summary?.lifetimeKobo ?? 0),
      totalWithdrawn: koboToNaira(summary?.withdrawnKobo ?? 0),
      lifetimeGrowthPct: growthPct,
      totalPayouts: summary?.totalPayouts ?? 0,

      bankName: defaultBank?.bankName ?? 'No account added',
      accountNumber: defaultBank?.accountNumber ?? ' ',
      accountHolderName: defaultBank?.accountName ?? ' ',

      nextPayoutDate: nextRelease
        ? new Date(nextRelease).toLocaleDateString('en-NG', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'Nothing pending',

      monthlyRevenue: monthly.map((b) => ({ label: b.week, revenue: b.revenue })),
      weeklyRevenue: bucketWeeks(orders, now, 8).map((b) => ({
        label: b.week,
        revenue: b.revenue,
      })),

      // Ranked by revenue, not units - the same rule as the dashboard chart.
      topProducts: [...listings]
        .map((l) => ({ name: l.name, revenue: koboToNaira(l.priceKobo * l.sold) }))
        .filter((p) => p.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),

      transactions: txns.map(toTransaction),
    };
  }, [wallet, summary, banks, txns, held, orders, listings]);

  return <EarningsPage data={data} />;
}
