/**
 * What is happening across campus, area by area.
 *
 * Discovery elsewhere is location-first   students see the stores near them.
 * This is the other half: somewhere to look before walking to Tanke to find
 * everything shut, or to notice that the new place in Gaa Akanbi exists.
 *
 * EVERY FIGURE HERE IS AN AGGREGATE
 *   No student, order or amount appears, and none is available to appear:
 *   `campus_pulse` computes this on read and returns buckets. Busyness is
 *   "steady", never "17 orders"   an exact count is a vendor's takings.
 *
 * SUPPRESSION IS SHOWN, NOT HIDDEN
 *   An area with orders but too few distinct customers to publish a trend says
 *   so. Rendering an empty list instead would read as "nobody buys anything
 *   here", which is both wrong and discouraging.
 */
'use client';

import Link from 'next/link';
import { Flame, Sparkles, Store, TrendingUp } from 'lucide-react';
import { Badge, Spinner } from '@/components/ui';
import { useCampusPulse } from '@/modules/around/hooks';
import type { AreaPulse } from '@/modules/around/types';

const BUSY: Record<AreaPulse['busyness'], { label: string; className: string }> = {
  busy: { label: 'Busy', className: 'bg-amber-500/10 text-amber-600' },
  steady: { label: 'Steady', className: 'bg-emerald-500/10 text-emerald-600' },
  quiet: { label: 'Quiet', className: 'bg-ink/5 text-content-muted' },
};

export function CampusPulse() {
  const { data: areas = [], isPending, error } = useCampusPulse();

  if (isPending) return <Spinner />;
  if (error) {
    // The raw message used to be printed to the page. On a public feed that
    // published database internals - a signed-out visitor was shown
    // "permission denied for function campus_pulse", which names an
    // implementation detail, reads as broken, and tells them nothing they can
    // act on. The real error goes to the console for us; the page gets copy.
    if (process.env.NODE_ENV !== 'production') {
      console.error('[campus-pulse] load failed:', error);
    }
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-sm">
        Campus activity isn&rsquo;t available right now.
      </p>
    );
  }
  if (areas.length === 0) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-sm">
        No areas have a live store yet.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-content-muted font-mono text-sm tracking-wide">AROUND CAMPUS</h2>
        <p className="text-content-muted mt-1 text-xs">
          Busiest first. Counts are grouped, never exact.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {areas.map((a) => (
          <article key={a.area} className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-content font-medium">{a.area}</h3>
              <Badge className={`gap-1 ${BUSY[a.busyness].className}`}>
                <Flame className="size-3" />
                {BUSY[a.busyness].label}
              </Badge>
            </header>

            <p className="text-content-muted flex items-center gap-2 text-xs">
              <Store className="size-3 shrink-0" />
              {/* The number that decides whether it is worth going. */}
              {a.stores.open} of {a.stores.total} open
              {a.stores.onCooldown > 0 && ` · ${a.stores.onCooldown} on a short break`}
            </p>

            {a.trending.length > 0 && (
              <p className="text-content-muted flex flex-wrap items-center gap-1.5 text-xs">
                <TrendingUp className="size-3 shrink-0" />
                {a.trending.map((t) => (
                  <Badge key={t.name} className="bg-ink/5 text-content-muted">
                    {t.name}
                  </Badge>
                ))}
              </p>
            )}

            {a.trendingSuppressed && (
              <p className="text-content-muted/70 text-xs">
                Not enough orders here yet to show what is popular.
              </p>
            )}

            {a.newStores.length > 0 && (
              <p className="text-content-muted flex flex-wrap items-center gap-1.5 text-xs">
                <Sparkles className="size-3 shrink-0" />
                New:
                {a.newStores.slice(0, 3).map((s) => (
                  <Link
                    key={s.slug}
                    href={`/food/${s.slug}`}
                    className="text-lime-deep underline underline-offset-2"
                  >
                    {s.name}
                  </Link>
                ))}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
