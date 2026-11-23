/**
 * Which campus the visitor is looking at - a SEPARATE choice from the area.
 *
 * WHY THIS IS NOT IN LocationProvider
 *   The provider scopes the app to an AREA inside the one market Sync runs in
 *   (KWASU Gate, Safari, Malete Town...), and its whole contract is "never
 *   invent a location". A campus is a different question: someone in Lagos can
 *   browse KWASU before they have even been admitted, and someone at UNIEKITI
 *   should be told plainly that Sync is not there yet. Folding that into the
 *   provider would have made "outside the market" mean two things.
 *
 * DETECTION NEVER OVERWRITES A CHOICE
 *   The stored id is the visitor's own pick and nothing else writes it - not a
 *   GPS fix, not a page load. That was the failure the design review called
 *   out: a student in Lagos looking at Malete should not be flipped back to
 *   "near me" by their phone. The default (first serviced campus) is computed,
 *   not stored, so it never masquerades as a choice either.
 *
 * Same external-store pattern as LocationProvider's area, for the same reason:
 * no setState-in-effect, no one-frame flash of the wrong campus on hydration.
 */
'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useCampuses, type Campus } from '@/modules/campuses';

const KEY = 'sync:campus';
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}
function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function write(id: string | null) {
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked - the choice just won't outlive the tab */
  }
  listeners.forEach((l) => l());
}

export interface CampusChoice {
  /** Every selectable campus, serviced first. Empty while loading. */
  campuses: Campus[];
  /** The campus being viewed. Null only before the list has loaded. */
  campus: Campus | null;
  /** True when the visitor picked it, false when it is the default. */
  picked: boolean;
  /** False for a campus Sync does not run at yet - drives the coming-soon notice. */
  live: boolean;
  setCampus: (id: string | null) => void;
  loading: boolean;
}

export function useCampusChoice(): CampusChoice {
  const { data, isLoading } = useCampuses();
  const campuses = useMemo(() => data ?? [], [data]);
  const stored = useSyncExternalStore(subscribe, read, () => null);

  // Validated on read: a campus can be deactivated, and a stale id must fall
  // back to the default rather than render a campus that no longer exists.
  const chosen = stored ? campuses.find((c) => c.id === stored) ?? null : null;
  const fallback = campuses.find((c) => c.isServiced) ?? campuses[0] ?? null;
  const campus = chosen ?? fallback;

  const setCampus = useCallback((id: string | null) => write(id), []);

  return {
    campuses,
    campus,
    picked: Boolean(chosen),
    // While the list is loading there is no campus to judge, and showing a
    // "we are not here yet" flash to every first visitor would be wrong.
    live: campus ? campus.isServiced : true,
    setCampus,
    loading: isLoading,
  };
}
