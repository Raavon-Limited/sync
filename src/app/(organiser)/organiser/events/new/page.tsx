/**
 * ROUTE: /organiser/events/new
 * ACCESS: role=event_manager, enforced by the proxy.
 * PURPOSE: List an event.
 */
import type { Metadata } from 'next';
import { EventForm } from '../../(components)/event-form';

export const metadata: Metadata = { title: 'List an event' };

export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <p className="text-content-muted font-mono text-sm tracking-wide">YOUR EVENTS</p>
        <h1 className="font-display mt-1 text-3xl">
          List an <span className="text-lime-deep">event.</span>
        </h1>
      </div>
      <EventForm />
    </section>
  );
}
