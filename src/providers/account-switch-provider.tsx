/**
 * AccountSwitchProvider - changing which hat you are wearing, in one place.
 *
 * Switching roles and adding an account are the same operation from the app's
 * point of view: a server call that changes `profiles.role`, followed by
 * everything on screen becoming wrong at once. Both used to do that inline,
 * and both had the same three bugs.
 *
 * WHAT WAS WRONG
 *
 *  1. THE SWITCHER RENDERS FROM SERVER DATA. `role` and `roles` come from
 *     getDashboardProfile and arrive as props through
 *     DashboardShell -> DashboardHeader -> AccountMenu. After the server action
 *     resolved, the UI was still the PREVIOUS render - the new hat only
 *     appeared when the RSC round-trip landed, with nothing on screen saying so.
 *
 *  2. THE PROFILE QUERY CACHE WAS NEVER INVALIDATED. SessionProvider caches
 *     profiles.role with `staleTime: 5 * 60_000` and nothing anywhere called
 *     invalidateQueries on it, so `useSession().role` kept returning the OLD
 *     role for up to five minutes. That is the "it only switches on reload"
 *     symptom: a reload rebuilds the cache, and it was the only thing forcing
 *     the truth through. SessionProvider does clear the cache - but only on
 *     SIGNED_OUT or a change of user id, and a role switch is the same user, so
 *     that guard never fired.
 *
 *  3. EVERY OTHER CACHED QUERY WAS ALSO STALE. Bookings, listings, orders were
 *     all cached under the old role. After a switch you are effectively a
 *     different user with a different RLS view, holding the previous role's
 *     answers.
 *
 * HOW THIS FIXES IT
 *
 *   queryClient.clear() - blunt on purpose, and for the reason SessionProvider
 *   already gives for the sign-out path: a targeted invalidation needs a list
 *   of every role-scoped key, and forgetting one is a data leak.
 *
 *   useTransition around the navigation. `isPending` stays true until the new
 *   route's RSC payload has landed, which is exactly the window the overlay
 *   needs to cover. No effect-driven setState, no timeout guessing when
 *   navigation finished.
 *
 *   One full-screen loader for the whole operation, so the old dashboard is
 *   never visible under a new role.
 */
'use client';

import { createContext, useCallback, useContext, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { BrandLoader } from '@/components/ui/brand-loader';
import { FullScreenOverlay } from '@/components/ui/full-screen-overlay';

interface SwitchRequest {
  /** Shown under the loader, e.g. "Switching to Business…". */
  label: string;
  /** Where this role lives. Navigated to once the server call succeeds. */
  href: string;
  /** The server action - switchRole, or claimRole for a brand new hat. */
  action: () => Promise<unknown>;
}

interface AccountSwitchValue {
  /** True for the whole operation: server call, cache reset and navigation. */
  switching: boolean;
  /** Resolves when the server call is done; the overlay outlives it. */
  run: (req: SwitchRequest) => Promise<void>;
}

const AccountSwitchContext = createContext<AccountSwitchValue | null>(null);

export function AccountSwitchProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState<string | null>(null);
  // Covers the awaited server call, which useTransition does not.
  const [calling, setCalling] = useState(false);
  const [navigating, startNavigation] = useTransition();

  const run = useCallback(
    async ({ label: next, href, action }: SwitchRequest) => {
      setLabel(next);
      setCalling(true);
      try {
        await action();
      } catch (e) {
        // Nothing changed server-side, so take the overlay away and let the
        // caller show the reason.
        setCalling(false);
        setLabel(null);
        throw e;
      }
      setCalling(false);

      // The role has changed. Every cached answer was fetched as someone else.
      queryClient.clear();

      startNavigation(() => {
        // replace, not push: the old role's dashboard is not somewhere Back
        // should return to - it would render under the new role.
        //
        // ONE CALL, NOT TWO. This also called router.refresh() here, and the
        // two fought: refresh() invalidates the CURRENT route while replace()
        // navigates away from it, and the navigation lost. The switch reported
        // success, the toast fired, and the page never moved - then reloading
        // 404'd, because the URL was the old role's handle and the role it
        // derives from had just changed underneath it.
        //
        // refresh() is not needed anyway: replace() fetches a fresh RSC payload
        // for the destination, and these dashboards are dynamic (they read
        // cookies), so nothing serves them from the client router cache.
        router.replace(href);
      });
    },
    [queryClient, router],
  );

  const switching = calling || navigating;

  return (
    <AccountSwitchContext.Provider value={{ switching, run }}>
      {children}
      {/* Portalled, so an ancestor with a transform or backdrop-filter cannot
          trap it - the same trap that boxed the login loader inside the auth
          card. */}
      {switching && (
        <FullScreenOverlay>
          <BrandLoader label={label ?? 'Switching account…'} />
        </FullScreenOverlay>
      )}
    </AccountSwitchContext.Provider>
  );
}

/**
 * Returns null when no provider is mounted, so a component rendered in
 * isolation does not explode. Callers fall back to acting without the overlay.
 */
export function useAccountSwitch(): AccountSwitchValue | null {
  return useContext(AccountSwitchContext);
}
