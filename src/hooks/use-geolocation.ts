/**
 * useGeolocation - browser position with explicit, inspectable states.
 *
 * Deliberately does NOT auto-prompt on mount. A permission dialog that appears
 * before the user has asked for anything gets denied, and a denial is sticky -
 * the browser won't ask again, so we'd lose "near me" for that user permanently.
 * The caller triggers `request()` from a tap instead.
 *
 * Every failure path resolves to a state the UI can render. Location is always
 * optional in Sync: the `area` filter is the fallback, so a denial degrades to
 * "browse by area" rather than a dead end.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsHydrated } from '@/hooks/use-is-hydrated';

export interface Coords {
  lat: number;
  lng: number;
  /** Accuracy radius in metres, as reported by the device. */
  accuracy: number;
}

export type GeolocationStatus =
  | 'idle' // not asked yet
  | 'prompting' // waiting on the user / the device
  | 'granted'
  | 'denied' // user said no, or a previous denial is remembered
  | 'unavailable' // no navigator.geolocation (old browser, insecure origin)
  | 'error'; // timeout or position unavailable

export interface GeolocationState {
  status: GeolocationStatus;
  coords: Coords | null;
  error: string | null;
  /** True once we know the answer either way - handy for skeletons. */
  settled: boolean;
}

const OPTIONS: PositionOptions = {
  enableHighAccuracy: false, // campus-scale; high accuracy drains battery
  timeout: 10_000,
  maximumAge: 5 * 60 * 1000, // a 5-minute-old fix is fine for "hostels near me"
};

function messageFor(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission denied. Pick an area instead.';
    case err.POSITION_UNAVAILABLE:
      return "Couldn't get your location. Pick an area instead.";
    case err.TIMEOUT:
      return 'Location timed out. Pick an area instead.';
    default:
      return 'Location unavailable. Pick an area instead.';
  }
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    status: 'idle',
    coords: null,
    error: null,
    settled: false,
  });

  // Guards against setState after unmount - the callbacks fire whenever the
  // user gets round to answering the permission dialog, which may be never.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Support is derived at render, not stored: writing it from an effect would
  // be a setState-in-effect cascade, and it can never change for a session.
  // Gated on hydration so the server render (where `navigator` is absent) and
  // the first client render agree.
  const hydrated = useIsHydrated();
  const supported = !hydrated || (typeof navigator !== 'undefined' && !!navigator.geolocation);

  // Read the existing permission WITHOUT prompting, so a user who already
  // granted it gets "near me" straight away and one who denied never sees a
  // button that can't work. Permissions API is absent on some Safari versions,
  // hence the guard.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (!navigator.permissions?.query) return;

    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((result) => {
        if (cancelled || !alive.current) return;
        if (result.state === 'denied') {
          setState((s) => ({ ...s, status: 'denied', settled: true }));
        }
      })
      .catch(() => {
        /* Permissions API unsupported - stay 'idle' and let request() decide. */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        status: 'unavailable',
        coords: null,
        error: 'This browser cannot share location.',
        settled: true,
      });
      return;
    }

    setState((s) => ({ ...s, status: 'prompting', error: null }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!alive.current) return;
        setState({
          status: 'granted',
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
          error: null,
          settled: true,
        });
      },
      (err) => {
        if (!alive.current) return;
        setState({
          status: err.code === err.PERMISSION_DENIED ? 'denied' : 'error',
          coords: null,
          error: messageFor(err),
          settled: true,
        });
      },
      OPTIONS,
    );
  }, []);

  const clear = useCallback(() => {
    setState({ status: 'idle', coords: null, error: null, settled: false });
  }, []);

  return {
    ...state,
    // `unavailable` wins over whatever the request lifecycle says - there is no
    // point reporting 'idle' on a browser that can never answer.
    status: supported ? state.status : ('unavailable' as GeolocationStatus),
    settled: supported ? state.settled : true,
    supported,
    request,
    clear,
  };
}
