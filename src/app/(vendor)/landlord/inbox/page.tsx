/**
 * ROUTE: /landlord/inbox
 * ACCESS: landlord (gated in proxy.ts)
 * STATUS: Coming soon.
 *
 * This route exists because config/dashboard-nav lists it, and the sidebar
 * therefore links to it. Before this file the link 404'd - the nav promised a
 * page that had never been built. The codebase's own rule applies: a nav entry
 * that 404s is worse than one that says "not yet".
 *
 * Replace <ComingSoon /> with the real screen when the module is built.
 */
import type { Metadata } from 'next';
import { Inbox } from 'lucide-react';

import { ComingSoon } from '@/components/shared/coming-soon';

export const metadata: Metadata = { title: 'Inbox' };

export default function Page() {
  return <ComingSoon title="Inbox" tagline="Messages from students about your properties." icon={Inbox} note="The messaging module is live; this view reuses it." />;
}
