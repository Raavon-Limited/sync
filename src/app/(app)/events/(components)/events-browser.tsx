/**
 * Events listing, from the database.
 *
 * PRICE IS DERIVED FROM TIERS, NOT STORED ON THE EVENT
 *   An event has no single price   it has tiers. "From ₦2,000" is the cheapest
 *   available one, computed here. An event with no tiers shows "Tickets at the
 *   door" rather than ₦0, which would read as free.
 *
 * SOLD OUT IS ALSO DERIVED
 *   Every capped tier full, and none uncapped. The mock carried a `soldOut`
 *   boolean an editor had to remember to set; this cannot drift from the
 *   tickets actually issued.
 *
 * NO LINEUP
 *   `src/lib/event.ts` carried a `lineup` array of artists with avatars. There
 *   is no schema for it, so it is not rendered rather than faked. Adding it
 *   means an `event_lineup` table.
 */
'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { CalendarDays, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useEvents } from '@/modules/events/hooks';
import { fetchEventTiers } from '@/modules/events/queries';
import type { SyncEvent, TicketTier } from '@/modules/events/queries';

const db = () => createClient();
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;

function when(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
  };
}

function priceLabel(tiers: TicketTier[]) {
  if (!tiers.length) return 'Tickets at the door';
  const open = tiers.filter((t) => t.isAvailable);
  if (!open.length) return 'Sold out';
  const cheapest = Math.min(...open.map((t) => t.priceKobo));
  return cheapest === 0 ? 'Free' : `From ${naira(cheapest)}`;
}

export function EventsBrowser() {
  const { data: events = [], isLoading } = useEvents({ upcomingOnly: true, pageSize: 40 });

  // One tier query per event. They are small, cached independently, and this
  // keeps a slow tier lookup from blocking the whole listing.
  const tierQueries = useQueries({
    queries: events.map((e) => ({
      queryKey: ['events', 'tiers', e.id] as const,
      queryFn: () => fetchEventTiers(db(), e.id),
    })),
  });

  const cards = useMemo(
    () =>
      events.map((e: SyncEvent, i) => {
        const tiers = tierQueries[i]?.data ?? [];
        const w = when(e.startsAt);
        return {
          event: e,
          tiers,
          ...w,
          price: priceLabel(tiers),
          soldOut: tiers.length > 0 && tiers.every((t) => !t.isAvailable),
        };
      }),
    [events, tierQueries],
  );

  const featured = cards.slice(0, 3);

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-64 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!events.length) {
    return (
      <p className="text-content-muted border-line/10 rounded-2xl border border-dashed p-10 text-center text-sm">
        Nothing coming up yet. Events show here as soon as they are published.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {featured.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-content-muted font-mono text-sm tracking-wide">HAPPENING SOON</h2>
          <div className="flex snap-x gap-3 overflow-x-auto pb-2">
            {featured.map((c) => (
              <Link
                key={c.event.id}
                href={`/events/${c.event.slug}`}
                className="border-line/10 bg-panel hover:border-line/25 relative w-72 shrink-0 snap-start overflow-hidden rounded-2xl border transition-colors"
              >
                <div className="relative h-40">
                  {c.event.coverUrl ? (
                    <Image src={c.event.coverUrl} alt={c.event.name} fill sizes="288px" className="object-cover" />
                  ) : (
                    <div className="bg-surface-deep text-content-muted flex h-full items-center justify-center text-xs">
                      No poster
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <p className="text-content truncate font-medium">{c.event.name}</p>
                  <p className="text-content-muted text-xs">
                    {c.date} · {c.time}
                  </p>
                  <p className="text-lime-deep text-xs font-medium">{c.price}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">ALL EVENTS</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.event.id}
              href={`/events/${c.event.slug}`}
              className="border-line/10 bg-panel hover:border-line/25 flex flex-col overflow-hidden rounded-2xl border transition-colors"
            >
              <div className="border-line/10 relative h-36 border-b">
                {c.event.coverUrl ? (
                  <Image src={c.event.coverUrl} alt={c.event.name} fill sizes="(max-width:768px) 100vw, 33vw" className="object-cover" />
                ) : (
                  <div className="bg-surface-deep text-content-muted flex h-full items-center justify-center text-xs">
                    No poster
                  </div>
                )}
                {c.soldOut && (
                  <Badge className="absolute top-2 right-2 bg-rose-500/90 text-white">Sold out</Badge>
                )}
              </div>
              <div className="flex flex-col gap-1 p-4">
                <span className="flex items-start justify-between gap-2">
                  <h3 className="text-content font-medium">{c.event.name}</h3>
                  {c.event.category && (
                    <Badge className="bg-ink/5 text-content-muted shrink-0 capitalize">
                      {c.event.category}
                    </Badge>
                  )}
                </span>
                <p className="text-content-muted flex items-center gap-1 text-xs">
                  <CalendarDays className="size-3 shrink-0" />
                  {c.date} · {c.time}
                </p>
                <p className="text-content-muted flex items-center gap-1 text-xs">
                  <MapPin className="size-3 shrink-0" />
                  {c.event.venue ?? 'Venue to be announced'}
                </p>
                <p className="text-content mt-auto pt-2 font-semibold">{c.price}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
