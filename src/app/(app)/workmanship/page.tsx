/**
 * ROUTE: /workmanship
 * ACCESS: authenticated student
 * PURPOSE: Verified artisans - plumbers, electricians, carpenters. Browse and raise a job request.
 * STATUS: Coming soon. The route exists because /workmanship is in the module
 *         registry and therefore in the nav - a nav entry that 404s is worse
 *         than one that says "not yet". Replace <ComingSoon /> with the real
 *         screen when the module is built.
 */
import type { Metadata } from 'next';

import { ComingSoon } from '@/components/shared/coming-soon';
import { getModule } from '@/config/modules';

export const metadata: Metadata = { title: 'Workmanship' };

export default function Page() {
  // Registry is the single source of truth for label + tagline + icon.
  const mod = getModule('workmanship')!;

  return <ComingSoon title={mod.label} tagline={mod.tagline} iconName={mod.iconName} />;
}
