/**
 * ROUTE: /events/[slug]/tickets/contact
 * ACCESS: authenticated student
 * PURPOSE: Confirm the ticket selection and buy from wallet balance.
 *
 * There is no separate /payment step: tickets are paid from the wallet, so
 * confirming here completes the purchase.
 */
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { TicketCheckout } from './(components)/ticket-checkout';

export const metadata: Metadata = { title: 'Confirm tickets' };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    // useSearchParams needs a Suspense boundary during prerender.
    <Suspense fallback={<div className="bg-ink/5 mx-auto mt-8 h-64 max-w-2xl animate-pulse rounded-2xl" />}>
      <TicketCheckout slug={slug} />
    </Suspense>
  );
}
