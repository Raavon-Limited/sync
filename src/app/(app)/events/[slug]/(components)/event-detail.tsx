/**
 * One event: what it is, when, where, and what it costs.
 *
 * PURCHASE IS DISABLED, AND SAYS WHY
 *   `tickets` has no insert policy and there is no purchase RPC — issuing a
 *   ticket means taking money, and payment verification belongs in the Paystack
 *   webhook (see 20260824100000_event_ticket_tiers). A button that looked
 *   buyable and silently did nothing would be worse than one that states the
 *   position, so prices are shown and buying is explicitly unavailable.
 */
'use client';

import Image from 'next/image';
import { notFound } from 'next/navigation';
import { CalendarDays, MapPin, Ticket as TicketIcon } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { useEvent, useEventTiers } from '@/modules/events/hooks';

const naira = (kobo: number) => (kobo === 0 ? 'Free' : `₦${(kobo / 100).toLocaleString('en-NG')}`);

export function EventDetail({ slug }: { slug: string }) {
  const { data: event, isLoading, isError } = useEvent(slug);
  const { data: tiers = [], isLoading: tiersLoading } = useEventTiers(event?.id);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-ink/5 h-64 w-full animate-pulse rounded-2xl" />
        <div className="bg-ink/5 h-6 w-1/3 animate-pulse rounded" />
      </div>
    );
  }
  if (isError || !event) notFound();

  const starts = new Date(event.startsAt);
  const soldOut = tiers.length > 0 && tiers.every((t) => !t.isAvailable);

  return (
    <div className="flex flex-col gap-6">
      <div className="border-line/10 relative h-64 overflow-hidden rounded-2xl border md:h-80">
        {event.coverUrl ? (
          <Image src={event.coverUrl} alt={event.name} fill sizes="100vw" className="object-cover" />
        ) : (
          <div className="bg-surface-deep text-content-muted flex h-full items-center justify-center text-sm">
            No poster yet
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-section text-content">{event.name}</h1>
          {event.category && (
            <Badge className="bg-ink/5 text-content-muted capitalize">{event.category}</Badge>
          )}
          {soldOut && <Badge className="bg-rose-500/90 text-white">Sold out</Badge>}
        </div>
        <p className="text-content-muted flex items-center gap-1 text-sm">
          <CalendarDays className="size-4" />
          {starts.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {' · '}
          {starts.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-content-muted flex items-center gap-1 text-sm">
          <MapPin className="size-4" />
          {event.venue ?? 'Venue to be announced'}
        </p>
      </div>

      {event.description && (
        <section className="flex flex-col gap-2">
          <h2 className="text-content text-lg font-semibold">About</h2>
          <p className="text-content-muted max-w-2xl text-sm leading-relaxed">{event.description}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-content flex items-center gap-2 text-lg font-semibold">
          <TicketIcon className="size-4" /> Tickets
        </h2>

        {tiersLoading && <div className="bg-ink/5 h-20 animate-pulse rounded-xl" />}

        {!tiersLoading && tiers.length === 0 && (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-sm">
            No tickets listed for this event — pay at the door.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {tiers.map((t) => (
            <div
              key={t.id}
              className={`border-line/10 bg-panel flex flex-col gap-1 rounded-xl border p-4 ${
                t.isAvailable ? '' : 'opacity-60'
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-content font-medium">{t.name}</span>
                <span className="text-content font-semibold">{naira(t.priceKobo)}</span>
              </span>
              {t.description && <p className="text-content-muted text-xs">{t.description}</p>}
              <p className="text-content-muted text-xs">
                {/* Uncapped tiers have nothing useful to count down. */}
                {t.quantity == null
                  ? 'Unlimited'
                  : t.isAvailable
                    ? `${t.remaining} of ${t.quantity} left`
                    : 'Sold out'}
              </p>
            </div>
          ))}
        </div>

        {tiers.length > 0 && (
          <div className="border-line/10 rounded-xl border border-dashed p-4">
            <Button disabled className="w-full">
              Buying not available yet
            </Button>
            <p className="text-content-muted mt-2 text-xs">
              Ticket payments are not wired up yet. Prices above are live; checkout arrives with the
              payment integration.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
