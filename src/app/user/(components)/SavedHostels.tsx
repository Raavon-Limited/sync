'use client';

/**
 * The hostels this student actually saved.
 *
 * WHAT IT REPLACES. The dashboard had a "SAVED HOSTELS · 12" heading over
 * `HostelCardListLive`, which queries the PUBLIC CATALOGUE - so it showed the
 * three newest listings on Sync to everybody, and the 12 was the literal
 * constant `savedCount = 12` in the page. The identical component with the
 * identical query then rendered again lower down under "RECENTLY LISTED". One
 * list, twice, under two headings that both misdescribed it.
 *
 * THE COUNT IS THE COUNT NOW, and "N more" only appears when there genuinely
 * are N more.
 */

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Home, MapPin, Plus } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useSavedHostels } from '@/modules/hostels/hooks';

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

export function SavedHostels({
  basePath = '/user',
  limit = 3,
}: {
  basePath?: string;
  limit?: number;
}) {
  const { data, isLoading } = useSavedHostels(limit);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const more = Math.max(0, total - items.length);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">
          SAVED HOSTELS{total > 0 ? ` · ${total}` : ''}
        </h2>
        {total > 0 && (
          <Button
            asChild
            variant="outline"
            className="text-content-muted shrink-0 border-none font-light"
          >
            <Link href={`${basePath}/saved`}>
              Manage <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="bg-ink/5 h-44 animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {/* An empty saved list is a real state and points somewhere useful,
          rather than quietly filling itself with the catalogue. */}
      {!isLoading && items.length === 0 && (
        <Card className="border-line/10 flex flex-col items-start gap-3 border border-dashed p-6">
          <p className="text-content-muted text-sm">
            Nothing saved yet. Tap the heart on a hostel and it waits for you here.
          </p>
          <Button asChild variant="outline">
            <Link href="/hostels">
              Browse hostels <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </Card>
      )}

      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((h) => (
            <Link key={h.id} href={`/hostels?h=${encodeURIComponent(h.slug)}`}>
              <Card className="border-line/10 hover:border-line/25 overflow-hidden border transition-colors">
                <div className="bg-surface-deep relative h-28 w-full">
                  {h.imageUrl ? (
                    <Image
                      src={h.imageUrl}
                      alt={h.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 280px"
                    />
                  ) : (
                    // next/image throws on an empty src, and most listings
                    // still have no photo - so this is an element, not an
                    // <Image> with a blank string.
                    <span
                      aria-hidden="true"
                      className="text-content-muted flex h-full w-full items-center justify-center"
                    >
                      <Home className="size-6" />
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-content truncate text-sm font-medium">{h.name}</p>
                    <p className="text-content shrink-0 font-mono text-sm font-semibold">
                      {naira(h.pricePerSessionKobo)}
                    </p>
                  </div>
                  <p className="text-content-muted flex items-center gap-1 text-xs">
                    <MapPin className="size-3 shrink-0" />
                    {h.area ?? 'Area not set'}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {more > 0 && (
        <Button asChild variant="outline" className="text-content-muted self-start border-none">
          <Link href={`${basePath}/saved`}>
            <Plus className="size-4" />
            {more} more
            <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}
