/**
 * SyncTagline - "Connect · Search · Sync" as the display headline.
 *
 * Three treatments, one line:
 *   - middot separators rather than full stops
 *   - Connect and Search sit on a BLOBBY lime brush stroke, not a CSS underline
 *   - Sync sits under a BLOBBY SLANTED lime band. Where the band covers the
 *     letters they read Ink; where it doesn't they read the foreground colour.
 *
 * Everything lime here is an organic shape, so nothing in the headline is a
 * straight machine edge. Both shapes are SVG clip paths in objectBoundingBox
 * units, which is what lets one path stretch correctly across words of
 * different widths and any type size. `clip-path: polygon()` has no curves, so
 * a blob would either facet visibly at 68px or need dozens of points.
 *
 * How the two-tone "Sync" works: the word is rendered twice in the same box.
 * The lower copy is the plain foreground text. The upper copy carries the lime
 * background AND Ink text, and is clipped to the blob - so the clip reveals the
 * plain copy outside the band and the Ink-on-lime copy inside it. Both copies
 * share identical padding so their glyphs land on the same pixels; change one
 * padding value and you must change the other.
 *
 * ON "WHITE": the brief said the uncovered part should be white. This uses
 * `text-foreground`, which resolves to Cream on Ink surfaces (i.e. white, as
 * asked) but to Ink on Cream ones. Hardcoding white would make the word
 * invisible on the light landing hero, which sits on a cream scrim. Swap
 * `text-foreground` for `text-cream` if the headline is only ever on dark.
 */
'use client';

import { useId } from 'react';

import { cn } from '@/lib/utils';

/**
 * The band over "Sync", in objectBoundingBox units (0-1 across the word's box).
 *
 * EVERY edge is a curve - top, bottom and both sides - so the whole covering
 * shape is organic rather than a straight-cut band with a wavy lid. It still
 * trends upward left-to-right, which is what makes it read as a slant.
 *
 * The coordinates deliberately overshoot past 0 and 1. objectBoundingBox
 * allows that, and it means the shape runs off the sides of the word instead
 * of stopping on a hard vertical edge - the difference between a highlighter
 * stroke passing through and a blob sitting inside a box.
 */
const BLOB = [
  'M -0.06,0.70',
  'C 0.10,0.88 0.26,0.44 0.44,0.49',
  'C 0.62,0.54 0.74,0.20 0.90,0.17',
  'C 1.00,0.15 1.07,0.27 1.06,0.44',
  'C 1.05,0.63 1.10,0.87 1.02,1.04',
  'C 0.86,1.16 0.66,0.98 0.48,1.07',
  'C 0.30,1.15 0.10,1.00 -0.06,1.07',
  'C -0.13,0.93 -0.13,0.83 -0.06,0.70',
  'Z',
].join(' ');

/**
 * The hand-drawn stroke under "Connect" and "Search", same units.
 *
 * The CENTRELINE itself waves - it rides up and down across the word rather
 * than running level with a decorated edge, which is what separates a marker
 * stroke from a rounded bar. The top and bottom edges wave out of phase with
 * each other, so the stroke also thins and thickens as it goes, the way a real
 * pen does when it changes direction. Both ends taper.
 *
 * One path serves both words: objectBoundingBox stretches it to whatever width
 * each happens to be.
 */
const STROKE = [
  // Top edge, left to right - three crests at different heights.
  'M 0.00,0.58',
  'C 0.09,0.20 0.20,0.14 0.32,0.30',
  'C 0.44,0.46 0.53,0.08 0.66,0.18',
  'C 0.79,0.28 0.89,0.05 1.00,0.24',
  // Right end, tapering round.
  'C 1.02,0.40 1.01,0.56 0.98,0.68',
  // Bottom edge, right back to left - out of phase with the top.
  'C 0.86,0.50 0.77,0.88 0.64,0.74',
  'C 0.52,0.61 0.43,0.98 0.30,0.82',
  'C 0.18,0.68 0.09,0.94 0.00,0.58',
  'Z',
].join(' ');

function Dot() {
  return (
    <span aria-hidden="true" className="text-content-muted mx-[0.25em] align-middle">
      ·
    </span>
  );
}

function Stroked({ children, clipId }: { children: React.ReactNode; clipId: string }) {
  return (
    // `isolate` + `-z-10` on the stroke puts it BEHIND the glyphs. It is a
    // sibling rendered after the text, so without that it paints over the
    // letters and clips their descenders - and the taller box a wave needs
    // makes that overlap certain rather than possible.
    <span className="relative isolate inline-block">
      {children}
      {/* Sized in em so the stroke scales with the type instead of needing a
          value per breakpoint. It is taller than a rule would be because the
          centreline travels - a 0.13em box would flatten the wave out. */}
      <span
        aria-hidden="true"
        className="bg-lime absolute inset-x-[-0.04em] bottom-[-0.02em] -z-10 h-[0.22em]"
        style={{ clipPath: `url(#${clipId})` }}
      />
    </span>
  );
}

export function SyncTagline({
  className,
  animateBand = false,
}: {
  className?: string;
  /** Wipe the lime band in left-to-right on mount. Landing hero only. */
  animateBand?: boolean;
}) {
  // Scoped: SVG ids share one document namespace, and this renders three times
  // across the marketing pages. One stroke path is shared by both words.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const blobId = `sync-blob-${uid}`;
  const strokeId = `sync-stroke-${uid}`;

  return (
    // No whitespace-nowrap on the wrapper: at 68px the three words overrun the
    // hero column and "Sync" was clipped by the card beside it. The line may
    // break - but only BETWEEN the groups below, so a separator can never land
    // at the start of a line on its own.
    //
    // `max-w-full` + `wrap-break-word` is the floor under that. The headline is set
    // at 44px on phones, and the groups below are individually nowrap, so on a
    // narrow screen a single word that cannot fit its line had nothing to do but
    // run off the side and push the whole page into horizontal scroll - which is
    // what it was doing on /about. `wrap-break-word` (overflow-wrap) only splits
    // a word when it will not fit a line ALONE, so normal-width screens are
    // untouched and a 320px one gets a broken word instead of a broken layout.
    <span className={cn('block max-w-full wrap-break-word', className)}>
      <span className="whitespace-nowrap">
        <Stroked clipId={strokeId}>Connect</Stroked>
        <Dot />
      </span>
      <span className="whitespace-nowrap">
        <Stroked clipId={strokeId}>Search</Stroked>
        <Dot />
      </span>

      <span className="text-foreground relative isolate inline-block px-[0.08em]">
        Sync

        {/* Two nested clips, because one element cannot carry two clip-paths:
            the OUTER span wipes left-to-right, the INNER one holds the blob.
            Wiping the outer keeps the plain word visible throughout - only the
            band arrives - which is what the old highlight animation did. */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-0',
            // motion-reduce is Tailwind's own variant. Doing this with a
            // hand-written @media rule meant escaping the arbitrary class name
            // in raw CSS, where the brackets parse as an attribute selector and
            // break the stylesheet.
            animateBand && 'animate-[band-wipe_0.7s_ease_0.5s_both] motion-reduce:animate-none',
          )}
        >
          <span
            className="bg-lime text-ink absolute inset-0 px-[0.08em]"
            style={{ clipPath: `url(#${blobId})` }}
          >
            Sync
          </span>
        </span>
      </span>

      {/* Definitions only - never painted. */}
      <svg aria-hidden="true" width="0" height="0" className="absolute h-0 w-0">
        <defs>
          <clipPath id={blobId} clipPathUnits="objectBoundingBox">
            <path d={BLOB} />
          </clipPath>
          <clipPath id={strokeId} clipPathUnits="objectBoundingBox">
            <path d={STROKE} />
          </clipPath>
        </defs>
      </svg>
    </span>
  );
}
