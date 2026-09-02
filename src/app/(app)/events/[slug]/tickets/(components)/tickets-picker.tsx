/**
 * Step 1 of buying tickets: choose tiers and quantities.
 *
 * TIERS COME FROM event_ticket_tiers
 *   Was reading a hardcoded `events` array where each event carried its own
 *   ticket list. Prices, names and availability are now the ones the organiser
 *   actually set.
 *
 * A SOLD-OUT TIER IS SHOWN, NOT HIDDEN
 *   Hiding it makes a student think the price changed or the event moved. It
 *   renders disabled and says why.
 */
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoveLeft, Minus, Plus } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { useEvent, useEventTiers } from '@/modules/events/hooks';

const naira = (kobo: number) => (kobo === 0 ? 'Free' : `₦${(kobo / 100).toLocaleString('en-NG')}`);

/** Matches purchase_tickets, which caps a single call at 10. */
const MAX_PER_TIER = 10;

export function TicketsPicker({ slug }: { slug: string }) {
  const router = useRouter();
  const { data: event, isLoading } = useEvent(slug);
  const { data: tiers = [], isLoading: tl } = useEventTiers(event?.id);
  const [qty, setQty] = useState<Record<string, number>>({});

  const total = useMemo(
    () =>
      tiers.reduce((sum, t) => sum + (qty[t.id] ?? 0) * t.priceKobo, 0),
    [tiers, qty],
  );
  const count = Object.values(qty).reduce((s, n) => s + n, 0);

  if (isLoading || tl) {
    return <div className="bg-ink/5 h-64 animate-pulse rounded-2xl" />;
  }
  if (!event) return null;

  function bump(id: string, delta: number, max: number) {
    setQty((prev) => {
      const next = Math.max(0, Math.min(max, (prev[id] ?? 0) + delta));
      return { ...prev, [id]: next };
    });
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-6 sm:px-5 sm:py-8">
      <Link
        href={`/events/${event.slug}`}
        className="text-content-muted hover:text-content mb-4 inline-flex items-center gap-2 text-sm"
      >
        <MoveLeft className="size-4" /> Back to event
      </Link>

      <h1 className="font-display text-content text-2xl">{event.name}</h1>
      <p className="text-content-muted mt-1 text-sm">Choose your tickets</p>

      <div className="mt-6 flex flex-col gap-3">
        {tiers.length === 0 && (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-sm">
            No tickets on sale for this event   pay at the door.
          </p>
        )}

        {tiers.map((t) => {
          // Never offer more than remain, and never more than the RPC accepts.
          const cap = t.quantity == null ? MAX_PER_TIER : Math.min(MAX_PER_TIER, t.remaining ?? 0);
          const n = qty[t.id] ?? 0;
          return (
            <div
              key={t.id}
              className={`border-line/10 bg-panel flex flex-wrap items-center gap-3 rounded-xl border p-4 ${
                t.isAvailable ? '' : 'opacity-60'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-content flex items-center gap-2 font-medium">
                  {t.name}
                  {!t.isAvailable && (
                    <Badge className="bg-rose-500/10 text-rose-600">Sold out</Badge>
                  )}
                </p>
                {t.description && <p className="text-content-muted text-xs">{t.description}</p>}
                <p className="text-content-muted text-xs">
                  {t.quantity == null ? 'Unlimited' : `${t.remaining} left`}
                </p>
              </div>

              <p className="text-content font-semibold">{naira(t.priceKobo)}</p>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="size-8 p-0"
                  disabled={!t.isAvailable || n === 0}
                  onClick={() => bump(t.id, -1, cap)}
                  aria-label={`One fewer ${t.name}`}
                >
                  <Minus className="size-4" />
                </Button>
                <span className="text-content w-6 text-center text-sm">{n}</span>
                <Button
                  variant="outline"
                  className="size-8 p-0"
                  disabled={!t.isAvailable || n >= cap}
                  onClick={() => bump(t.id, 1, cap)}
                  aria-label={`One more ${t.name}`}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {count > 0 && (
        <div className="border-line/10 bg-panel mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <span className="text-content-muted text-sm">
            {count} ticket{count === 1 ? '' : 's'}
          </span>
          <span className="text-content text-lg font-semibold">{naira(total)}</span>
          <Button
            onClick={() => {
              // Selection travels in the URL   the next step rebuilds the same
              // summary from it, so there is no cart to keep in sync.
              const sel = Object.entries(qty)
                .filter(([, n]) => n > 0)
                .map(([id, n]) => `${id}:${n}`)
                .join(',');
              router.push(`/events/${event.slug}/tickets/contact?sel=${encodeURIComponent(sel)}`);
            }}
          >
            Continue
          </Button>
        </div>
      )}
    </section>
  );
}
