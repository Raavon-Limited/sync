/**
 * React Query hooks for the 'food' module.
 *
 * These are what components import. Nothing here touches column names — that
 * stays in `./queries`. Rules followed throughout:
 *
 *  - Keys always come from `qk` so a mutation cannot invalidate a key that no
 *    query uses (see the note in src/lib/query/keys.ts).
 *  - Mutations invalidate the NARROWEST correct key. Blanket-invalidating
 *    `qk.orders.all` after editing one order refetches every order list on
 *    screen for no reason.
 *  - Optimistic updates always return a rollback context. A cart that jumps
 *    back on failure is honest; one that silently keeps a phantom item is not.
 */
'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import { useRealtime } from '@/lib/query/use-realtime';
import type { PageParams } from '@/lib/query/helpers';
import { useSession } from '@/providers/session-provider';
import * as api from './queries';
import type { Cart, CheckoutResult, FoodListing, FoodOrder, FoodVendor } from './types';

/**
 * `createClient()` from @supabase/ssr is internally singleton-ed, so calling it
 * per hook is cheap and avoids threading a client through props.
 */
const db = () => createClient();

// ── Browse ─────────────────────────────────────────────────────────────────

export function useFoodVendors(opts: { area?: string; search?: string } & PageParams = {}) {
  return useQuery({
    queryKey: qk.vendorProfile.list({ category: 'food', ...opts }),
    queryFn: () => api.fetchFoodVendors(db(), opts),
  });
}

export function useFoodVendor(slug: string, options?: Partial<UseQueryOptions<FoodVendor | null>>) {
  return useQuery({
    queryKey: qk.vendorProfile.detail(slug),
    queryFn: () => api.fetchVendorBySlug(db(), slug),
    enabled: !!slug,
    ...options,
  });
}

export function useVendorMenu(vendorId: string | undefined) {
  return useQuery({
    queryKey: qk.listings.list({ vendorId: vendorId ?? '' }),
    queryFn: () => api.fetchVendorMenu(db(), vendorId!),
    enabled: !!vendorId,
  });
}

// ── Cart ───────────────────────────────────────────────────────────────────

/**
 * `studentId` is required because `carts.student_id` is NOT NULL — RLS decides
 * what you may write, it does not fill the column in for you. Pass the signed-in
 * user's id; the hook stays disabled until both are known.
 */
export function useCart(vendorId: string | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: qk.cart.byVendor(vendorId ?? ''),
    queryFn: () => api.fetchOrCreateCart(db(), vendorId!, userId!),
    enabled: !!vendorId && !!userId,
    // The cart is the one thing a user expects to be exactly right, always.
    staleTime: 0,
  });
}

export function useAddToCart(vendorId: string) {
  const qc = useQueryClient();
  const key = qk.cart.byVendor(vendorId);

  return useMutation({
    mutationFn: (input: {
      cartId: string;
      listing: Pick<FoodListing, 'id' | 'name' | 'priceKobo' | 'imageUrl'>;
      quantity: number;
      note?: string;
    }) =>
      api.addCartItem(db(), {
        cartId: input.cartId,
        listingId: input.listing.id,
        quantity: input.quantity,
        unitPriceKobo: input.listing.priceKobo,
        note: input.note,
      }),

    // Optimistic: the button must feel instant on a slow campus connection.
    async onMutate(input) {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Cart>(key);

      qc.setQueryData<Cart>(key, (old) => {
        if (!old) return old;
        const existing = old.lines.find((l) => l.listingId === input.listing.id);
        const lines = existing
          ? old.lines.map((l) =>
              l.listingId === input.listing.id
                ? {
                    ...l,
                    quantity: l.quantity + input.quantity,
                    lineTotalKobo: (l.quantity + input.quantity) * l.unitPriceKobo,
                  }
                : l,
            )
          : [
              ...old.lines,
              {
                // Temporary id; replaced when the refetch lands.
                id: `optimistic-${input.listing.id}`,
                listingId: input.listing.id,
                name: input.listing.name,
                imageUrl: input.listing.imageUrl ?? null,
                quantity: input.quantity,
                unitPriceKobo: input.listing.priceKobo,
                lineTotalKobo: input.quantity * input.listing.priceKobo,
                note: input.note ?? null,
              },
            ];

        return {
          ...old,
          lines,
          subtotalKobo: lines.reduce((s, l) => s + l.lineTotalKobo, 0),
          itemCount: lines.reduce((s, l) => s + l.quantity, 0),
        };
      });

      return { previous };
    },

    onError(_err, _input, context) {
      // Put the cart back exactly as it was.
      if (context?.previous) qc.setQueryData(key, context.previous);
    },

    // Reconcile with the server regardless of outcome — the optimistic line
    // carries a fake id that must not survive.
    onSettled() {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useUpdateCartItem(vendorId: string) {
  const qc = useQueryClient();
  const key = qk.cart.byVendor(vendorId);

  return useMutation({
    mutationFn: (input: { itemId: string; quantity: number }) =>
      api.updateCartItemQuantity(db(), input.itemId, input.quantity),

    async onMutate({ itemId, quantity }) {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Cart>(key);

      qc.setQueryData<Cart>(key, (old) => {
        if (!old) return old;
        const lines = old.lines
          .map((l) =>
            l.id === itemId ? { ...l, quantity, lineTotalKobo: quantity * l.unitPriceKobo } : l,
          )
          .filter((l) => l.quantity > 0);

        return {
          ...old,
          lines,
          subtotalKobo: lines.reduce((s, l) => s + l.lineTotalKobo, 0),
          itemCount: lines.reduce((s, l) => s + l.quantity, 0),
        };
      });

      return { previous };
    },

    onError(_e, _v, context) {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useRemoveCartItem(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.removeCartItem(db(), itemId),
    onSettled() {
      qc.invalidateQueries({ queryKey: qk.cart.byVendor(vendorId) });
    },
  });
}

// ── Checkout ───────────────────────────────────────────────────────────────

/**
 * NOT optimistic, deliberately. Checkout creates an order, an escrow hold and a
 * delivery; showing success before the server confirms would mean rendering an
 * order that may not exist. Wait for the real result.
 *
 * `repriced` in the result means a live price differed from the cart's captured
 * one — surface that to the user rather than silently charging the difference.
 */
export function useCheckout(vendorId: string) {
  const qc = useQueryClient();

  return useMutation<
    CheckoutResult,
    Error,
    { cartId: string; deliveryAddress: string; note?: string; promotionCode?: string }
  >({
    mutationFn: (input) => api.checkoutCart(db(), input),
    onSuccess() {
      // The cart is consumed and a new order exists.
      qc.invalidateQueries({ queryKey: qk.cart.byVendor(vendorId) });
      qc.invalidateQueries({ queryKey: qk.orders.lists() });
      qc.invalidateQueries({ queryKey: qk.conversations.all });
    },
  });
}

// ── Orders ─────────────────────────────────────────────────────────────────

export function useMyOrders(opts: { status?: string } & PageParams = {}) {
  return useQuery({
    queryKey: qk.orders.list(opts),
    queryFn: () => api.fetchMyOrders(db(), opts),
  });
}

export function useOrder(orderId: string | undefined) {
  return useQuery<FoodOrder | null>({
    queryKey: qk.orders.detail(orderId ?? ''),
    queryFn: () => api.fetchOrder(db(), orderId!),
    enabled: !!orderId,
  });
}

export function useOrderEvents(orderId: string | undefined) {
  return useQuery({
    queryKey: qk.orders.events(orderId ?? ''),
    queryFn: () => api.fetchOrderEvents(db(), orderId!),
    enabled: !!orderId,
  });
}

/**
 * Live rider position for the tracking map.
 *
 * Polls rather than subscribing: rider positions update every few seconds, and
 * a realtime channel per viewer costs a connection for data that is already
 * stale by the time it renders. Polling stops once the order is terminal, so an
 * abandoned tab does not poll forever.
 */
export function useDeliveryTracking(orderId: string | undefined, isActive = true) {
  return useQuery({
    queryKey: qk.deliveries.tracking(orderId ?? ''),
    queryFn: () => api.fetchDeliveryTracking(db(), orderId!),
    enabled: !!orderId && isActive,
    refetchInterval: isActive ? 10_000 : false,
    staleTime: 0,
  });
}

// ── Favorites ──────────────────────────────────────────────────────────────

export function useFavorites(entityType?: string) {
  return useQuery({
    queryKey: qk.favorites.list(entityType),
    queryFn: () => api.fetchFavorites(db(), entityType),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      entityType: 'vendor' | 'listing' | 'event' | 'service' | 'hotspot';
      entityId: string;
    }) => api.toggleFavorite(db(), input.entityType, input.entityId),
    onSuccess(_isFavorited, input) {
      qc.invalidateQueries({ queryKey: qk.favorites.list(input.entityType) });
      qc.invalidateQueries({ queryKey: qk.favorites.list() });
    },
  });
}

// ── Realtime ───────────────────────────────────────────────────────────────

/**
 * Live updates for the signed-in student's own orders. Drives the orders list
 * and any "your food is on the way" banner without polling.
 */
export function useMyOrdersRealtime() {
  const { userId } = useSession();
  useRealtime({
    channel: `orders:student:${userId ?? 'none'}`,
    enabled: !!userId,
    bindings: [{ table: 'orders', filter: `student_id=eq.${userId}` }],
    invalidate: [qk.orders.all, qk.notifications.all],
  });
}

/**
 * Live tracking for one order: the order row, its event log and its delivery.
 *
 * This is what replaces the 10s poll in `useDeliveryTracking` for STATUS. The
 * poll stays for POSITION, because a rider's coordinates change continuously and
 * are written by an update loop — streaming every one of those to every viewer
 * is far more traffic than asking once every ten seconds, and the map only
 * needs to be approximately current.
 *
 * So: status is push, position is pull. They are different problems.
 */
export function useOrderRealtime(orderId: string | undefined) {
  useRealtime({
    channel: `order:${orderId ?? 'none'}`,
    enabled: !!orderId,
    bindings: [
      { table: 'orders', filter: `id=eq.${orderId}` },
      { table: 'order_events', filter: `order_id=eq.${orderId}` },
      { table: 'deliveries', filter: `order_id=eq.${orderId}` },
    ],
    invalidate: [
      qk.orders.detail(orderId ?? ''),
      qk.orders.events(orderId ?? ''),
      qk.deliveries.byOrder(orderId ?? ''),
      qk.deliveries.tracking(orderId ?? ''),
    ],
  });
}

/** Resolves a route slug to a branch. Accepts branch or brand slugs. */
export function useResolvedStorefront(slug: string | undefined) {
  return useQuery({
    queryKey: qk.vendorProfile.detail(`resolve:${slug ?? ''}`),
    queryFn: () => api.resolveStorefrontBySlug(db(), slug!),
    enabled: !!slug,
  });
}

/** What one branch sells. Replaces useVendorMenu for storefront pages. */
export function useStorefrontMenu(storefrontId: string | undefined) {
  return useQuery({
    queryKey: qk.listings.list({ storefrontId: storefrontId ?? '' }),
    queryFn: () => api.fetchStorefrontMenu(db(), storefrontId!),
    enabled: !!storefrontId,
  });
}

/** Food branches for the browse page. Lists locations, not businesses. */
export function useFoodStorefronts(opts: { area?: string } & PageParams = {}) {
  return useQuery({
    queryKey: qk.storefronts.nearby({ category: 'food', ...opts }),
    queryFn: () => api.fetchFoodStorefronts(db(), opts),
  });
}

/** The brand behind a branch, by id rather than slug. */
export function useFoodVendorById(vendorId: string | undefined) {
  return useQuery({
    queryKey: qk.vendorProfile.detail(vendorId ?? ''),
    queryFn: async () => {
      const rows = await api.fetchFoodVendors(db(), { pageSize: 100 });
      return rows.find((v) => v.id === vendorId) ?? null;
    },
    enabled: !!vendorId,
  });
}
