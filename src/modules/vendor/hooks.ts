/**
 * React Query hooks for the 'vendor' module.
 *
 * These replace the mock arrays the vendor screens currently render. Migrate a
 * screen at a time   `src/mock/listings.ts` and `src/mock/vendor.ts` can stay
 * until the last consumer is gone.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import { useRealtime } from '@/lib/query/use-realtime';
import type { PageParams } from '@/lib/query/helpers';
import type { OrderStatus } from '@/modules/food/types';
import { useSession } from '@/providers/session-provider';
import * as api from './queries';
import type { Promotion, VendorListing, VendorStorefront } from './queries';

const db = () => createClient();

// ── Storefront ─────────────────────────────────────────────────────────────

export function useMyStorefront() {
  const { userId: vendorId } = useSession();
  return useQuery({
    queryKey: qk.vendorProfile.mine(),
    queryFn: () => api.fetchMyStorefront(db(), vendorId!),
    enabled: !!vendorId,
  });
}

export function useUpdateStorefront() {
  const { userId } = useSession();
  const vendorId = userId!;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<VendorStorefront>) => api.updateMyStorefront(db(), vendorId, patch),
    onSuccess(storefront) {
      qc.setQueryData(qk.vendorProfile.mine(), storefront);
      // The public storefront page is keyed by slug and is now stale.
      qc.invalidateQueries({ queryKey: qk.vendorProfile.detail(storefront.slug) });
    },
  });
}

// ── Listings ───────────────────────────────────────────────────────────────

export function useMyListings(
  filters: { status?: string; search?: string; includeArchived?: boolean } & PageParams = {},
) {
  const { userId: vendorId } = useSession();
  return useQuery({
    queryKey: qk.listings.mine(filters),
    queryFn: () => api.fetchMyListings(db(), vendorId!, filters),
    enabled: !!vendorId,
  });
}

export function useUpsertListing() {
  const { userId } = useSession();
  const vendorId = userId!;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Partial<VendorListing> & { name: string; category: string; priceKobo: number },
    ) => api.upsertListing(db(), { ...input, vendorId }),
    onSuccess(listing) {
      qc.invalidateQueries({ queryKey: qk.listings.all });
      qc.setQueryData(qk.listings.detail(listing.id), listing);
    },
  });
}

/**
 * Bulk archive   the listings page has multi-select, so this takes an array.
 *
 * Optimistic, because archiving is reversible (`useRestoreListings` puts them
 * back) and the grid should respond immediately to a bulk action. Contrast with
 * checkout, which is not reversible and so is not optimistic.
 */
export function useArchiveListings(
  filters: { status?: string; search?: string; includeArchived?: boolean } & PageParams = {},
) {
  const qc = useQueryClient();
  const key = qk.listings.mine(filters);

  return useMutation({
    mutationFn: (ids: string[]) => api.archiveListings(db(), ids),

    async onMutate(ids) {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<VendorListing[]>(key);

      qc.setQueryData<VendorListing[]>(key, (old) =>
        (old ?? []).filter((l) => !ids.includes(l.id)),
      );

      return { previous };
    },
    onError(_e, _ids, context) {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: qk.listings.all });
    },
  });
}

export function useRestoreListings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.restoreListings(db(), ids),
    onSettled() {
      qc.invalidateQueries({ queryKey: qk.listings.all });
    },
  });
}

export function useDeleteListings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.deleteListings(db(), ids),
    onSettled() {
      qc.invalidateQueries({ queryKey: qk.listings.all });
    },
  });
}

// ── Order inbox ────────────────────────────────────────────────────────────

export function useVendorOrders(
  filters: { status?: OrderStatus; storefrontId?: string } & PageParams = {},
) {
  const { userId: vendorId } = useSession();
  return useQuery({
    queryKey: qk.orders.vendorInbox(filters),
    queryFn: () => api.fetchVendorOrders(db(), vendorId!, filters),
    enabled: !!vendorId,
    // Realtime (below) is the primary signal. This slow poll is a backstop for
    // a dropped socket on a flaky campus connection   not the main mechanism,
    // which is why it is minutes rather than seconds.
    refetchInterval: 120_000,
  });
}

/**
 * Advancing an order also writes an `order_events` row by trigger, so the
 * timeline on the customer's tracking screen updates from the same action.
 */
export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    // `reason` is only read when cancelling; it ends up on the refund's
    // ledger narrative, which is what the customer sees on their statement.
    mutationFn: (input: { orderId: string; status: OrderStatus; reason?: string }) =>
      api.updateOrderStatus(db(), input.orderId, input.status, input.reason),
    onSuccess(order) {
      qc.setQueryData(qk.orders.detail(order.id), order);
      qc.invalidateQueries({ queryKey: qk.orders.vendorInbox() });
      qc.invalidateQueries({ queryKey: qk.orders.events(order.id) });
      // Delivering an order releases escrow, so earnings change.
      // Delivering releases escrow and cancelling refunds it   both move
      // money, so both invalidate the wallet.
      if (order.status === 'delivered' || order.status === 'cancelled') {
        qc.invalidateQueries({ queryKey: qk.earnings.all });
        qc.invalidateQueries({ queryKey: qk.wallet.all });
      }
    },
  });
}

// ── Promotions ─────────────────────────────────────────────────────────────

export function useMyPromotions() {
  const { userId: vendorId } = useSession();
  return useQuery({
    queryKey: qk.promotions.mine(),
    queryFn: () => api.fetchMyPromotions(db(), vendorId!),
    enabled: !!vendorId,
  });
}

export function useUpsertPromotion() {
  const { userId } = useSession();
  const vendorId = userId!;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Partial<Promotion> & {
        name: string;
        discountType: 'percent' | 'fixed';
        discountValue: number;
      },
    ) => api.upsertPromotion(db(), { ...input, vendorId }),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.promotions.all });
    },
  });
}

export function useDeletePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePromotion(db(), id),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.promotions.all });
    },
  });
}

// ── Realtime ───────────────────────────────────────────────────────────────

/**
 * Live order inbox. A new order must appear the moment it is placed   a vendor
 * refreshing a page to find out they have work is how orders go cold.
 *
 * Mount once on the vendor dashboard shell, not per widget: each mount is a
 * socket.
 */
/**
 * `storefrontId` narrows the socket to one branch. A manager MUST pass it
 * a `vendor_id=eq.` filter matches nothing for them, so without it their queue
 * would never update live even though the initial fetch worked.
 */
export function useVendorOrdersRealtime(storefrontId?: string) {
  const { userId: vendorId } = useSession();
  const scope = storefrontId ?? vendorId;
  useRealtime({
    channel: `orders:${storefrontId ? 'storefront' : 'vendor'}:${scope ?? 'none'}`,
    enabled: !!scope,
    bindings: [
      {
        table: 'orders',
        filter: storefrontId ? `storefront_id=eq.${storefrontId}` : `vendor_id=eq.${vendorId}`,
      },
    ],
    invalidate: [qk.orders.all, qk.earnings.all, qk.notifications.all],
  });
}

/**
 * Live service requests for a vendor in the beauty/laundry/workmanship
 * verticals   the same problem as the food inbox, different table.
 */
export function useVendorRequestsRealtime() {
  const { userId: vendorId } = useSession();
  useRealtime({
    channel: `requests:vendor:${vendorId ?? 'none'}`,
    enabled: !!vendorId,
    bindings: [{ table: 'service_requests', filter: `vendor_id=eq.${vendorId}` }],
    invalidate: [qk.serviceRequests.all, qk.notifications.all],
  });
}

/**
 * Uploads a listing photo, returning its public URL.
 *
 * Deliberately separate from `useUpsertListing`: the image is uploaded when the
 * vendor picks it, so they see the preview and any "too large" error while
 * still filling the form - not after pressing Save, when a rejected file would
 * mean re-entering everything.
 */
export function useUploadListingImage() {
  const { userId } = useSession();

  return useMutation({
    mutationFn: (file: File) => api.uploadListingImage(db(), { userId: userId!, file }),
  });
}

/**
 * The same upload, for anything that is not a listing photo   a business logo,
 * a store front. Same bucket, same 5MB limit, same own-folder-only policy;
 * only the folder differs, and that is for humans browsing storage later.
 */
export function useUploadVendorImage(
  folder: 'listings' | 'logos' | 'stores' | 'events' | 'avatars' = 'listings',
) {
  const { userId } = useSession();

  return useMutation({
    mutationFn: (file: File) => api.uploadVendorImage(db(), { userId: userId!, file, folder }),
  });
}

// ── Listing categories ─────────────────────────────────────────────────────

/**
 * Categories this vendor can file a listing under.
 *
 * The vendor's business type comes from their storefront, so a clothing vendor
 * gets Tops/Bottoms/Footwear and a food vendor gets Rice/Soups/Grills - without
 * either screen knowing which is which.
 */
export function useListingCategories() {
  const { userId } = useSession();
  const { data: storefront } = useMyStorefront();
  const vendorCategory = storefront?.category;

  return useQuery({
    queryKey: qk.listingCategories.forVendor(vendorCategory ?? '', userId ?? undefined),
    queryFn: () =>
      api.fetchListingCategories(db(), {
        vendorCategory: vendorCategory!,
        vendorId: userId ?? undefined,
      }),
    // Waits for the storefront: without the business type there is no correct
    // list to show, and guessing "food" is how a clothing vendor ends up
    // filing shirts under Soups.
    enabled: !!vendorCategory,
    staleTime: 10 * 60_000,
  });
}

/** Adds a category of the vendor's own, for the long tail the shared set misses. */
export function useCreateListingCategory() {
  const { userId } = useSession();
  const { data: storefront } = useMyStorefront();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (name: string) =>
      api.createListingCategory(db(), {
        vendorId: userId!,
        vendorCategory: storefront!.category,
        name,
      }),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.listingCategories.all });
    },
  });
}
