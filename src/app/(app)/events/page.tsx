/**
 * ROUTE: /events
 * ACCESS: public
 * PURPOSE: Upcoming events with their cheapest available ticket price.
 *
 * Replaces a hardcoded featured row and `@/lib/event`'s events array — both
 * described events that do not exist, with slugs that resolve to nothing.
 */
import type { Metadata } from 'next';
import { EventsBrowser } from './(components)/events-browser';

export const metadata: Metadata = { title: 'Events' };

export default function Page() {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">EVENTS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          What&apos;s on <span className="text-lime-deep">around campus.</span>
        </h2>
      </div>
      <EventsBrowser />
    </section>
  );
}
