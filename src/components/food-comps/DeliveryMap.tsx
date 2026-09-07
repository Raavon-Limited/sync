/**
 * DeliveryMap - static preview of the saved delivery address on checkout.
 *
 * Read-only: no gestures, no controls. It's a confirmation that we have the
 * right spot, not something to explore, so letting the user drag it away from
 * the address only creates confusion.
 */
"use client"

import { AdvancedMarker, Map, Pin } from "@vis.gl/react-google-maps"

import {
  GOOGLE_MAP_ID,
  GoogleMapsProvider,
  MapUnavailable,
} from "@/components/shared/google-maps-provider"

interface DeliveryMapProps {
  lat: number
  lng: number
}

export default function DeliveryMap({ lat, lng }: DeliveryMapProps) {
  return (
    <GoogleMapsProvider fallback={<MapUnavailable />}>
      <Map
        mapId={GOOGLE_MAP_ID}
        defaultCenter={{ lat, lng }}
        defaultZoom={16}
        gestureHandling="none"
        disableDefaultUI
        clickableIcons={false}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Google's built-in pin, themed to the app's lime. Replaces the old
            Leaflet marker PNGs, which were hotlinked from unpkg.com and blocked
            by our own img-src CSP anyway. */}
        <AdvancedMarker position={{ lat, lng }} title="Delivery address">
          <Pin background="#c5ff4a" borderColor="#0e0e12" glyphColor="#0e0e12" />
        </AdvancedMarker>
      </Map>
    </GoogleMapsProvider>
  )
}
