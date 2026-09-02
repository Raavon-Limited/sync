/**
 * Hotspots   curated places around campus.
 *
 * CURATED, NOT TRANSACTIONAL
 *   A hotspot is editorial content: somewhere to know about, not something to
 *   buy. There is no booking, no cart and no vendor behind it, so the card
 *   stops at "where is it and is it open".
 */
'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, Star, Clock } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useHotspots } from '@/modules/hotspots/hooks';

/** Postgres `time` is "HH:MM:SS"; people read "7am". */
function clock(t?: string | null) {
  if (!t) return null;
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr);
  if (Number.isNaN(h)) return null;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const m = Number(mStr ?? 0);
  return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
}

export function HotspotsList() {
  const [category, setCategory] = useState<string | null>(null);
  const { data: hotspots = [], isLoading } = useHotspots({ pageSize: 60 });

  // Categories are a free-text column, not a lookup table, so the filter row is
  // built from what actually exists rather than a hardcoded list that could
  // drift from the data.
  const categories = useMemo(
    () => [...new Set(hotspots.map((h) => h.category).filter(Boolean))].sort(),
    [hotspots],
  );

  const visible = useMemo(
    () => (category ? hotspots.filter((h) => h.category === category) : hotspots),
    [hotspots, category],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">HOTSPOTS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Places worth <span className="text-lime-deep">knowing about.</span>
        </h2>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              category === null
                ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
                : 'border-line/10 text-content-muted hover:text-content'
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
                category === c
                  ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
                  : 'border-line/10 text-content-muted hover:text-content'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-ink/5 h-56 animate-pulse rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && visible.length === 0 && (
        <p className="text-content-muted border-line/10 rounded-2xl border border-dashed p-10 text-center text-sm">
          No hotspots published yet.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((h) => {
          const opens = clock(h.opensAt);
          const closes = clock(h.closesAt);
          return (
            <Link
              key={h.id}
              href={`/hotspots/${h.slug}`}
              className="border-line/10 bg-panel hover:border-line/25 flex flex-col overflow-hidden rounded-2xl border transition-colors"
            >
              <div className="border-line/10 relative h-36 border-b">
                {h.imageUrl ? (
                  <Image
                    src={h.imageUrl}
                    alt={h.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="bg-surface-deep text-content-muted flex h-full items-center justify-center text-xs">
                    No photo
                  </div>
                )}
                {h.isFeatured && (
                  <Badge className="bg-lime text-ink absolute top-2 left-2 gap-1">
                    <Star className="size-3" /> Featured
                  </Badge>
                )}
              </div>

              <div className="flex flex-col gap-1 p-4">
                <span className="flex items-center gap-2">
                  <h3 className="text-content truncate font-medium">{h.name}</h3>
                  <Badge className="bg-ink/5 text-content-muted shrink-0 capitalize">
                    {h.category}
                  </Badge>
                </span>
                <p className="text-content-muted flex items-center gap-1 text-xs">
                  <MapPin className="size-3 shrink-0" />
                  {h.address ?? h.area ?? 'Location not given'}
                </p>
                {opens && closes && (
                  <p className="text-content-muted flex items-center gap-1 text-xs">
                    <Clock className="size-3 shrink-0" />
                    {opens} – {closes}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
