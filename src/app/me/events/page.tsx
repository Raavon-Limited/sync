/**
 * ROUTE: /me/events
 * ACCESS: authenticated student
 * PURPOSE: Events the student holds tickets for, split by upcoming and past.
 */
import type { Metadata } from 'next';
import { EventsList } from './(components)/events-list';

export const metadata: Metadata = { title: 'Events' };

export default function Page() {
  return <EventsList />;
}
