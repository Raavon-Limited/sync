/**
 * ROUTE: /landlord/earnings
 * ACCESS: landlord (gated in proxy.ts)
 * PURPOSE: What has come in, what is still held, and where it gets paid out to.
 *
 * WAS A COMING-SOON PLACEHOLDER, then a screen full of invented figures. The
 * layout came from the landlord branch, which hardcoded a balance of ₦470,000,
 * eight months of earnings and four transactions with tenants' names on them.
 * The numbers are now the wallet ledger's.
 *
 * THE LEDGER IS THE SOURCE, NOT THE BOOKINGS
 *   A confirmed booking is a promise; a wallet entry is money that moved.
 *   Reading bookings for the balance would flatter it, and the figure here has
 *   to be the same one the payout screen will pay against. The statement rows
 *   join the two: the ledger says how much, the booking says who and where.
 *
 * A SERVER COMPONENT, because every figure on it is a read the browser has no
 * business making   the wallet is RLS-scoped to its owner and nothing here is
 * interactive until the payout button.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Wallet, TrendingUp, Clock3 } from 'lucide-react';
import { Card, CardHeader, CardDescription, CardContent } from '@/components/ui';
import { getCurrentUser } from '@/modules/auth/queries';
import { PageHeader } from '../(components)/shared/page-header';
import { EarningsChart } from '../(components)/earnings/earnings-chart';
import { TransactionsTable } from '../(components)/earnings/transactions-table';
import { PayoutCard, RequestPayoutButton } from '../(components)/earnings/payout-card';
import { getLandlordEarnings } from '../(components)/landlord-queries';
import { formatNaira } from '../(components)/landlord-types';

export const metadata: Metadata = { title: 'Earnings' };

// Money that moved a minute ago has to show a minute ago.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/landlord/earnings');

  const earnings = await getLandlordEarnings(user.id);
  const yearToDate = earnings.monthly.reduce((sum, m) => sum + m.amount, 0);

  const summary = [
    { label: 'Available balance', value: formatNaira(earnings.available), icon: Wallet },
    { label: 'Held in escrow', value: formatNaira(earnings.pending), icon: Clock3 },
    { label: 'Earned in the last year', value: formatNaira(yearToDate), icon: TrendingUp },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Earnings & Payouts"
        description="Track rent income and manage how you get paid."
      >
        <RequestPayoutButton balance={earnings.available} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        {summary.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardDescription>{s.label}</CardDescription>
              <s.icon className="text-content-muted size-4" />
            </CardHeader>
            <CardContent>
              <p className="font-display text-card font-bold tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <EarningsChart monthly={earnings.monthly} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <TransactionsTable transactions={earnings.transactions} />
        {/* No payout account is stored yet, so the card offers to add one
            rather than displaying a bank nobody entered. */}
        <PayoutCard payoutMethod={null} pendingPayout={earnings.pending} />
      </div>
    </div>
  );
}
