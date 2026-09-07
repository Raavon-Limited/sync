/**
 * ROUTE: /checkout
 * ACCESS: authenticated student
 *
 * REDIRECT, NOT A SECOND IMPLEMENTATION
 *   Checkout is per-vertical because a cart is per-vertical: /food/checkout
 *   consumes a food cart via `checkout_cart` and pays from the wallet. A
 *   generic /checkout would need its own cart concept, and the schema has none.
 *   When another vertical grows a cart, it gets its own checkout route.
 */
import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/food/checkout');
}
