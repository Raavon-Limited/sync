/**
 * usePlaceName - resolves a GPS fix to a human place name via our own
 * /api/geocode/reverse proxy.
 *
 * Only used when the user is outside the service area: inside Malete our own
 * area names (KWASU Gate, Safari…) are the useful labels because they're what
 * listings are filed under. Outside, "Outside Malete" tells the user nothing
 * about where the app thinks they are - "Victoria Island, Lagos" does.
 *
 * Never throws and never blocks: a failed lookup leaves `place` null and the
 * caller falls back to neutral copy.
 */
'use client';

import { useEffect, useState } from 'react';

interface Resolved {
  /** The coordinate key this result belongs to. */
  key: string;
  place: string | null;
}

export function usePlaceName(coords: { lat: number; lng: number } | null, enabled = true) {
  const [resolved, setResolved] = useState<Resolved | null>(null);

  // Round for the key as well as the request, so drifting GPS doesn't refetch
  // every time the last decimal twitches.
  const key =
    coords && enabled ? `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}` : null;

  useEffect(() => {
    if (!key) return;

    const controller = new AbortController();
    const [lat, lng] = key.split(',');

    fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { place?: string | null } | null) => {
        setResolved({ key, place: d?.place ?? null });
      })
      .catch(() => {
        // Aborted or offline. Record the attempt so we stop reporting "loading"
        // forever; the caller's fallback copy takes over.
        setResolved({ key, place: null });
      });

    return () => controller.abort();
  }, [key]);

  // Derived, not stored: a result only counts for the coordinates it was
  // fetched for, so a stale name never leaks across a location change - and
  // there's no setState in the effect body.
  const fresh = key !== null && resolved?.key === key;

  return {
    place: fresh ? resolved.place : null,
    loading: key !== null && !fresh,
  };
}
