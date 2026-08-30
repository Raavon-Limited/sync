/**
 * ROUTE: /laundry
 * ACCESS: authenticated student
 * PURPOSE: Laundry vendor list + pickup scheduler. Pick a vendor, choose pickup/dropoff times, pay on completion (escrow).
 * STATUS: Coming soon. The route exists because /laundry is in the module
 *         registry and therefore in the nav - a nav entry that 404s is worse
 *         than one that says "not yet". Replace <ComingSoon /> with the real
 *         screen when the module is built.
 */
import type { Metadata } from 'next';

import { ComingSoon } from '@/components/shared/coming-soon';
import { getModule } from '@/config/modules';

export const metadata: Metadata = { title: 'Laundry' };

export default function Page() {
  // Registry is the single source of truth for label + tagline + icon.
  const mod = getModule('laundry')!;

  return <ComingSoon title={mod.label} tagline={mod.tagline} iconName={mod.iconName} />;
}
