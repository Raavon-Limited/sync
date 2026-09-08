/**
 * ROUTE: /user/receipts
 * ACCESS: authenticated student
 * PURPOSE: Every receipt and invoice for money this person has paid or received.
 *
 * WHY IT IS ITS OWN ROUTE AND NOT A TAB ON THE WALLET
 *   The wallet answers "what have I got". This answers "what can I show
 *   somebody" - a landlord, a parent paying the rent, a bank. Those get looked
 *   for at different times, and a document is worth a URL you can send.
 */
import type { Metadata } from 'next';
import { ReceiptsClient } from './receipts-client';

export const metadata: Metadata = { title: 'Receipts & invoices' };

export default function Page() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-content-muted font-mono text-sm tracking-wide">/ME/RECEIPTS</h1>
      <h2 className="font-display text-content mt-2 text-3xl font-medium">
        Receipts &amp; <span className="text-lime">invoices</span>
      </h2>
      <ReceiptsClient />
    </section>
  );
}
