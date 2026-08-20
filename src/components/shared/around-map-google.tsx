/**
 * AroundMapGoogle - the real (Google Maps) map for /around.
 *
 * Renders the actual streets around KWASU, Malete with custom distance pins per
 * nearby spot, a "you are here" marker, and the campus gate. Picking an area in
 * the ServicesDock location dropdown flies the map there (shared via
 * LocationContext). Client-only: loaded with `ssr: false` from <AroundMap>.
 *
 * Ported from Leaflet/OpenStreetMap. The pin markup and its CSS classes are
 * unchanged - they're now React children of <AdvancedMarker> instead of an HTML
 * string handed to L.divIcon, which is why the old escape() helper is gone: JSX
 * escapes interpolated text on its own.
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  Circle,
  Map,
  useMap,
} from '@vis.gl/react-google-maps';
import { LocateFixed } from 'lucide-react';
import { type NearbyCategory } from '@/mock/around';
import {
  AREA_ZOOM,
  areaCoords,
  CAMPUS_POINT as MAP_CAMPUS_POINT,
  MAP_DEFAULT_VIEW as MAP_VIEW,
} from '@/lib/constants/areas';
import { useOptionalLocation } from '@/providers/location-provider';
import type { MapPin } from '@/modules/around/server-queries';
import { GOOGLE_MAP_ID, GoogleMapsProvider, MapUnavailable } from './google-maps-provider';

/** Category label + dot colour (mirrored by the legend). */
const CATEGORY: Record<NearbyCategory, { label: string; color: string }> = {
  hostel: { label: 'Hostels', color: '#3f7d20' },
  food: { label: 'Food', color: '#ff8b5c' },
  event: { label: 'Events', color: '#7c5cff' },
  hotspot: { label: 'Hot spots', color: '#ff5c8b' },
  beauty: { label: 'Beauty', color: '#c45cff' },
  workmanship: { label: 'Workmanship', color: '#0e0e12' },
  laundry: { label: 'Laundry', color: '#1f9fb8' },
};

/** Zoom used when we have a real GPS fix - tighter than the area overview,
 *  since we know where the user actually is. */
const NEARBY_ZOOM = 16;

/** MAP_VIEW.center is a [lat, lng] tuple (Leaflet's order); Google wants an
 *  object. Converted here so the shared constants file stays untouched. */
const DEFAULT_CENTER = { lat: MAP_VIEW.center[0], lng: MAP_VIEW.center[1] };

/**
 * Flies the map to wherever "here" currently is: the user's real position when
 * they've shared it, otherwise the selected area.
 */
function Recenter() {
  const map = useMap();
  const loc = useOptionalLocation();
  const area = loc?.area;
  const areas = loc?.areas;
  const lat = loc?.coords?.lat;
  const lng = loc?.coords?.lng;

  useEffect(() => {
    if (!map) return;

    // Zoom BEFORE panning, in both branches. Google has no flyTo that animates
    // zoom and centre together: setZoom is an instant cut while panTo animates,
    // so doing the cut first and gliding into place reads as one movement
    // instead of a slide followed by a jump.

    // A real fix wins over the area chip - if the user shared their position,
    // that's what they want centred.
    if (lat != null && lng != null) {
      map.setZoom(NEARBY_ZOOM);
      map.panTo({ lat, lng });
      return;
    }
    if (!area) return;
    // Coordinates come from the areas list (the `areas` table) rather than a
    // static map, so correcting one is an UPDATE, not a deploy.
    const coords = areaCoords(area, areas);
    if (coords) {
      map.setZoom(AREA_ZOOM);
      map.panTo({ lat: coords.lat, lng: coords.lng });
    }
  }, [lat, lng, area, areas, map]);

  return null;
}

/**
 * The user's actual position, plus a circle showing the accuracy the device
 * reported.
 *
 * Renders NOTHING without a real fix. The previous version pinned "You" to the
 * map centre, which told every visitor - including ones who never shared
 * location - that they were standing at a fixed point in Malete.
 */
function YouAreHere() {
  const loc = useOptionalLocation();
  const coords = loc?.coords;
  if (!coords) return null;

  return (
    <>
      {/* Honest about precision: a 500m fix shouldn't look like a 5m one. */}
      <Circle
        center={{ lat: coords.lat, lng: coords.lng }}
        radius={coords.accuracy}
        strokeColor="#c5ff4a"
        strokeWeight={1}
        strokeOpacity={0.9}
        fillColor="#c5ff4a"
        fillOpacity={0.12}
        clickable={false}
      />
      <AdvancedMarker
        position={{ lat: coords.lat, lng: coords.lng }}
        anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
        title="Your location"
        zIndex={20}
      >
        <div className="amap-you">
          <span className="amap-you__dot" />
          <span className="amap-you__label">You</span>
        </div>
      </AdvancedMarker>
    </>
  );
}

/**
 * "Show my location" button, overlaid on the map.
 *
 * Rendered OUTSIDE <Map> so it isn't a map overlay - it's a plain absolutely
 * positioned button. Hidden once a fix is showing (the marker is the feedback)
 * and when permission was refused, since the browser won't re-ask.
 */
function LocateControl() {
  const loc = useOptionalLocation();
  if (!loc) return null;

  const { coords, geoStatus, geoError, requestLocation } = loc;
  const busy = geoStatus === 'prompting';
  const blocked = geoStatus === 'denied' || geoStatus === 'unavailable';
  if (coords || blocked) {
    // Say why the button vanished rather than leaving a silent gap.
    return geoError ? (
      <p className="bg-panel/90 text-content-muted absolute right-3 bottom-3 z-500 max-w-56 rounded-lg px-2.5 py-1.5 text-[11px] backdrop-blur">
        {geoError}
      </p>
    ) : null;
  }

  return (
    <button
      type="button"
      onClick={requestLocation}
      disabled={busy}
      className="border-line/15 bg-panel/90 text-foreground hover:bg-panel absolute right-3 bottom-3 z-500 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-sm backdrop-blur disabled:opacity-60"
    >
      <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
      {busy ? 'Locating…' : 'Show my location'}
    </button>
  );
}

/** Pins come from the server (modules/around/queries.listMapPins). An empty
 *  array renders just the campus marker - the correct state before any hostel
 *  has coordinates, not an error. */
export default function AroundMapGoogle({ pins = [] }: { pins?: MapPin[] }) {
  const router = useRouter();

  return (
    <figure className="flex flex-col gap-4">
      <div className="border-line/10 relative isolate h-[72vh] min-h-104 w-full overflow-hidden rounded-2xl border lg:h-[calc(100dvh-8rem)]">
        <GoogleMapsProvider fallback={<MapUnavailable />}>
          <Map
            mapId={GOOGLE_MAP_ID}
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={MAP_VIEW.zoom}
            // Matches the old Leaflet behaviour: the page scrolls past the map
            // rather than the map swallowing the wheel. Ctrl+wheel still zooms.
            gestureHandling="cooperative"
            disableDefaultUI
            zoomControl
            // Google's own POI pins would collide with ours and are clickable,
            // opening info windows we don't control.
            clickableIcons={false}
            className="h-full w-full"
          >
            <Recenter />

            <AdvancedMarker
              position={{ lat: MAP_CAMPUS_POINT.lat, lng: MAP_CAMPUS_POINT.lng }}
              anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
              title={MAP_CAMPUS_POINT.label}
            >
              <div className="amap-campus">{MAP_CAMPUS_POINT.label}</div>
            </AdvancedMarker>

            <YouAreHere />

            {pins.map((pin) => (
              <AdvancedMarker
                key={pin.id}
                position={{ lat: pin.lat, lng: pin.lng }}
                anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
                title={`${pin.name} · ${pin.distance}`}
                zIndex={pin.featured ? 10 : 1}
                onClick={() => router.push(pin.href)}
              >
                <div className={`amap-pin${pin.featured ? ' amap-pin--featured' : ''}`}>
                  <span
                    className="amap-pin__dot"
                    style={{
                      background: pin.featured ? '#0e0e12' : CATEGORY[pin.category].color,
                    }}
                  />
                  <span className="amap-pin__text">
                    <span className="amap-pin__name">{pin.name}</span>
                    <span className="amap-pin__dist">{pin.distance}</span>
                  </span>
                </div>
              </AdvancedMarker>
            ))}
          </Map>
        </GoogleMapsProvider>

        {/* Locate control. Sits above the map pane so it stays clickable over
            tiles and markers. */}
        <LocateControl />
      </div>

      {/* Legend */}
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {Object.entries(CATEGORY).map(([key, { label, color }]) => (
          <span key={key} className="text-content-muted inline-flex items-center gap-1.5 text-xs">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: color }}
            />
            {label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
