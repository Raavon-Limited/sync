/**
 * Root `<Providers>` - the one place client providers are mounted. Chains:
 *
 *   ReduxProvider           (cart + wizard + ui state + RTK Query cache)
 *     → QueryProvider       (TanStack Query cache for all server data)
 *       → SessionProvider   (who is signed in; clears the cache on auth change)
 *         → TooltipProvider (Radix tooltip context)
 *           → children
 *           → Toaster       (sonner; renders at the end so it overlays)
 *
 * RTK Query needs no provider of its own - its cache lives in the Redux store,
 * so being inside ReduxProvider is enough.
 *
 * QueryProvider sits INSIDE ReduxProvider so a TanStack mutation can dispatch a
 * Redux action (clearing the cart slice after checkout, say) without reaching
 * for a store it is not under. The reverse order would make that impossible.
 *
 * SessionProvider sits INSIDE QueryProvider because it calls `useQueryClient()`
 * to clear the cache when the signed-in user changes, and reads the profile
 * through `useQuery`. Putting it outside would break both.
 *
 * Mount once in the root layout. Anything that needs to run on the client
 * (Redux/RTK Query hooks, useQuery, useTooltip, toast()) requires being inside
 * this.
 */
'use client';

import { TooltipProvider } from '@radix-ui/react-tooltip';
import { Toaster } from '@/components/ui/toast';
import { ReduxProvider } from './redux-provider';
import { QueryProvider } from './query-provider';
import { SessionProvider } from './session-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ReduxProvider>
      <QueryProvider>
        <SessionProvider>
          <TooltipProvider delayDuration={150}>
            {children}
            <Toaster />
          </TooltipProvider>
        </SessionProvider>
      </QueryProvider>
    </ReduxProvider>
  );
}
