/**
 * ROUTE: /me/messages
 * ACCESS: authenticated student
 * PURPOSE: Every thread the student is a party to   vendors, landlords, riders
 *          and service providers   with realtime delivery.
 *
 * The shell stays a server component for metadata; the panel is a client island
 * reading modules/messaging, the same hooks the floating widget uses.
 */
import type { Metadata } from 'next';
import { MessagesPanel } from './(components)/messages-panel';

export const metadata: Metadata = { title: 'Messages' };

export default function Page() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">/ME/MESSAGES</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Your <span className="text-lime">Messages</span>
        </h2>
      </div>
      <MessagesPanel />
    </section>
  );
}
