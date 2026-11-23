/**
 * TrackMap - the vendor → rider → you view on the order tracking screen.
 *
 * Non-interactive by design: the tracking page owns the narrative (stage list,
 * ETA) and the map is illustration. Rendered in Google's DARK colour scheme to
 * sit inside the page's dark shell instead of glaring against it.
 */
'use client'
import { Utensils } from "lucide-react";

import { AdvancedMarker, AdvancedMarkerAnchorPoint, ColorScheme, Map, Polyline } from '@vis.gl/react-google-maps'

import {
    GOOGLE_MAP_ID,
    GoogleMapsProvider,
    MapUnavailable,
} from '@/components/shared/google-maps-provider'

const VENDOR_COORD = { lat: 8.4799, lng: 4.5418 }
const DELIVERY_COORD = { lat: 8.4875, lng: 4.6810 }

const MID = {
    lat: (VENDOR_COORD.lat + DELIVERY_COORD.lat) / 2,
    lng: (VENDOR_COORD.lng + DELIVERY_COORD.lng) / 2,
}

/** Google has no `dashArray`: a dashed line is a transparent stroke with a
 *  repeating dash symbol painted along it. */
const DASH_SYMBOL = {
    path: 'M 0,-1 0,1',
    strokeOpacity: 0.85,
    strokeColor: '#ffc93c',
    strokeWeight: 4,
    scale: 2,
}

export default function TrackMap() {
    return (
        <GoogleMapsProvider fallback={<MapUnavailable />}>
            <Map
                mapId={GOOGLE_MAP_ID}
                defaultCenter={MID}
                defaultZoom={14}
                colorScheme={ColorScheme.DARK}
                gestureHandling="none"
                disableDefaultUI
                clickableIcons={false}
                className="h-full w-full"
                style={{ height: '100%' }}
            >
                <Polyline
                    path={[VENDOR_COORD, DELIVERY_COORD]}
                    strokeOpacity={0}
                    icons={[{ icon: DASH_SYMBOL, offset: '0', repeat: '14px' }]}
                />

                <AdvancedMarker
                    position={VENDOR_COORD}
                    anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
                    title="Vendor"
                >
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: '#ffc93c',
                            border: '3px solid #344e41',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 18,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                        }}
                    >
                        <Utensils className="size-4" aria-hidden="true" />
                    </div>
                </AdvancedMarker>

                <AdvancedMarker
                    position={DELIVERY_COORD}
                    anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
                    title="Delivery address"
                >
                    <div className="amap-you">
                        <span className="amap-you__dot" />
                        <span className="amap-you__label">You</span>
                    </div>
                </AdvancedMarker>
            </Map>
        </GoogleMapsProvider>
    )
}
