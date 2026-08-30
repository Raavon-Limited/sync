/**
 * ROUTE: /me/tickets
 * ACCESS: authenticated student
 * PURPOSE: The student's event tickets - valid, used and refunded.
 */
import type { Metadata } from 'next';
import { TicketsList } from './(components)/tickets-list';

export const metadata: Metadata = { title: 'Tickets' };

export default function Page() {
  return <TicketsList />;
}
