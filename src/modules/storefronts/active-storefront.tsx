/**
 * Which branch the vendor is currently working.
 *
 * WHY THIS IS CONTEXT AND NOT A URL PARAM
 *   The vendor dashboard is a set of sibling routes — orders, listings,
 *   earnings — and the branch selection has to survive moving between them.
 *   Threading `?storefront=` through every link means one missed link silently
 *   drops the vendor back to a different branch mid-task, which is exactly the
 *   kind of bug that shows up as "it deleted the wrong item".
 *
 * WHY IT PERSISTS
 *   A vendor working the Tanke queue who refreshes should still be on Tanke.
 *   The stored id is validated against what they can actually manage on every
 *   load — a revoked manager, or a branch that was archived, must not resume
 *   into a branch they can no longer act on.
 */
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useManagedStorefronts } from './hooks';
import type { ManagedStorefront } from './types';

const STORAGE_KEY = 'sync:active-storefront';

interface ActiveStorefrontValue {
  /** null while loading, or when the user manages no branches at all. */
  active: ManagedStorefront | null;
  activeId: string | null;
  storefronts: ManagedStorefront[];
  setActive: (id: string) => void;
  isLoading: boolean;
  /** True when the user owns the active branch; false when they only staff it. */
  isOwner: boolean;
  /** More than one to choose from — the switcher hides itself otherwise. */
  hasChoice: boolean;
}

const ActiveStorefrontContext = createContext<ActiveStorefrontValue | null>(null);

export function ActiveStorefrontProvider({ children }: { children: ReactNode }) {
  const { data: storefronts = [], isLoading } = useManagedStorefronts();
  const [storedId, setStoredId] = useState<string | null>(null);

  // Read after mount: localStorage does not exist during SSR, and reading it in
  // useState's initialiser would desync the first client render from the server.
  useEffect(() => {
    try {
      setStoredId(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      // Private browsing / storage disabled — fall through to the default.
    }
  }, []);

  const active = useMemo(() => {
    if (!storefronts.length) return null;
    // Validate rather than trust: the stored branch may have been archived, or
    // the user's access to it revoked, since it was written.
    const stored = storedId ? storefronts.find((s) => s.id === storedId) : undefined;
    if (stored) return stored;
    // Owners land on their primary; staff land on the one they can work.
    return storefronts.find((s) => s.isPrimary && s.capacity === 'owner') ?? storefronts[0];
  }, [storefronts, storedId]);

  const setActive = useCallback((id: string) => {
    setStoredId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Selection still applies for this session.
    }
  }, []);

  // Drop a stale pointer so the next load does not re-validate it every time.
  useEffect(() => {
    if (!isLoading && storedId && storefronts.length && !storefronts.some((s) => s.id === storedId)) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* nothing to clean up */
      }
      setStoredId(null);
    }
  }, [isLoading, storedId, storefronts]);

  const value = useMemo<ActiveStorefrontValue>(
    () => ({
      active,
      activeId: active?.id ?? null,
      storefronts,
      setActive,
      isLoading,
      isOwner: active?.capacity === 'owner',
      hasChoice: storefronts.length > 1,
    }),
    [active, storefronts, setActive, isLoading],
  );

  return (
    <ActiveStorefrontContext.Provider value={value}>{children}</ActiveStorefrontContext.Provider>
  );
}

/**
 * Throws outside the provider on purpose. A vendor screen that reads the active
 * branch and silently gets `null` would quietly show another branch's data.
 */
export function useActiveStorefront(): ActiveStorefrontValue {
  const ctx = useContext(ActiveStorefrontContext);
  if (!ctx) {
    throw new Error('useActiveStorefront must be used inside <ActiveStorefrontProvider>');
  }
  return ctx;
}
