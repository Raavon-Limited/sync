/**
 * The orders → inbox deep link.
 *
 * "Message the customer about order #1234" is one intent spread across two
 * screens, so the URL contract lives here rather than being spelled out at both
 * ends. The orders table builds a link with `inboxHrefForOrder`; the inbox reads
 * it back with `readOrderChatParams` and resolves it with `findConversationId`.
 * Change the param names here and both sides move together.
 */
import type { Order } from '@/types/order';
import type { ChatOrder } from '@/modules/vendor/types';

/** Query keys carried from the orders table to the inbox. */
export const ORDER_CHAT_PARAM = {
  /** ChatContact.id - the conversation to open. */
  contact: 'contact',
  /** Display name, so we can still find the thread if the id is missing/stale. */
  customer: 'customer',
  /** Order.id - which order the vendor is writing about. */
  order: 'order',
} as const;

export interface OrderChatParams {
  contactId?: string;
  customerName?: string;
  orderId?: string;
}

/**
 * Inbox URL for messaging an order's customer.
 *
 * `fromPathname` is the current orders path. Vendor dashboards are served from a
 * name-based handle (`/aisha-foods/orders`) that the proxy rewrites to
 * `/vendor/orders`, so we swap the last segment rather than hardcoding
 * `/vendor/inbox` - otherwise the link would bounce the vendor off their handle.
 */
export function inboxHrefForOrder(fromPathname: string, order: Order): string {
  const base = fromPathname.replace(/\/orders(?:\/.*)?$/, '') || '/vendor';

  const params = new URLSearchParams();
  if (order.customerId) params.set(ORDER_CHAT_PARAM.contact, order.customerId);
  params.set(ORDER_CHAT_PARAM.customer, order.customer);
  // Order ids start with "#", which URLSearchParams percent-encodes for us -
  // left raw it would be read as a fragment and never reach the server.
  params.set(ORDER_CHAT_PARAM.order, order.id);

  return `${base}/inbox?${params.toString()}`;
}

/** Narrows a Next.js `searchParams` object to the params we care about. */
export function readOrderChatParams(
  searchParams: Record<string, string | string[] | undefined> = {},
): OrderChatParams {
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value || undefined;

  return {
    contactId: one(searchParams[ORDER_CHAT_PARAM.contact]),
    customerName: one(searchParams[ORDER_CHAT_PARAM.customer]),
    orderId: one(searchParams[ORDER_CHAT_PARAM.order]),
  };
}

/**
 * The two sides model an order differently - the table's `Order` is the full
 * record, the chat's `ChatOrder` is the summary shown on the linked-order pill.
 * `Delivered` is the table's terminal state; the chat calls that `Completed`.
 */
const CHAT_STATUS: Record<Order['status'], ChatOrder['status']> = {
  Delivered: 'Completed',
  Processing: 'Processing',
  Pending: 'Pending',
  Cancelled: 'Cancelled',
};

/** Adapts a table order into the summary the chat window's order pill renders. */
export function toChatOrder(order: Order): ChatOrder {
  return {
    orderId: order.id,
    items: order.product,
    total: `₦${order.amount.toLocaleString()}`,
    status: CHAT_STATUS[order.status],
  };
}

/**
 * Which conversation to open. Prefers the explicit contact id, then falls back
 * to a case-insensitive name match so the link still lands somewhere sensible
 * when an order predates the id. Returns null when neither resolves - the inbox
 * then just opens normally instead of erroring.
 */
export function findConversationId(
  contacts: { id: string; name: string }[],
  { contactId, customerName }: OrderChatParams,
): string | null {
  if (contactId && contacts.some((contact) => contact.id === contactId)) return contactId;

  if (customerName) {
    const needle = customerName.trim().toLowerCase();
    const match = contacts.find((contact) => contact.name.toLowerCase() === needle);
    if (match) return match.id;
  }

  return null;
}
