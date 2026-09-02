/**
 * ROUTE: /me/insights
 * ACCESS: authenticated student
 * PURPOSE: Spending analytics across every source a student can spend through  
 *          food orders, hostel payments, service requests and event tickets.
 */
import type { Metadata } from 'next';
import { InsightsPanel } from './(components)/insights-panel';

export const metadata: Metadata = { title: 'Insights' };

export default function Page() {
  return <InsightsPanel />;
}
