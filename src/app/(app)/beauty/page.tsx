/**
 * ROUTE: /beauty
 * ACCESS: authenticated student
 * PURPOSE: Beauty vendor directory - stylists, nails, barbers. Browse, view a profile, book a slot.
 * STATUS: Coming soon. The route exists because /beauty is in the module
 *         registry and therefore in the nav - a nav entry that 404s is worse
 *         than one that says "not yet". Replace <ComingSoon /> with the real
 *         screen when the module is built.
 */
import type { Metadata } from 'next';

import { ComingSoon } from '@/components/shared/coming-soon';
import { getModule } from '@/config/modules';

export const metadata: Metadata = { title: 'Beauty' };

export default function Page() {
  // Registry is the single source of truth for label + tagline + icon.
  const mod = getModule('beauty')!;

  return <ComingSoon title={mod.label} tagline={mod.tagline} iconName={mod.iconName} />;
}
