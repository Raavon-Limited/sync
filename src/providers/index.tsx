/**
 * Root `<Providers>` - the one place client providers are mounted. Chains:
 *
 *   ReduxProvider             (cart + wizard + ui state + RTK Query cache)
 *     → QueryProvider         (TanStack Query cache for all server data)
 *       → SessionProvider     (who is signed in; clears the cache on auth change)
 *         → TooltipProvider   (Radix tooltip context)
 *           → LocationProvider (the area/near-me scope, shared app-wide)
 *             → children
 *             → Toaster       (sonner; renders at the end so it overlays)
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
 * LocationProvider sits INNERMOST, wrapping children and the Toaster. It is at
 * the root at all (rather than in a route layout) so one area selection scopes
 * every route and survives navigating between shells. Being inside Query and
 * Session means a future scoped query can read the area and refetch on it.
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
import { LocationProvider } from './location-provider';
import { AccountSwitchProvider } from './account-switch-provider';
import type { User } from '@supabase/supabase-js';
import type { Area } from '@/lib/constants/areas';

export function Providers({
  children,
  areas,
  user,
}: {
  children: React.ReactNode;
  /** Service areas, fetched once in the root layout. */
  areas?: Area[];
  /**
   * The signed-in user, already resolved on the server by the root layout.
   *
   * THREADING THIS IS NOT AN OPTIMISATION, IT IS THE FIX FOR A REAL BUG.
   * Without it SessionProvider starts at `user: null` on every single page
   * load and only learns otherwise after a `getUser()` round trip. Anything
   * that renders off `isAuthenticated` therefore paints its SIGNED-OUT state
   * first   which is why a signed-in student was shown "Sign in to request a
   * room" on a hostel they were looking at while their own avatar sat in the
   * header two inches above it.
   *
   * The header was right because it is server-rendered. The button was wrong
   * because it was not. The layout has had this value all along and was
   * already using it for InstallGate; it just never reached the provider whose
   * prop exists to receive it.
   */
  user?: User | null;
}) {
  return (
    <ReduxProvider>
      <QueryProvider>
        <SessionProvider initialUser={user ?? null}>
          <TooltipProvider delayDuration={150}>
            <LocationProvider areas={areas}>
              {/* Inside QueryProvider because switching roles clears the whole
                  query cache, and inside everything else so its overlay covers
                  the app. */}
              <AccountSwitchProvider>
                {children}
                <Toaster />
              </AccountSwitchProvider>
            </LocationProvider>
          </TooltipProvider>
        </SessionProvider>
      </QueryProvider>
    </ReduxProvider>
  );
}
