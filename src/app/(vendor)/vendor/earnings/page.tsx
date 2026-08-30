/**
 * ROUTE: /vendor/earnings
 * ACCESS: authenticated vendor
 * PURPOSE: Earnings dashboard - payouts, pending escrow, Paystack settlement timeline, downloadable statements.
 * BUILT HERE: KPI cards, earnings chart, transaction list, statement download.
 *
 * The container is a client island: balances come from the ledger-derived
 * wallet, revenue is bucketed from delivered orders using the same helpers the
 * vendor dashboard uses, and the statement reads the wallet_transactions view.
 */
import type { Metadata } from 'next';
import { EarningsContainer } from './(components)/earnings-container';

export const metadata: Metadata = { title: 'Earnings' };

export default function Page() {
  return (
    <section className="flex flex-col gap-3">
      <EarningsContainer />
    </section>
  );
}
