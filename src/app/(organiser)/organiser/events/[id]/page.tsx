/**
 * ROUTE: /organiser/events/[id]
 * ACCESS: role=event_manager (proxy), and it has to be THEIR event.
 * PURPOSE: Edit one event, price it, and see what it has sold.
 *
 * NOT FOUND RATHER THAN FORBIDDEN
 *   `getMyEvent` reads through the organiser's own session, so somebody else's
 *   event simply is not in the result. That is answered with notFound() instead
 *   of a 403: a 403 confirms the id exists, which is a thing worth not
 *   confirming to somebody guessing.
 *
 * THE ID, NOT THE SLUG, IS THE KEY HERE
 *   The public page is /events/[slug] because a slug is what you send a friend.
 *   This one is keyed on the id, because editing the name changes the slug and
 *   an editor whose own URL moves out from under it on save is a bug that only
 *   shows up after somebody renames something.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getMyEvent, getTiers } from '@/modules/events/organiser-queries';
import { formatKobo } from '@/lib/utils/format';
import { EventForm } from '../../(components)/event-form';
import { TierManager } from '../../(components)/tier-manager';

export const metadata: Metadata = { title: 'Manage event' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const event = await getMyEvent(id);
  if (!event) notFound();

  const tiers = await getTiers(id);

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div>
        <p className="text-content-muted font-mono text-sm tracking-wide">YOUR EVENTS</p>
        <h1 className="font-display mt-1 text-3xl">{event.name}</h1>
        <p className="text-content-muted mt-2 text-sm">
          {event.ticketsSold === 0
            ? 'No tickets sold yet.'
            : `${event.ticketsSold} sold · ${formatKobo(event.grossKobo)} taken.`}
          {' · '}
          <Link href={`/events/${event.slug}`} className="underline">
            See the public page
          </Link>
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-content text-sm font-medium">Ticket tiers</h2>
        <TierManager eventId={event.id} tiers={tiers} />
      </div>

      <div className="border-line/10 flex flex-col gap-4 border-t pt-6">
        <h2 className="text-content text-sm font-medium">Details</h2>
        <EventForm
          eventId={event.id}
          initial={{
            name: event.name,
            description: event.description ?? '',
            venue: event.venue ?? '',
            category: event.category ?? '',
            coverUrl: event.coverUrl ?? '',
            startsAtIso: event.startsAt,
          }}
        />
      </div>
    </section>
  );
}
