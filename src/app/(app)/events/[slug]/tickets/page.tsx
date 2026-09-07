/**
 * ROUTE: /events/[slug]/tickets
 * ACCESS: public to browse; signing in is required to buy.
 * PURPOSE: Pick ticket tiers and quantities for an event.
 */
import type { Metadata } from 'next';
import { TicketsPicker } from './(components)/tickets-picker';

export const metadata: Metadata = { title: 'Tickets' };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TicketsPicker slug={slug} />;
}
