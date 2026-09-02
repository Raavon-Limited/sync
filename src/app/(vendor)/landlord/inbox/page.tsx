/**
 * ROUTE: /landlord/inbox
 * ACCESS: landlord (gated in proxy.ts)
 * PURPOSE: Messages between this landlord and the students booking their rooms.
 *
 * IT USES THE REAL CHAT, NOT A SECOND ONE
 *   The landlord branch shipped its own inbox over a mock array of inquiries
 *   with canned quick-replies. Meanwhile the vendor inbox has been running on
 *   the actual messaging module - `conversations`, `messages`, realtime
 *   channels, attachments - since it was built. Porting the mock would have
 *   given landlords a chat that talks to nobody, and given the platform two
 *   inboxes to keep in step.
 *
 *   A landlord IS a vendor_profiles row, so the same component works unchanged:
 *   the threads it lists are the ones this account is a participant in, which
 *   RLS already scopes.
 */
import type { Metadata } from 'next';
import ChatComponent from '@/app/(vendor)/vendor/inbox/(components)/chat-component';

export const metadata: Metadata = { title: 'Inbox' };

export default function Page() {
  return (
    <section className="h-full overflow-hidden">
      <ChatComponent />
    </section>
  );
}
