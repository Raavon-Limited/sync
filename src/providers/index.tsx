/**
 * Root `<Providers>` - the one place client providers are mounted. Chains:
 *
 *   ReduxProvider         (cart + wizard + ui state + RTK Query cache)
 *     → TooltipProvider   (Radix tooltip context)
 *       → children
 *       → Toaster         (sonner; renders at the end so it overlays)
 *
 * RTK Query needs no provider of its own - its cache lives in the Redux store,
 * so being inside ReduxProvider is enough.
 *
 * Mount once in the root layout. Anything that needs to run on the client
 * (Redux/RTK Query hooks, useTooltip, toast()) requires being inside this.
 */
'use client';

import { TooltipProvider } from '@radix-ui/react-tooltip';
import { Toaster } from '@/components/ui/toast';
import { ReduxProvider } from './redux-provider';
import { LocationProvider } from './location-provider';
import type { Area } from '@/lib/constants/areas';

export function Providers({
  children,
  areas,
}: {
  children: React.ReactNode;
  /** Service areas, fetched once in the root layout. */
  areas?: Area[];
}) {
  return (
    <ReduxProvider>
      <TooltipProvider delayDuration={150}>
        {/* Location sits at the root so one selection scopes every route and
            survives navigating between shells. Mounted inside Redux so a future
            slice can read it, and outside Toaster so toasts aren't re-rendered
            by an area change. */}
        <LocationProvider areas={areas}>
          {children}
          <Toaster />
        </LocationProvider>
      </TooltipProvider>
    </ReduxProvider>
  );
}
