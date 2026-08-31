/**
 * ROUTE: /landlord/tenants
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
import { Users } from 'lucide-react';

import { ComingSoon } from '@/components/shared/coming-soon';

export const metadata: Metadata = { title: 'Tenants' };

export default function Page() {
  return <ComingSoon title="Tenants" tagline="Who is in which room, and until when." icon={Users} note="Needs the bookings module to expose per-room occupancy." />;
}
