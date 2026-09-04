/**
 * The walkthrough video, and what to show when it will not play.
 *
 * WHY THIS IS ITS OWN CLIENT COMPONENT
 *   HostelFacts is a server component, and the whole point here is `onError` -
 *   a handler, which a server component cannot carry. It is a small island
 *   rather than making the whole facts panel client-side, because everything
 *   else on that panel is static text a server can render.
 *
 * WHY THE ERROR STATE EXISTS AT ALL
 *   A <video> that cannot load its source does not look broken. It renders its
 *   controls, reports a duration of 0:00, and shows a black rectangle - which
 *   is indistinguishable from a landlord who uploaded a corrupt file, and from
 *   a video that is simply very dark. A reviewer deciding whether a hostel is
 *   real was being asked to tell those apart by looking.
 *
 *   That is not hypothetical: the site CSP shipped with no `media-src`, so
 *   every one of these was blocked by the browser and every one of them looked
 *   like a bad upload. The header is fixed; this is so the next cause of a
 *   blocked video announces itself instead of being mistaken for evidence.
 *
 * THE LINK OUT IS THE RECOVERY PATH
 *   Opening the file directly bypasses whatever the page is doing wrong, and
 *   tells the reviewer in one click whether the file is fine.
 */
'use client';

import { useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';

export function WalkthroughVideo({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={
          className ??
          'border-line/10 bg-surface-deep flex h-40 w-64 flex-col items-center justify-center gap-2 rounded-lg border p-3 text-center'
        }
      >
        <AlertTriangle className="size-5 text-amber-500" />
        <p className="text-content text-xs font-medium">This video would not play</p>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="text-lime-deep flex items-center gap-1 text-xs underline underline-offset-2"
        >
          <ExternalLink className="size-3" /> Open it directly
        </a>
      </div>
    );
  }

  return (
    <video
      src={src}
      controls
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className={className ?? 'border-line/10 h-40 rounded-lg border bg-black'}
    />
  );
}
