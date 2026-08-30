/**
 * React Query hooks for the 'storefronts' module.
 *
 * The vendor-side hooks key off the signed-in user, because a brand's owner id
 * IS their `auth.uid()` — vendor_profiles.id references profiles.id, and the
 * storefronts migration deliberately preserved that.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import { useSession } from '@/providers/session-provider';
import * as api from './queries';
import type { StaffRole, StorefrontInput } from './types';

const db = () => createClient();

// -- Vendor side -------------------------------------------------------------

/** Every branch the signed-in vendor owns, primary first. */
export function useMyStorefronts() {
  const { userId } = useSession();
  return useQuery({
    queryKey: qk.storefronts.mine(),
    queryFn: () => api.fetchStorefronts(db(), userId!),
    enabled: !!userId,
  });
}

export function useStorefront(slug: string | undefined) {
  return useQuery({
    queryKey: qk.storefronts.detail(slug ?? ''),
    queryFn: () => api.fetchStorefrontBySlug(db(), slug!),
    enabled: !!slug,
  });
}

export function useCreateStorefront() {
  const qc = useQueryClient();
  const { userId } = useSession();
  return useMutation({
    mutationFn: (input: StorefrontInput & { brandSlug?: string }) =>
      api.createStorefront(db(), userId!, input),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
    },
  });
}

export function useUpdateStorefront() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string } & Partial<StorefrontInput>) => {
      const { id, ...patch } = input;
      return api.updateStorefront(db(), id, patch);
    },
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
    },
  });
}

export function useArchiveStorefront() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveStorefront(db(), id),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
    },
  });
}

export function useSetPrimaryStorefront() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.setPrimaryStorefront(db(), id),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
    },
  });
}

// -- Student side ------------------------------------------------------------

/**
 * Branches near a point. Stays disabled until coordinates are known — firing
 * with (0, 0) would rank everything against the Gulf of Guinea.
 */
export function useNearbyStorefronts(opts: {
  lat?: number;
  lng?: number;
  radiusM?: number;
  category?: string;
  limit?: number;
}) {
  const ready = typeof opts.lat === 'number' && typeof opts.lng === 'number';
  return useQuery({
    queryKey: qk.storefronts.nearby(opts as Record<string, unknown>),
    queryFn: () =>
      api.fetchNearbyStorefronts(db(), {
        lat: opts.lat!,
        lng: opts.lng!,
        radiusM: opts.radiusM,
        category: opts.category,
        limit: opts.limit,
      }),
    enabled: ready,
  });
}

// -- Staff --------------------------------------------------------------------

/**
 * The branches the signed-in user can act on, owned or staffed.
 *
 * Prefer this over `useMyStorefronts` anywhere the vendor shell decides what to
 * show: `useMyStorefronts` filters on ownership, so an invited manager sees an
 * empty store switcher.
 */
export function useManagedStorefronts() {
  const { userId } = useSession();
  return useQuery({
    queryKey: [...qk.storefronts.all, 'managed', userId ?? ''] as const,
    queryFn: () => api.fetchManagedStorefronts(db(), userId!),
    enabled: !!userId,
  });
}

/** Owner-scoped roster with names and emails. Empty for staff, by design. */
export function useStorefrontRoster(storefrontId?: string) {
  return useQuery({
    queryKey: [...qk.storefronts.all, 'roster', storefrontId ?? 'all'] as const,
    queryFn: () => api.fetchRoster(db(), storefrontId),
  });
}

export function usePendingInvites(storefrontId?: string) {
  return useQuery({
    queryKey: [...qk.storefronts.all, 'invites', storefrontId ?? 'all'] as const,
    queryFn: () => api.fetchPendingInvites(db(), storefrontId),
  });
}

/**
 * Returns the token exactly once. Surface it immediately — it is not readable
 * again, and the caller is responsible for delivering it.
 */
export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { storefrontId: string; email: string; role?: StaffRole }) =>
      api.createInvite(db(), input),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
    },
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.acceptInvite(db(), token),
    onSuccess() {
      // The accepting user's managed list just changed.
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
    },
  });
}

export function useRevokeStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (staffId: string) => api.revokeStaff(db(), staffId),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
    },
  });
}

/** Owner-only oversight feed. Returns nothing for staff. */
export function useStorefrontActivity(opts: { storefrontId?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: [...qk.storefronts.all, 'activity', opts.storefrontId ?? 'all', opts.limit ?? 100] as const,
    queryFn: () => api.fetchActivity(db(), opts),
  });
}

// -- Cooldown -----------------------------------------------------------------

/**
 * Pause and resume invalidate the whole storefronts namespace rather than
 * patching the cached row: a pause changes what the store switcher, the
 * storefront page and the order queue all show, and a half-updated cache is
 * how a vendor ends up believing they are open.
 */
export function usePauseStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      api.pauseStore(db(), id, minutes),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
    },
  });
}

export function useResumeStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.resumeStore(db(), id),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
    },
  });
}

// -- Availability -------------------------------------------------------------

export function useStoreListings(storefrontId?: string) {
  return useQuery({
    queryKey: [...qk.storefronts.all, 'listings', storefrontId ?? 'none'] as const,
    queryFn: () => api.fetchStoreListings(db(), storefrontId!),
    enabled: !!storefrontId,
  });
}

export function useSetStoreListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.setStoreListing>[1]) =>
      api.setStoreListing(db(), input),
    onSuccess() {
      // The vendor's own view and the student menu both change.
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
      qc.invalidateQueries({ queryKey: qk.listings.all });
    },
  });
}

/** One tap: sold out / back in stock. See `setSoldOut` for why it moves stock. */
export function useSetSoldOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { storefrontId: string; listingId: string; soldOut: boolean }) =>
      api.setSoldOut(db(), v.storefrontId, v.listingId, v.soldOut),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
      qc.invalidateQueries({ queryKey: qk.listings.all });
    },
  });
}
