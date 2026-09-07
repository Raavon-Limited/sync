/**
 * Favourites   the heart on a card, and the Saved page.
 *
 * WAS LOCALSTORAGE, NOW THE DATABASE
 *   Hearts persisted to `localStorage` under 'sync:food:favorites', so they
 *   vanished on another device and never reached `public.favorites`   which is
 *   what /user/saved reads. Tapping a heart looked like it worked and saved
 *   nothing durable.
 *
 * ENTITY, NOT SLUG
 *   `favorites` stores (entity_type, entity_id). The old shape was keyed by
 *   `slug`, which is not an id and is not unique across types   a vendor and a
 *   listing can share one. Cards now pass what they actually are.
 *
 * A KNOWN GAP, WRITTEN DOWN RATHER THAN WORKED AROUND
 *   `favorites.entity_type` allows 'vendor' but not 'storefront'   the table
 *   predates branches. Favouriting a branch therefore saves the BRAND, so a
 *   student who hearts the Tanke shop sees the business, not that location.
 *   Fixing it means widening the check constraint; it is not worked around here
 *   because a silent approximation is worse than a documented one.
 */
'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { StaticImageData } from 'next/image';
import { useFavorites as useFavoriteRows, useToggleFavorite } from '@/modules/food/hooks';
import { useSession } from '@/providers/session-provider';

export type FavoriteEntity = 'vendor' | 'listing' | 'event' | 'service' | 'hotspot';

export interface FavoriteFood {
  /** What this is, and its uuid. Required   the row cannot be written without them. */
  entityType: FavoriteEntity;
  entityId: string;
  slug: string;
  image: StaticImageData | string;
  name: string;
  tags: string[];
  rating: string;
  reviewCount?: number;
  location: string;
  time: string;
  category?: string;
  isFree?: boolean;
  deliveryTime?: string;
  discount?: string;
  /**
   * Mirrors FoodCard's VendorStatus. 'paused' is a cooldown   open, but not
   * taking orders for a few minutes. A saved card holds a snapshot, so this
   * is only ever as fresh as the moment it was favourited.
   */
  status?: 'open' | 'closed' | 'delivery-only' | 'paused';
}

interface FavoritesValue {
  /** ids currently favourited, by entity id. */
  favoriteIds: Set<string>;
  isFavorite: (entityId: string) => boolean;
  /** Returns the new state (true = added), optimistically. */
  toggleFavorite: (food: FavoriteFood) => boolean;
  removeFavorite: (entityId: string, entityType: FavoriteEntity) => void;
  isReady: boolean;
}

const FavoritesContext = createContext<FavoritesValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useSession();
  // RLS scopes this to the caller, so no user filter is needed.
  const { data: rows = [], isLoading } = useFavoriteRows();
  const toggle = useToggleFavorite();

  const favoriteIds = useMemo(
    () => new Set((rows as { entity_id: string }[]).map((r) => r.entity_id)),
    [rows],
  );

  const isFavorite = useCallback((entityId: string) => favoriteIds.has(entityId), [favoriteIds]);

  const toggleFavorite = useCallback(
    (food: FavoriteFood) => {
      // Signed out: there is no row to write. Report unchanged rather than
      // showing a filled heart that will be gone on reload.
      if (!isAuthenticated) return false;
      const next = !favoriteIds.has(food.entityId);
      toggle.mutate({ entityType: food.entityType, entityId: food.entityId });
      return next;
    },
    [isAuthenticated, favoriteIds, toggle],
  );

  const removeFavorite = useCallback(
    (entityId: string, entityType: FavoriteEntity) => {
      if (!isAuthenticated || !favoriteIds.has(entityId)) return;
      // toggle_favorite is a toggle: calling it on a favourited row removes it.
      toggle.mutate({ entityType, entityId });
    },
    [isAuthenticated, favoriteIds, toggle],
  );

  const value = useMemo<FavoritesValue>(
    () => ({ favoriteIds, isFavorite, toggleFavorite, removeFavorite, isReady: !isLoading }),
    [favoriteIds, isFavorite, toggleFavorite, removeFavorite, isLoading],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used inside <FavoritesProvider>');
  return ctx;
}

/** For cards that may render outside the provider. */
export function useOptionalFavorites() {
  return useContext(FavoritesContext);
}
