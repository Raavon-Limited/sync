/**
 * AroundMapLeaflet - the real (Leaflet + OpenStreetMap) map for /around.
 *
 * Renders the actual streets around KWASU, Malete with custom distance pins per
 * nearby spot, a "you are here" marker, and the campus gate. Picking an area in
 * the ServicesDock location dropdown flies the map there (shared via
 * LocationContext). Client-only: loaded with `ssr: false` from <AroundMap>.
 */
'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { useOptionalLocation } from '@/app/around/location-context';
import { useNearbyPins } from '@/modules/around/hooks';
import { useAreas } from '@/modules/hostels/hooks';
import type { PinKind } from '@/modules/around/queries';

/**
 * Campus centre and default zoom. Genuinely constants — the map has to open
 * somewhere before any query resolves, and this build serves one campus.
 */
const MAP_VIEW = { center: [8.7138, 4.4466] as [number, number], zoom: 15 };
const MAP_CAMPUS_POINT = { label: 'KWASU, Malete', lat: 8.7178, lng: 4.4496 };

/**
 * Legend label + dot colour.
 *
 * The mock also had an "Events" entry. `fetchNearbyPins` unions vendors,
 * hostels and hotspots only — events carry no coordinates of their own on this
 * schema — so a legend key for them would advertise a colour that can never
 * appear on the map.
 */
const CATEGORY = {
  hostel: { label: 'Hostels', color: '#3f7d20' },
  food: { label: 'Food', color: '#ff8b5c' },
  beauty: { label: 'Beauty', color: '#c45cff' },
  laundry: { label: 'Laundry', color: '#1f9fb8' },
  workmanship: { label: 'Workmanship', color: '#0e0e12' },
  hotspot: { label: 'Hot spots', color: '#ff5c8b' },
} as const;

type LegendKey = keyof typeof CATEGORY;

/**
 * A pin's legend bucket. `kind` alone would flatten every business into one
 * colour, so vendors are split by their own category — which is the
 * distinction a student is actually scanning the map for.
 */
function legendKey(pin: { kind: PinKind; category: string | null }): LegendKey {
  if (pin.kind === 'hostel') return 'hostel';
  if (pin.kind === 'hotspot') return 'hotspot';
  switch (pin.category) {
    case 'beauty':
      return 'beauty';
    case 'laundry':
      return 'laundry';
    // `vendor_profiles.category` says 'tradesman'; the product says
    // workmanship. Mapped here rather than renamed in the database.
    case 'tradesman':
      return 'workmanship';
    default:
      return 'food';
  }
}

const escape = (s: string) => s.replace(/"/g, '&quot;');

/**
 * Where tapping a pin goes. The mock carried an `href` per pin; the real rows
 * carry a slug, and the route depends on what the thing is — a laundry vendor
 * does not live under /food.
 */
function hrefFor(pin: { kind: PinKind; slug: string; category: string | null }): string {
  if (pin.kind === 'hostel') return `/hostels/${pin.slug}`;
  if (pin.kind === 'hotspot') return `/hotspots/${pin.slug}`;
  switch (pin.category) {
    case 'beauty':
      return `/beauty/${pin.slug}`;
    case 'laundry':
      return `/laundry/${pin.slug}`;
    case 'tradesman':
      return `/workmanship/${pin.slug}`;
    default:
      return `/food/${pin.slug}`;
  }
}

function pinIcon(featured: boolean, name: string, distance: string, color: string) {
  return L.divIcon({
    className: 'amap-pin-wrap',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div class="amap-pin${featured ? ' amap-pin--featured' : ''}">
      <span class="amap-pin__dot" style="background:${featured ? '#0e0e12' : color}"></span>
      <span class="amap-pin__text">
        <span class="amap-pin__name">${escape(name)}</span>
        <span class="amap-pin__dist">${escape(distance)}</span>
      </span>
    </div>`,
  });
}

const YOU_ICON = L.divIcon({
  className: 'amap-pin-wrap',
  iconSize: [0, 0],
  iconAnchor: [0, 0],
  html: `<div class="amap-you"><span class="amap-you__dot"></span><span class="amap-you__label">You</span></div>`,
});

const CAMPUS_ICON = L.divIcon({
  className: 'amap-pin-wrap',
  iconSize: [0, 0],
  iconAnchor: [0, 0],
  html: `<div class="amap-campus">${escape(MAP_CAMPUS_POINT.label)}</div>`,
});

/**
 * Flies the map to the selected area whenever the location dropdown changes.
 *
 * Coordinates come from `public.areas`, which carries lat/lng per area. The
 * hardcoded AREA_COORDS map this replaced had to be edited by hand every time
 * staff added an area — so a new area was selectable and the map simply did
 * not move, with nothing to explain why.
 */
function Recenter() {
  const map = useMap();
  const loc = useOptionalLocation();
  const area = loc?.area;
  const { data: areas = [] } = useAreas();

  useEffect(() => {
    if (!area) return;
    const match = areas.find((a) => a.name === area);
    if (match) map.flyTo([match.lat, match.lng], MAP_VIEW.zoom, { duration: 0.8 });
  }, [area, areas, map]);
  return null;
}

export default function AroundMapLeaflet() {
  const router = useRouter();
  // Unfiltered: the map is the "everything nearby" view, and the location
  // dropdown recentres it rather than hiding what is outside the area.
  const { data: pins = [] } = useNearbyPins();
  return (
    <figure className="flex flex-col gap-4">
      <div className="border-line/10 relative isolate h-[72vh] min-h-104 w-full overflow-hidden rounded-2xl border lg:h-[calc(100dvh-8rem)]">
        <MapContainer
          center={MAP_VIEW.center}
          zoom={MAP_VIEW.zoom}
          scrollWheelZoom={false}
          className="h-full w-full"
          style={{ height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Recenter />

          <Marker position={[MAP_CAMPUS_POINT.lat, MAP_CAMPUS_POINT.lng]} icon={CAMPUS_ICON} />
          <Marker position={MAP_VIEW.center} icon={YOU_ICON} />

          {pins.map((pin) => {
            const key = legendKey(pin);
            // Distance is only populated by a proximity search; this is the
            // unfiltered view, so the area stands in rather than a made-up
            // "400m" that no query produced.
            const sub = pin.area ?? CATEGORY[key].label;
            return (
            <Marker
              key={pin.id}
              position={[pin.position.lat, pin.position.lng]}
              icon={pinIcon(Boolean(pin.isVerified), pin.name, sub, CATEGORY[key].color)}
              eventHandlers={{ click: () => router.push(hrefFor(pin)) }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                {pin.name} · {sub}
              </Tooltip>
            </Marker>
            );
          })}
        </MapContainer>
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
