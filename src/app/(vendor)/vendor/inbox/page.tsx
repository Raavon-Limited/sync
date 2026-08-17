/**
 * ROUTE: /vendor/inbox
 * ACCESS: authenticated vendor
 * PURPOSE: Vendor side of the messaging module. Same realtime channels as students; threaded by listing/order.
 * BUILT HERE: Conversation list + thread + composer.
 * TODO: implement the full screen once dependent modules + data are wired.
 *
 * Deep link: the orders table links here as
 * `?contact=<id>&customer=<name>&order=<orderId>` to open a specific thread
 * focused on one order (see lib/order-chat). Read server-side and passed down as
 * props - `useSearchParams` in the client tree would force this static page
 * behind a Suspense boundary for no benefit.
 */
import type { Metadata } from 'next';
import ChatComponent from './(components)/chat-component';
import { readOrderChatParams, toChatOrder } from '@/lib/order-chat';
import { orders } from '@/mock/vendor';

export const metadata: Metadata = { title: 'Inbox' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { contactId, customerName, orderId } = readOrderChatParams(await searchParams);

  // Resolved here rather than in the client tree: this is where a real
  // `getOrder(orderId)` fetch would go once orders come from the database.
  const source = orderId ? orders.find((order) => order.id === orderId) : undefined;
  const focusedOrder = source ? toChatOrder(source) : undefined;

  return (
    <section className="h-full overflow-hidden">
      <ChatComponent
        initialContactId={contactId}
        initialCustomerName={customerName}
        focusedOrder={focusedOrder}
      />
    </section>
  );
}
