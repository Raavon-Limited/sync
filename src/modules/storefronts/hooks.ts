/**
 * React Query hooks for the 'storefronts' module.
 *
 * The vendor-side hooks key off the signed-in user, because a brand's owner id
 * IS their `auth.uid()`   vendor_profiles.id references profiles.id, and the
 * storefronts migration deliberately preserved that.
 */
'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import { useSession } from '@/providers/session-provider';
import * as api from './queries';
import type { StaffRole, StaffScope, StorefrontInput, TransactionBucket } from './types';

const db = () => createClient();

// -- Vendor side -------------------------------------------------------------

/**
 * Every branch the signed-in vendor owns, primary first.
 *
 * `includeArchived` is for the management screen only, and it is part of the
 * query key: sharing one cache entry between the two would have the listings
 * editor offering a store the vendor has closed.
 */
export function useMyStorefronts(opts: { includeArchived?: boolean } = {}) {
  const { userId } = useSession();
  const includeArchived = !!opts.includeArchived;
  return useQuery({
    queryKey: [...qk.storefronts.mine(), includeArchived ? 'with-archived' : 'active'] as const,
    queryFn: () => api.fetchStorefronts(db(), userId!, { includeArchived }),
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

/**
 * Archive a store, or bring it back.
 *
 * Invalidates the whole namespace rather than patching the row: archiving
 * moves the primary flag onto a DIFFERENT store, so the one row that changed
 * is never the only row that changed.
 */
export function useSetStorefrontArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      api.setStorefrontArchived(db(), id, archived),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
      // The order queue and the listings grid are both scoped to a store that
      // may have just stopped existing for them.
      qc.invalidateQueries({ queryKey: qk.listings.all });
      qc.invalidateQueries({ queryKey: qk.orders.all });
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
 * Branches near a point. Stays disabled until coordinates are known   firing
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
 * Returns the token exactly once. Surface it immediately   it is not readable
 * again, and the caller is responsible for delivering it.
 */
export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      storefrontId: string;
      email: string;
      role?: StaffRole;
      scopes?: StaffScope[];
    }) => api.createInvite(db(), input),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
    },
  });
}

/** Change what a manager may reach, without revoking and re-inviting them. */
export function useSetStaffScopes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, scopes }: { staffId: string; scopes: StaffScope[] }) =>
      api.setStaffScopes(db(), staffId, scopes),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.storefronts.all });
    },
  });
}

/** Cancel an unredeemed invite. The only way to kill a live token early. */
export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => api.revokeInvite(db(), inviteId),
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

/**
 * Owner-only oversight feed. Returns nothing for staff.
 *
 * `search` and `actorId` are part of the key AND go to the server: the feed is
 * paged, so filtering client-side would search only the rows already fetched.
 */
export function useStorefrontActivity(
  opts: { storefrontId?: string; limit?: number; search?: string; actorId?: string } = {},
) {
  const term = opts.search?.trim() ?? '';
  return useQuery({
    queryKey: [
      ...qk.storefronts.all,
      'activity',
      opts.storefrontId ?? 'all',
      opts.limit ?? 100,
      term,
      opts.actorId ?? 'anyone',
    ] as const,
    queryFn: () => api.fetchActivity(db(), { ...opts, search: term || undefined }),
    // Typing a search should not blank the list between keystrokes.
    placeholderData: keepPreviousData,
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

// -- Performance --------------------------------------------------------------

/**
 * Per-store order counts and takings.
 *
 * Not on `qk.earnings`: that namespace is the BUSINESS's money and is
 * invalidated by withdrawals and payouts, none of which change a store's order
 * history. Keeping them apart stops a payout refetching this and stops this
 * refetching the wallet.
 */
export function useStorePerformance() {
  const { userId } = useSession();
  return useQuery({
    queryKey: [...qk.storefronts.all, 'performance', userId ?? ''] as const,
    queryFn: () => api.fetchStorePerformance(db()),
    enabled: !!userId,
  });
}

export function useStoreRevenueMonthly(months = 6) {
  const { userId } = useSession();
  return useQuery({
    queryKey: [...qk.storefronts.all, 'revenue-monthly', userId ?? '', months] as const,
    queryFn: () => api.fetchStoreRevenueMonthly(db(), months),
    enabled: !!userId,
  });
}

/**
 * One page of a store's orders.
 *
 * `placeholderData: keepPreviousData` on purpose: switching tabs or pages
 * refetches, and without it the table empties to a spinner and the page jumps.
 * The previous page stays put until the new one lands.
 */
export function useStoreTransactions(opts: {
  storefrontId?: string | null;
  bucket?: TransactionBucket;
  limit?: number;
  offset?: number;
}) {
  const { userId } = useSession();
  const { storefrontId = null, bucket = 'all', limit = 25, offset = 0 } = opts;
  return useQuery({
    queryKey: [
      ...qk.storefronts.all,
      'transactions',
      userId ?? '',
      storefrontId ?? 'all',
      bucket,
      limit,
      offset,
    ] as const,
    queryFn: () => api.fetchStoreTransactions(db(), { storefrontId, bucket, limit, offset }),
    enabled: !!userId,
    placeholderData: keepPreviousData,
  });
}
