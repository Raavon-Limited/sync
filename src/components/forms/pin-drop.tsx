/**
 * PinDrop - place a property on the map by hand.
 *
 * WHY THIS HAS TO EXIST ALONGSIDE THE AUTOCOMPLETE
 *   Google Places knows commercial addresses and named streets. It does not
 *   reliably know "the third gate past Amao junction", which is a real Malete
 *   address and a very common one for the hostels on this platform. Those
 *   landlords type their address by hand, which means no coordinates, which
 *   means `hostels_near` skips the listing entirely   its filter is
 *   `where h.geo is not null`, so an unpinned hostel is not ranked last, it is
 *   absent.
 *
 *   So the fallback cannot be "type it and hope". Somebody who knows exactly
 *   where the building is has to be able to say so directly, and a map they can
 *   tap is the only input that does not require them to know their own
 *   coordinates.
 *
 * THREE WAYS TO SET THE PIN, IN THE ORDER THEY ARE USEFUL
 *   1. "Use my location"   the landlord is standing at the property, which is
 *      the single most accurate signal available and one tap.
 *   2. Tapping the map.
 *   3. Dragging the pin, to nudge 1 or 2.
 *
 * DEGRADES, LIKE EVERYTHING ELSE THAT TOUCHES MAPS
 *   No API key, or Google rejecting it, renders an explanation rather than a
 *   grey rectangle   and the form it sits in still submits. A listing without a
 *   pin is worse than one with it and much better than one that could not be
 *   created.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdvancedMarker, Map, type MapMouseEvent } from '@vis.gl/react-google-maps';
import { Crosshair, MapPin as MapPinIcon, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { MAP_DEFAULT_VIEW, isOutsideServiceArea } from '@/lib/constants/areas';
import { useGeolocation, type Coords } from '@/hooks/use-geolocation';
import {
  GOOGLE_MAP_ID,
  GoogleMapsProvider,
  MapUnavailable,
} from '@/components/shared/google-maps-provider';

export interface PinValue {
  lat: number;
  lng: number;
}

export interface PinDropProps {
  value: PinValue | null;
  onChange: (next: PinValue | null) => void;
  /** Where to open when there is no pin yet. Defaults to the campus view. */
  center?: PinValue;
}

/** MAP_DEFAULT_VIEW.center is a [lat, lng] tuple (Leaflet's order). */
const CAMPUS: PinValue = {
  lat: MAP_DEFAULT_VIEW.center[0],
  lng: MAP_DEFAULT_VIEW.center[1],
};

/** Tight enough to distinguish two gates on the same street. */
const PLACING_ZOOM = 17;

export function PinDrop(props: PinDropProps) {
  return (
    <GoogleMapsProvider fallback={<MapUnavailable className={PANEL} />}>
      <Placing {...props} />
    </GoogleMapsProvider>
  );
}

const PANEL =
  'border-line/10 bg-surface-deep text-content-muted flex h-56 w-full items-center justify-center rounded-xl border p-6 text-center text-sm';

function Placing({ value, onChange, center }: PinDropProps) {
  const geo = useGeolocation();

  // DERIVED, NOT MIRRORED. A `locating` useState would have to be cleared on a
  // fix, on a denial, on a timeout and on an unsupported browser   four places
  // to forget one, and the button sticks on "Finding you…" forever if any of
  // them is missed. The hook already knows.
  const locating = geo.status === 'prompting';

  // The map is uncontrolled after mount: re-centring on every pin change would
  // fight the person dragging it. It opens where the pin is, or near campus.
  const [initial] = useState<PinValue>(value ?? center ?? CAMPUS);

  const place = useCallback((lat: number, lng: number) => onChange({ lat, lng }), [onChange]);

  const onMapClick = useCallback(
    (e: MapMouseEvent) => {
      const p = e.detail.latLng;
      if (p) place(p.lat, p.lng);
    },
    [place],
  );

  // The fix arrives long after the tap, so adopting it is an EFFECT and not a
  // branch in the render body: `place` calls the PARENT's setState, and doing
  // that mid-render updates a different component, which React refuses.
  //
  // The ref holds the fix already adopted, so a re-render (the parent re-renders
  // the moment we place the pin) does not re-apply the same coordinates and
  // undo a drag the landlord made afterwards. `geo.coords` is only ever
  // populated by `request()`, so nothing is adopted unless the button was
  // pressed.
  const adopted = useRef<Coords | null>(null);
  useEffect(() => {
    if (!geo.coords || adopted.current === geo.coords) return;
    adopted.current = geo.coords;
    place(geo.coords.lat, geo.coords.lng);
  }, [geo.coords, place]);

  const outside = value ? isOutsideServiceArea(value) : false;

  return (
    <div className="flex flex-col gap-2">
      <div className="border-line/10 relative h-56 w-full overflow-hidden rounded-xl border">
        <Map
          mapId={GOOGLE_MAP_ID}
          defaultCenter={initial}
          defaultZoom={value ? PLACING_ZOOM : MAP_DEFAULT_VIEW.zoom}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          onClick={onMapClick}
          className="h-full w-full"
        >
          {value && (
            <AdvancedMarker
              position={value}
              draggable
              onDragEnd={(e) => {
                const p = e.latLng;
                if (p) place(p.lat(), p.lng());
              }}
            >
              <span className="bg-lime-deep grid size-7 place-items-center rounded-full text-white shadow-lg ring-2 ring-white">
                <MapPinIcon className="size-4" />
              </span>
            </AdvancedMarker>
          )}
        </Map>

        {!value && (
          // Not a disabled state   the map underneath is live and tapping it is
          // the primary action. This only says so.
          <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2 text-center text-xs text-white">
            Tap the map where the property is
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={geo.request} disabled={locating}>
          <Crosshair className="mr-1.5 size-4" />
          {locating ? 'Finding you…' : 'Use my location'}
        </Button>
        {value && (
          <Button type="button" variant="outline" onClick={() => onChange(null)}>
            <X className="mr-1.5 size-4" />
            Clear pin
          </Button>
        )}
        {value && (
          <span className="text-content-muted font-mono text-xs">
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
          </span>
        )}
      </div>

      {geo.status === 'denied' && (
        <p className="text-content-muted text-xs">
          Location is blocked for this site, so tap the map instead.
        </p>
      )}

      {/* A warning, never a block. The service area is our commercial choice,
          and a landlord just outside it is a fact about the map, not an error
          in their form. */}
      {outside && (
        <p className="text-xs text-amber-600">
          That pin is outside the areas Sync currently covers. You can still save it, but students
          browsing by area may not see the listing.
        </p>
      )}
    </div>
  );
}
