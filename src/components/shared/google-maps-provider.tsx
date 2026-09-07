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

import { useSyncExternalStore, type ReactNode } from 'react';
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

/**
 * A map surface needs BOTH a key and a Map ID; the Places autocomplete needs
 * only the key.
 *
 * "A visible failure rather than a silent downgrade" is what the comment above
 * promised, and production was not keeping it. With no Map ID set, `mapId`
 * went to Google as an empty string: Maps logged "The map is initialized
 * without a valid Map ID", refused every Advanced Marker, and painted its own
 * "This page can't load Google Maps correctly" dialog on top. /around then
 * rendered a map of Malete with none of our pins on it   under a heading that
 * says "Tap a pin"   and the only thing on screen addressed the operator
 * rather than the student.
 *
 * An empty Map ID is now the same unconfigured state a missing key is, and it
 * degrades to <MapUnavailable /> like one.
 */
export const googleMapsRenderable = googleMapsConfigured && GOOGLE_MAP_ID.length > 0;

/**
 * Google's own handling of a rejected key is to paint the map grey and drop a
 * white "This page can't load Google Maps correctly / Do you own this website?"
 * dialog on top of it - unstyled, un-dismissable, and addressed to us rather
 * than to the person holding the phone.
 *
 * The Maps JS API calls `window.gm_authFailure` when that happens, so we take
 * it over and swap in our own panel instead. The causes are all Cloud console
 * settings, never code: the Maps JavaScript API not enabled on the project,
 * billing not enabled, or an HTTP-referrer restriction that doesn't list the
 * origin you're loading from (a LAN IP like http://192.168.x.x:3000 when
 * testing on a phone is the usual one - localhost being allowed does not cover
 * it). The real reason is always printed to the browser console by Google.
 */
declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

/**
 * The hook that used to install this did it in a `useEffect`, and it lost two
 * races it had no way to win.
 *
 * Child effects run before parent effects, so <APIProvider> had already
 * injected the loader script by the time the provider's own effect assigned
 * the handler   and on unmount the cleanup put `undefined` back, so a page
 * with two maps could tear the handler down while the other one still needed
 * it. Whenever the assignment lost, Google fell back to painting its own
 * un-dismissable "This page can't load Google Maps correctly / Do you own this
 * website?" dialog over the tiles: a message addressed to us, shown to the
 * student.
 *
 * So it is installed once at module scope   this file is imported before any
 * map can mount, which is earlier than any effect can run   and it is never
 * uninstalled. Components subscribe instead of assigning.
 */
let authFailed = false;
const authSubscribers = new Set<() => void>();

if (typeof window !== 'undefined') {
  const previous = window.gm_authFailure;
  window.gm_authFailure = () => {
    authFailed = true;
    for (const notify of authSubscribers) notify();
    previous?.();
  };
}

function subscribeToAuthFailure(notify: () => void): () => void {
  authSubscribers.add(notify);
  return () => {
    authSubscribers.delete(notify);
  };
}

/**
 * `useSyncExternalStore` rather than state-plus-effect because that is exactly
 * what this is: a value owned by something outside React (the Maps loader),
 * which may already have failed before the component ever mounts. It reads the
 * current value on subscribe instead of needing an effect to catch up, and the
 * server snapshot is `false`   nothing has failed during a render that has no
 * `window`.
 */
function useMapsAuthFailure(): boolean {
  return useSyncExternalStore(
    subscribeToAuthFailure,
    () => authFailed,
    () => false,
  );
}

export function GoogleMapsProvider({
  children,
  fallback = null,
  needsMapId = true,
}: {
  children: ReactNode;
  /** Rendered instead of the map when Maps is not usable. */
  fallback?: ReactNode;
  /**
   * Whether these children draw a map. Default true, because almost all of
   * them do. The address autocomplete is the exception: it talks to Places,
   * which has no Map ID and no map, so a missing one must not silently turn
   * the field into a plain input.
   */
  needsMapId?: boolean;
}) {
  const authFailed = useMapsAuthFailure();
  const usable = needsMapId ? googleMapsRenderable : googleMapsConfigured;

  if (!usable || authFailed) return <>{fallback}</>;

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
      <p className="text-content-muted max-w-72 text-center text-sm">
        {process.env.NODE_ENV === 'development'
          ? !googleMapsConfigured
            ? 'Map unavailable: set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local.'
            : !GOOGLE_MAP_ID
              ? 'Map unavailable: set NEXT_PUBLIC_GOOGLE_MAPS_ID. Advanced Markers - every pin we draw - need a Map ID, and an empty one makes Google reject the map outright.'
              : 'Map unavailable: Google rejected the API key. Check the browser console - usually the Maps JavaScript API is not enabled on the project, billing is off, or the key’s HTTP-referrer list does not include this origin.'
          : 'The map is unavailable right now.'}
      </p>
    </div>
  );
}
