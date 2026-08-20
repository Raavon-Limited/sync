/**
 * GoogleMapsProvider - the single place the Maps JavaScript API gets loaded.
 *
 * Every map in the app mounts inside one of these. The wrapper exists so that
 * the two things a Google map needs - an API key and a Map ID - are read in
 * exactly one file, and so a missing key degrades to readable copy instead of a
 * silently blank rectangle (which is what the raw <Map> renders without one).
 *
 * The key is NEXT_PUBLIC_ by necessity: the Maps JS API runs in the browser, so
 * the key ships in the bundle. That is normal and Google expects it - the thing
 * that protects you is the HTTP-referrer restriction on the key itself, set in
 * the Cloud console. An unrestricted key in a public bundle is someone else's
 * quota to spend, so restrict it before deploying.
 */
'use client';

import type { ReactNode } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';

// Read as full static literals: Next inlines `process.env.NEXT_PUBLIC_*` at
// build time by textual substitution, so a computed lookup like
// `process.env[name]` would come back undefined in the browser.
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID ?? '';

/** True when a key is configured. Callers render a fallback when it isn't. */
export const googleMapsConfigured = API_KEY.length > 0;

/**
 * Map ID, required for Advanced Markers (all our custom pins) and for
 * cloud-based styling.
 *
 * Falls back to Google's public DEMO_MAP_ID in development only, so the map is
 * usable the moment you have a key and before you have created a styled Map ID.
 * The demo ID is rate-limited and logs a console warning - never in production,
 * where a missing ID should be a visible failure rather than a silent downgrade.
 */
export const GOOGLE_MAP_ID =
  MAP_ID || (process.env.NODE_ENV === 'development' ? 'DEMO_MAP_ID' : '');

export function GoogleMapsProvider({
  children,
  fallback = null,
}: {
  children: ReactNode;
  /** Rendered instead of the map when no API key is configured. */
  fallback?: ReactNode;
}) {
  if (!googleMapsConfigured) return <>{fallback}</>;

  return (
    // 'marker' is what Advanced Markers live in. Naming it here loads it with
    // the initial script rather than as a second round-trip once the first
    // <AdvancedMarker> mounts.
    <APIProvider apiKey={API_KEY} libraries={['marker']}>
      {children}
    </APIProvider>
  );
}

/**
 * Shared "this map can't load" panel. Deliberately explains the cause in dev and
 * stays vague in production - a visitor doesn't need to know about our env vars.
 */
export function MapUnavailable({ className }: { className?: string }) {
  return (
    <div
      className={
        className ??
        'border-line/10 bg-surface-deep flex h-full w-full items-center justify-center rounded-2xl border p-6'
      }
    >
      <p className="text-content-muted max-w-64 text-center text-sm">
        {process.env.NODE_ENV === 'development'
          ? 'Map unavailable: set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local.'
          : 'The map is unavailable right now.'}
      </p>
    </div>
  );
}
