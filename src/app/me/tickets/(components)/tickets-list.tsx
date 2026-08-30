/**
 * The student's tickets, split by whether they can still be scanned.
 *
 * THREE STATES, NOT TWO
 *   The old page filtered to 'valid' and 'used' only. The table also allows
 *   'refunded', and a refunded ticket that renders nowhere simply vanishes from
 *   the student's view — which is exactly when they want to see it. It is
 *   grouped with used under "no longer valid", labelled for what it is.
 */
'use client';

import { useMemo } from 'react';
import { TicketCard, type StudentTicket } from '../../(components)/EventsTickets';
import { useMyTickets } from '@/modules/events/hooks';

const dayLabel = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '—';

export function TicketsList() {
  const { data: tickets = [], isLoading } = useMyTickets({ pageSize: 100 });

  const { valid, spent } = useMemo(() => {
    const cards: StudentTicket[] = tickets.map((t) => ({
      id: t.id,
      eventName: t.eventName ?? 'Event',
      reference: t.reference,
      date: dayLabel(t.eventStartsAt),
      venue: t.eventVenue ?? '—',
      type: t.tier ?? 'General',
      price: t.priceKobo / 100,
      status: t.status,
    }));
    return {
      valid: cards.filter((c) => c.status === 'valid'),
      spent: cards.filter((c) => c.status !== 'valid'),
    };
  }, [tickets]);

  if (isLoading) {
    return (
      <section className="flex max-w-3xl flex-col gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-28 animate-pulse rounded-xl" />
        ))}
      </section>
    );
  }

  return (
    <section className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">
          VALID · {valid.length}
        </h2>
        <div className="flex flex-col gap-3">
          {valid.length === 0 && (
            <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
              No tickets yet. Buy one from an event and it appears here.
            </p>
          )}
          {valid.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">
          NO LONGER VALID · {spent.length}
        </h2>
        <div className="flex flex-col gap-3">
          {spent.length === 0 && (
            <p className="text-content-muted py-4 text-center text-sm">Nothing used or refunded.</p>
          )}
          {spent.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      </div>
    </section>
  );
}
