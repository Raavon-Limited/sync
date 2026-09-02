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
import { getEventPayout, getMyEvent, getTiers } from '@/modules/events/organiser-queries';
import { formatKobo } from '@/lib/utils/format';
import { EventForm } from '../../(components)/event-form';
import { TierManager } from '../../(components)/tier-manager';
import { FeeModeToggle } from '../../(components)/fee-mode-toggle';

export const metadata: Metadata = { title: 'Manage event' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const event = await getMyEvent(id);
  if (!event) notFound();

  const [tiers, payout] = await Promise.all([getTiers(id), getEventPayout(id)]);

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

      {/* WHAT IS OWED, AND WHEN - not the same number as gross sales.
          The Sync charge is frozen onto each hold at purchase, so "sold" and
          "yours" differ from the moment a ticket is bought, and showing the
          first while calling it the second is how somebody plans around money
          that is not coming. */}
      <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-content text-sm font-medium">Your money</h2>
          {payout.disputed && (
            <span className="text-coral text-xs">
              A dispute is open - nothing releases until it is resolved
            </span>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-content-muted font-mono text-[11px] tracking-wide uppercase">
              Held for you
            </dt>
            <dd className="text-content text-lg font-medium">{formatKobo(payout.heldKobo)}</dd>
          </div>
          <div>
            <dt className="text-content-muted font-mono text-[11px] tracking-wide uppercase">
              Paid out
            </dt>
            <dd className="text-content text-lg font-medium">{formatKobo(payout.paidKobo)}</dd>
          </div>
          <div>
            <dt className="text-content-muted font-mono text-[11px] tracking-wide uppercase">
              Sync charge
            </dt>
            <dd className="text-content-muted text-lg font-medium">{formatKobo(payout.feeKobo)}</dd>
          </div>
        </dl>

        <p className="text-content-muted text-xs">
          {payout.heldKobo === 0
            ? 'Ticket money is held until the event has happened, then paid out automatically.'
            : payout.disputed
              ? 'Held until the dispute is resolved. Nothing is lost - it releases once staff decide.'
              : payout.nextReleaseAt
                ? `Releases ${new Date(payout.nextReleaseAt).toLocaleString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })} - a day after the event starts, if nobody disputes it.`
                : 'Releases a day after the event starts, if nobody disputes it.'}
        </p>
      </div>

      {/* The cheapest tier on sale is the worked example, because it is the
          number an organiser is most likely to be reasoning about. Zero when
          there are no tiers yet, and the toggle falls back to describing the
          two options rather than pricing them. */}
      <FeeModeToggle
        eventId={event.id}
        feeMode={event.feeMode}
        samplePriceKobo={
          tiers
            .filter((t) => t.isActive && t.priceKobo > 0)
            .sort((a, b) => a.priceKobo - b.priceKobo)[0]?.priceKobo ?? 0
        }
      />

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
