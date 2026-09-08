'use client';

/**
 * Make the screen catch up after a server action.
 *
 * WHY `revalidatePath` WAS NOT ENOUGH, AND WHY EVERYTHING NEEDED A MANUAL
 * RELOAD.
 *   Every money and booking action ends with `revalidatePath('/user')` and
 *   friends. That is correct and it does nothing for these screens: revalidate
 *   busts the SERVER's render cache, and the wallet, the bookings list, the
 *   apartment card and the receipts are all CLIENT components reading React
 *   Query. Their caches are untouched by anything the server invalidates, so a
 *   student paid their rent, saw a success state, and then sat looking at
 *   "awaiting payment" until they reloaded the page by hand.
 *
 *   Two caches, two invalidations. This does both: the React Query keys, and
 *   `router.refresh()` for whatever server components are on screen.
 *
 * ONE COARSE SWEEP, NOT A PRECISE LIST PER CALL SITE.
 *   It is tempting to invalidate exactly what changed. In practice one action
 *   moves several of these at once - paying rent changes the booking, the
 *   wallet balance, the ledger, the escrow card, the receipts list and the
 *   notification bell - and the failure mode of being too precise is a stale
 *   number on a screen nobody thought to list, which is the bug this exists to
 *   fix. React Query refetches only what is actually mounted, so the cost of
 *   the extra keys is close to nothing.
 *
 * AWAIT IT IF THE NEXT THING YOU DO DEPENDS ON FRESH DATA. It resolves once the
 * active queries have refetched, so `await refresh()` before navigating away
 * means the destination does not paint the old values first.
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from './keys';

/** The families any money or booking action can move. */
const AFFECTED = [
  qk.bookings.all,
  qk.wallet.all,
  qk.hostels.all,
  qk.notifications.all,
  qk.unreadCounts.all,
] as const;

export function useActionRefresh() {
  const qc = useQueryClient();
  const router = useRouter();

  return useCallback(async () => {
    await Promise.all(AFFECTED.map((key) => qc.invalidateQueries({ queryKey: key })));
    // Server components on the same screen - the dashboard shell, the landlord
    // pages - still need their own nudge. Cheap, and a no-op where there are
    // none.
    router.refresh();
  }, [qc, router]);
}
