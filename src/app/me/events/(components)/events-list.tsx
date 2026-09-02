/**
 * The student's events, split by whether they have happened.
 *
 * "ATTENDING" IS NOT MODELLED YET
 *   The old page read a mock where each event carried the student's own status.
 *   The database has no attendance link   `events` is a catalogue and `tickets`
 *   is what ties a student to one. So this lists events the student HOLDS A
 *   TICKET FOR, which is the closest true statement, and falls back to the
 *   upcoming catalogue when they hold none.
 */
'use client';

import { useMemo } from 'react';
import { EventRow, type StudentEvent } from '../../(components)/EventsTickets';
import { useEvents, useMyTickets } from '@/modules/events/hooks';

const dayLabel = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : ' ';
const timeLabel = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : ' ';

export function EventsList() {
  const { data: tickets = [], isLoading: lt } = useMyTickets({ pageSize: 50 });
  const { data: catalogue = [], isLoading: le } = useEvents({ upcomingOnly: true, pageSize: 10 });

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const mine: StudentEvent[] = tickets.map((t) => ({
      id: t.id,
      name: t.eventName ?? 'Event',
      venue: t.eventVenue ?? ' ',
      date: dayLabel(t.eventStartsAt),
      time: timeLabel(t.eventStartsAt),
      // A ticket that has been scanned, or an event whose start has passed.
      status:
        t.status === 'used' || (t.eventStartsAt && new Date(t.eventStartsAt).getTime() < now)
          ? 'attended'
          : 'upcoming',
    }));

    if (mine.length) {
      return {
        upcoming: mine.filter((e) => e.status === 'upcoming'),
        past: mine.filter((e) => e.status === 'attended'),
      };
    }

    // No tickets: show what is on, so the page is useful rather than blank.
    return {
      upcoming: catalogue.map((e) => ({
        id: e.id,
        name: e.name,
        venue: e.venue ?? ' ',
        date: dayLabel(e.startsAt),
        time: timeLabel(e.startsAt),
        status: 'upcoming' as const,
      })),
      past: [] as StudentEvent[],
    };
  }, [tickets, catalogue]);

  const isLoading = lt || le;

  return (
    <section className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">
          UPCOMING · {upcoming.length}
        </h2>
        <div className="border-line/15 rounded-2xl border border-dashed px-4">
          {isLoading && <div className="bg-ink/5 my-3 h-14 animate-pulse rounded-lg" />}
          {!isLoading && upcoming.length === 0 && (
            <p className="text-content-muted py-6 text-center text-sm">
              Nothing coming up. Events you buy tickets for show here.
            </p>
          )}
          {upcoming.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">PAST · {past.length}</h2>
        <div className="border-line/15 rounded-2xl border border-dashed px-4">
          {!isLoading && past.length === 0 && (
            <p className="text-content-muted py-6 text-center text-sm">Nothing attended yet.</p>
          )}
          {past.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      </div>
    </section>
  );
}
