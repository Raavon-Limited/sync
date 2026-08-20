/**
 * AroundMap - client wrapper that lazy-loads the Google map. Kept dynamic with
 * `ssr: false` so the Maps JS loader and the vis.gl bindings stay out of the
 * initial payload for a page that is mostly read before the map is touched.
 * The actual map lives in ./around-map-google.
 */
'use client';

import dynamic from 'next/dynamic';
import type { MapPin } from '@/modules/around/server-queries';

const Map = dynamic(() => import('./around-map-google'), {
  ssr: false,
  loading: () => (
    <div className="border-line/10 bg-surface-deep flex h-[72vh] min-h-104 w-full items-center justify-center rounded-2xl border lg:h-[calc(100dvh-8rem)]">
      <p className="text-content-muted text-sm">Loading map…</p>
    </div>
  ),
});

export function AroundMap({ className, pins = [] }: { className?: string; pins?: MapPin[] }) {
  return (
    <div className={className}>
      <Map pins={pins} />
    </div>
  );
}
