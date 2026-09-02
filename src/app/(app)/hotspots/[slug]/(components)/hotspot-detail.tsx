/**
 * A single hotspot. Editorial content   no booking, no cart.
 *
 * The map link is an outbound Google Maps URL rather than an embedded map:
 * there is no map component in this app yet, and a coordinate pair a student
 * cannot act on is worse than a link that opens their own maps app.
 */
'use client';

import Image from 'next/image';
import { notFound } from 'next/navigation';
import { MapPin, Clock, Star, Navigation } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { useHotspot } from '@/modules/hotspots/hooks';

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

export function HotspotDetail({ slug }: { slug: string }) {
  const { data: h, isLoading, isError } = useHotspot(slug);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-ink/5 h-64 w-full animate-pulse rounded-2xl" />
        <div className="bg-ink/5 h-6 w-1/3 animate-pulse rounded" />
      </div>
    );
  }
  if (isError || !h) notFound();

  const opens = clock(h.opensAt);
  const closes = clock(h.closesAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="border-line/10 relative h-64 overflow-hidden rounded-2xl border md:h-80">
        {h.imageUrl ? (
          <Image src={h.imageUrl} alt={h.name} fill sizes="100vw" className="object-cover" />
        ) : (
          <div className="bg-surface-deep text-content-muted flex h-full items-center justify-center text-sm">
            No photo yet
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-section text-content">{h.name}</h1>
            <Badge className="bg-ink/5 text-content-muted capitalize">{h.category}</Badge>
            {h.isFeatured && (
              <Badge className="bg-lime text-ink gap-1">
                <Star className="size-3" /> Featured
              </Badge>
            )}
          </div>
          <p className="text-content-muted flex items-center gap-1 text-sm">
            <MapPin className="size-4" />
            {h.address ?? h.area ?? 'Location not given'}
          </p>
          {opens && closes && (
            <p className="text-content-muted flex items-center gap-1 text-sm">
              <Clock className="size-4" />
              {opens} – {closes}
            </p>
          )}
        </div>

        {/* Only when a pin actually exists   see the note on coordinates. */}
        {h.position && (
          <Button asChild variant="outline" className="gap-2">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${h.position.lat},${h.position.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Navigation className="size-4" />
              Directions
            </a>
          </Button>
        )}
      </div>

      {h.description && (
        <section className="flex flex-col gap-2">
          <h2 className="text-content text-lg font-semibold">About</h2>
          <p className="text-content-muted max-w-2xl text-sm leading-relaxed">{h.description}</p>
        </section>
      )}
    </div>
  );
}
