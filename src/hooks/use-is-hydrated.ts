/**
 * useIsHydrated - false on the server and during the hydration render, true
 * afterwards. Built on useSyncExternalStore so there's no setState-in-effect.
 *
 * Use it to gate anything driven by persisted (localStorage) state. zustand's
 * persist middleware reads localStorage synchronously, so without this guard
 * the first client render disagrees with the server HTML and React throws a
 * hydration mismatch.
 */
'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
