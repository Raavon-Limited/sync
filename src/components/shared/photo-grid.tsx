/**
 * Photographs you can actually look at.
 *
 * WHY THIS EXISTS
 *   Evidence was rendered as 96px thumbnails with `object-cover`, which is a
 *   crop of a crop: a reviewer deciding whether a building matches its listing
 *   was looking at a square inch of it. The one thing this screen is for is
 *   seeing the photograph, and there was no way to.
 *
 *   The same three-line thumbnail block had been copied into the visits queue,
 *   the account detail and HostelFacts, so "make them expandable" meant fixing
 *   it three times. It is one component now.
 *
 * KEYBOARD AND SCREEN READERS GET THE SAME THING
 *   Each thumbnail is a real <button> with a label naming its position, and the
 *   overlay is a Dialog   so Escape closes it and focus returns to the tile that
 *   opened it, both for free. A div with an onClick would have looked identical
 *   and done neither.
 *
 * `object-contain` IN THE OVERLAY, DELIBERATELY. A cover-cropped lightbox is
 * the same failure as the thumbnail, just larger.
 */
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ZoomIn } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui';
import { cn } from '@/lib/utils';

export function PhotoGrid({
  photos,
  /** Used in alt text and the overlay title, e.g. "Agent photo". */
  label,
  className,
  size = 'size-24',
}: {
  photos: string[];
  label: string;
  className?: string;
  size?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {photos.map((src, i) => (
          <button
            key={`${src}-${i}`}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`${label} ${i + 1} of ${photos.length}, open larger`}
            className={cn(
              'border-line/10 group relative overflow-hidden rounded-lg border transition-opacity hover:opacity-90',
              size,
            )}
          >
            <Image
              src={src}
              alt={`${label} ${i + 1}`}
              fill
              sizes="96px"
              className="object-cover"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 grid place-items-center bg-black/0 text-white/0 transition-colors group-hover:bg-black/40 group-hover:text-white"
            >
              <ZoomIn className="size-4" />
            </span>
          </button>
        ))}
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">
            {label} {open !== null ? open + 1 : ''}
          </DialogTitle>
          {open !== null && (
            <div className="flex flex-col gap-3">
              <div className="relative h-[70vh] w-full">
                <Image
                  src={photos[open]}
                  alt={`${label} ${open + 1}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-contain"
                />
              </div>

              {photos.length > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {photos.map((src, i) => (
                    <button
                      key={`nav-${src}-${i}`}
                      type="button"
                      onClick={() => setOpen(i)}
                      aria-label={`Show ${label} ${i + 1}`}
                      aria-current={i === open}
                      className={cn(
                        'relative size-12 overflow-hidden rounded border transition-colors',
                        i === open ? 'border-lime-deep' : 'border-line/20 opacity-60',
                      )}
                    >
                      <Image src={src} alt="" fill sizes="48px" className="object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* The file itself, for the cases a lightbox cannot answer   a
                  reviewer who needs to zoom into a door number. */}
              <a
                href={photos[open]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lime-deep self-center text-xs underline underline-offset-2"
              >
                Open the full image
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
