/**
 * Food cart — same interface, real storage.
 *
 * WHAT CHANGED
 *   This used to be `useState<CartItem[]>` and nothing else: the cart lived in
 *   React memory, so a refresh emptied it, a second tab disagreed with the
 *   first, and checkout had nothing durable to convert into an order. The
 *   `carts` / `cart_items` tables and the whole modules/food cart layer already
 *   existed and were simply never called.
 *
 * WHY THE SHAPE IS UNCHANGED
 *   `VendorClient` is ~600 lines built against this exact context API. Swapping
 *   the storage underneath it — rather than rewriting the consumer — keeps the
 *   change reviewable and means every existing call site keeps working.
 *
 * ONE TRANSLATION TO KNOW
 *   Callers identify a line by LISTING id (that is what they hold from the
 *   menu). The database identifies it by CART ITEM id. `lineFor()` maps between
 *   them, so the public API stays listing-shaped while the writes stay correct.
 */
'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import { useSession } from '@/providers/session-provider';
import { useCart as useDbCart } from '@/modules/food/hooks';
import * as api from '@/modules/food/queries';

export interface CartItem {
  id: string;
  name: string;
  description: string;
  image: string;
  price: number;
  qty: number;
}

export interface CartVendor {
  /** vendor_profiles.id — required to reach the cart this belongs to. */
  id: string;
  slug: string;
  name: string;
  image?: string;
}

interface CartContextType {
  vendor: CartVendor | null;
  items: CartItem[];
  addItem: (vendor: CartVendor, item: Omit<CartItem, 'qty'>) => void;
  removeItem: (id: string) => void;
  increaseQty: (id: string) => void;
  decreaseQty: (id: string) => void;
  clearCart: () => void;
  subtotal: number;
  totalItems: number;
  /** New, additive: lets a caller disable the button while a write is inflight. */
  isSyncing: boolean;
}

const CartContext = createContext<CartContextType | null>(null);
const db = () => createClient();

export function CartProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const router = useRouter();
  const qc = useQueryClient();

  const [vendor, setVendor] = useState<CartVendor | null>(null);
  const [isSyncing, setSyncing] = useState(false);

  const { data: cart } = useDbCart(vendor?.id);

  const refresh = useCallback(
    (vendorId: string) => qc.invalidateQueries({ queryKey: qk.cart.byVendor(vendorId) }),
    [qc],
  );

  /** Public ids are listing ids; the database wants the cart_item id. */
  const lineFor = useCallback(
    (listingId: string) => cart?.lines.find((l) => l.listingId === listingId),
    [cart],
  );

  const items = useMemo<CartItem[]>(
    () =>
      (cart?.lines ?? []).map((l) => ({
        id: l.listingId,
        name: l.name,
        description: '',
        image: l.imageUrl ?? '',
        price: l.unitPriceKobo / 100,
        qty: l.quantity,
      })),
    [cart],
  );

  const addItem = useCallback(
    async (v: CartVendor, item: Omit<CartItem, 'qty'>) => {
      // A cart row is owned by a student — there is no anonymous cart to write
      // to, so send them to sign in rather than failing silently.
      if (!userId) {
        router.push('/login');
        return;
      }
      setVendor(v);
      setSyncing(true);
      try {
        const c = await api.fetchOrCreateCart(db(), v.id, userId);
        const existing = c.lines.find((l) => l.listingId === item.id);
        if (existing) {
          await api.updateCartItemQuantity(db(), existing.id, existing.quantity + 1);
        } else {
          await api.addCartItem(db(), {
            cartId: c.id,
            listingId: item.id,
            quantity: 1,
            // The UI works in naira, the ledger in kobo. Round rather than
            // truncate: 3499.999 must not become ₦3,499.99.
            unitPriceKobo: Math.round(item.price * 100),
          });
        }
        await refresh(v.id);
      } finally {
        setSyncing(false);
      }
    },
    [userId, router, refresh],
  );

  const mutate = useCallback(
    async (fn: () => Promise<unknown>) => {
      if (!vendor) return;
      setSyncing(true);
      try {
        await fn();
        await refresh(vendor.id);
      } finally {
        setSyncing(false);
      }
    },
    [vendor, refresh],
  );

  const increaseQty = useCallback(
    (listingId: string) => {
      const line = lineFor(listingId);
      if (line) void mutate(() => api.updateCartItemQuantity(db(), line.id, line.quantity + 1));
    },
    [lineFor, mutate],
  );

  const decreaseQty = useCallback(
    (listingId: string) => {
      const line = lineFor(listingId);
      if (!line) return;
      // Quantity 0 is not a state cart_items models; dropping to it removes.
      void mutate(() =>
        line.quantity <= 1
          ? api.removeCartItem(db(), line.id)
          : api.updateCartItemQuantity(db(), line.id, line.quantity - 1),
      );
    },
    [lineFor, mutate],
  );

  const removeItem = useCallback(
    (listingId: string) => {
      const line = lineFor(listingId);
      if (line) void mutate(() => api.removeCartItem(db(), line.id));
    },
    [lineFor, mutate],
  );

  const clearCart = useCallback(() => {
    const lines = cart?.lines ?? [];
    if (!lines.length) return;
    void mutate(async () => {
      for (const l of lines) await api.removeCartItem(db(), l.id);
    });
  }, [cart, mutate]);

  const value = useMemo<CartContextType>(
    () => ({
      vendor,
      items,
      addItem,
      removeItem,
      increaseQty,
      decreaseQty,
      clearCart,
      subtotal: (cart?.subtotalKobo ?? 0) / 100,
      totalItems: cart?.itemCount ?? 0,
      isSyncing,
    }),
    [vendor, items, addItem, removeItem, increaseQty, decreaseQty, clearCart, cart, isSyncing],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

/** The cart id, for checkout. Null until a vendor's cart has been opened. */
export function useCartId(): string | null {
  const { vendor } = useCart();
  const { data } = useDbCart(vendor?.id);
  return data?.id ?? null;
}
