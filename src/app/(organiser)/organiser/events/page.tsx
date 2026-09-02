/**
 * ROUTE: /organiser/events
 * ACCESS: role=event_manager, enforced by the proxy.
 * PURPOSE: Everything they have listed, what it has sold, and the way to list
 *          another one.
 *
 * MOVED OFF THE ROOT. /organiser is the overview now   a dashboard whose front
 * page is a list has nowhere to put the things that are true of the whole
 * account: whether they are verified, what is in the wallet, what is held.
 *
 * SPLIT BY WHEN, because that is the only split that changes what you can do.
 * An event still to come can be edited, priced and pulled; a past one is a
 * record. Sorting them into one list by date buries the two that need work
 * under a term's worth of history.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMyEvents, type OrganiserEvent } from '@/modules/events/organiser-queries';
import { formatKobo } from '@/lib/utils/format';
import { ListEventSheet } from '../(components)/list-event-sheet';

export const metadata: Metadata = { title: 'Your events' };

export default async function Page() {
  const events = await getMyEvents();
  const upcoming = events.filter((e) => e.upcoming);
  const past = events.filter((e) => !e.upcoming);

  const gross = events.reduce((sum, e) => sum + e.grossKobo, 0);
  const sold = events.reduce((sum, e) => sum + e.ticketsSold, 0);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-content-muted font-mono text-sm tracking-wide">YOUR EVENTS</p>
          <h1 className="font-display mt-1 text-3xl">
            What you have <span className="text-lime-deep">on.</span>
          </h1>
          <p className="text-content-muted mt-2 text-sm">
            {events.length === 0
              ? 'Nothing listed yet.'
              : `${events.length} listed · ${sold} ${sold === 1 ? 'ticket' : 'tickets'} sold · ${formatKobo(gross)} taken`}
          </p>
        </div>
        {/* A panel, not a trip to /organiser/events/new   the list behind it is
            the thing being added to, and it should stay on screen. The route
            still exists for a direct link. */}
        <ListEventSheet>
          <Button size="lg">
            <CalendarPlus aria-hidden="true" />
            List an event
          </Button>
        </ListEventSheet>
      </div>

      {events.length === 0 ? (
        <div className="border-line/10 rounded-xl border border-dashed p-10 text-center">
          <p className="text-content text-sm font-medium">Your first one goes here</p>
          <p className="text-content-muted mx-auto mt-2 max-w-prose text-sm">
            List it with a name, a time and a venue. It appears on /events immediately; add ticket
            tiers afterwards, or leave it free.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Group title="Still to come" rows={upcoming} empty="Nothing coming up." />
          <Group title="Already past" rows={past} empty="" />
        </div>
      )}
    </section>
  );
}

function Group({ title, rows, empty }: { title: string; rows: OrganiserEvent[]; empty: string }) {
  if (rows.length === 0 && !empty) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-content text-sm font-medium">
        {title} <span className="text-content-muted font-normal">· {rows.length}</span>
      </h2>

      {rows.length === 0 ? (
        <p className="text-content-muted text-sm">{empty}</p>
      ) : (
        <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
          {rows.map((e) => (
            <Link
              key={e.id}
              href={`/organiser/events/${e.id}`}
              className="hover:bg-ink/5 flex flex-wrap items-center gap-3 px-4 py-3 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-content text-sm font-medium">{e.name}</p>
                <p className="text-content-muted text-xs">
                  {new Date(e.startsAt).toLocaleString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {e.venue ? ` · ${e.venue}` : ''}
                </p>
              </div>
              <p className="text-content-muted shrink-0 text-xs">
                {e.ticketsSold === 0
                  ? 'no tickets sold'
                  : `${e.ticketsSold} sold · ${formatKobo(e.grossKobo)}`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
