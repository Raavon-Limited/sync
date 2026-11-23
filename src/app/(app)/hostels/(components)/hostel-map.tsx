/**
 * HostelMap - where the hostel actually is, and how far that is from the gate.
 *
 * WHAT IT REPLACES
 *   A decorative panel: a CSS grid background, two rounded rectangles labelled
 *   "KWASU GATE" and the hostel's name, and a dashed line between them. It was
 *   captioned "Malete Geographic Coordinate Route" and contained no geography
 *   whatsoever - the two boxes sat the same distance apart for a hostel across
 *   the road and one in the next town, and the "route" was a border-dashed div.
 *   A student choosing between listings by how far they are from campus was
 *   reading a picture that could not tell them.
 *
 * IT DEGRADES IN TWO DIRECTIONS, AND SAYS WHICH
 *   No pin on the listing (`lat`/`lng` null, which is legal - a landlord whose
 *   address Places could not resolve still gets to list) and no map is possible
 *   at all, so it says the listing has no pin rather than centring on the campus
 *   and implying one. No Maps API key and MapUnavailable explains that instead.
 *   Neither case invents a location.
 *
 * THE DISTANCE IS A STRAIGHT LINE, AND IS LABELLED AS ONE.
 *   `distanceMetres` is great-circle. Calling it a walk time would be a claim
 *   about roads we have not measured; "from KWASU gate" is a claim about
 *   coordinates, which is exactly what we have.
 */
'use client';

import { AdvancedMarker, AdvancedMarkerAnchorPoint, ColorScheme, Map, Pin } from '@vis.gl/react-google-maps';
import { MapPin, Navigation } from 'lucide-react';
import {
  GOOGLE_MAP_ID,
  GoogleMapsProvider,
  MapUnavailable,
} from '@/components/shared/google-maps-provider';
import { CAMPUS_POINT, distanceMetres, formatDistance } from '@/lib/constants/areas';
import { useThemeMode } from '@/hooks/use-theme-mode';

export function HostelMap({
  name,
  lat,
  lng,
  area,
  address,
}: {
  name: string;
  lat?: number | null;
  lng?: number | null;
  area: string;
  address?: string | null;
}) {
  const mode = useThemeMode();
  const pinned = lat != null && lng != null;

  if (!pinned) {
    return (
      <div className="border-line/10 bg-panel text-content-muted flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border p-6 text-center">
        <MapPin className="size-5 opacity-60" />
        <p className="text-sm">
          This listing has no map pin yet. It is in{' '}
          <span className="text-content font-semibold">{area}</span>
          {address ? `, at ${address}` : ''}.
        </p>
        <p className="text-xs">Ask the landlord for directions before you travel.</p>
      </div>
    );
  }

  const position = { lat, lng };
  const fromGate = distanceMetres(CAMPUS_POINT, position);
  // Both points in frame. They are typically under 2km apart, so this is a
  // fixed zoom rather than a fitted bounds - a bounds fit on two near-identical
  // points zooms to the roof tiles.
  const centre = {
    lat: (CAMPUS_POINT.lat + lat) / 2,
    lng: (CAMPUS_POINT.lng + lng) / 2,
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="border-line/10 h-64 overflow-hidden rounded-2xl border">
        <GoogleMapsProvider fallback={<MapUnavailable />}>
          <Map
            mapId={GOOGLE_MAP_ID}
            defaultCenter={centre}
            defaultZoom={14}
            // The map follows the toggle, not the OS: a student who chose light
            // should not get a dark rectangle in the middle of a light page.
            colorScheme={mode === 'dark' ? ColorScheme.DARK : ColorScheme.LIGHT}
            gestureHandling="cooperative"
            disableDefaultUI
            clickableIcons={false}
            className="h-full w-full"
            style={{ height: '100%' }}
          >
            <AdvancedMarker position={position} title={name}>
              <Pin background="#ffc93c" borderColor="#344e41" glyphColor="#344e41" />
            </AdvancedMarker>

            <AdvancedMarker
              position={CAMPUS_POINT}
              anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
              title={CAMPUS_POINT.label}
            >
              <span className="rounded-full border-2 border-[#344e41] bg-white px-2 py-1 font-mono text-[10px] font-bold text-[#344e41] shadow">
                KWASU
              </span>
            </AdvancedMarker>
          </Map>
        </GoogleMapsProvider>
      </div>

      <div className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <MapPin className="size-3.5" />
          {address ?? area}
        </span>
        <span aria-hidden="true">·</span>
        <span>{formatDistance(fromGate)} from KWASU gate, in a straight line</span>
        <a
          className="text-lime-deep ml-auto flex items-center gap-1 underline underline-offset-2"
          href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Navigation className="size-3.5" />
          Directions
        </a>
      </div>
    </div>
  );
}
