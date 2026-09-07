/**
 * LocationProvider - how the whole app is scoped to a place.
 *
 * Mounted ONCE at the root (see providers/index.tsx). It used to live in
 * src/app/around/layout.tsx, which meant the selection existed only inside
 * /around: every other route rendered the picker with no provider behind it, so
 * the dock fell back to throwaway local state and choosing an area changed a
 * label and nothing else. Worse, navigating from /around into /food unmounted
 * the provider and silently reset the choice. Hoisting it to the root is what
 * makes one selection apply to every screen and survive navigation.
 *
 * Location is a SORT/FILTER, not a stored profile attribute. There is no
 * default area: we start showing everything and let the user narrow it.
 *
 *   'all'      - no filter, every listing in the market (the default)
 *   'near-me'  - a real GPS fix; sort by proximity via the hostels_near RPC
 *   'area'     - the user explicitly picked one area from the list
 *
 * `area` is null in 'all' mode, and that null is meaningful: it means "no
 * filter", not "unknown". Seeding it with the first area would invent a
 * location the user never chose and then label the whole app with it.
 */
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { FALLBACK_AREAS, nearestArea, type Area } from '@/lib/constants/areas';
import { useGeolocation, type Coords } from '@/hooks/use-geolocation';
import { usePlaceName } from '@/hooks/use-place-name';
import { readStandalone, subscribeStandalone } from '@/lib/pwa/use-install';

export type LocationMode = 'all' | 'area' | 'near-me';

/** Where the manual choice is remembered between visits. */
const STORAGE_KEY = 'sync:area';

/**
 * localStorage as an external store, rather than useState mirrored by an
 * effect.
 *
 * The obvious version - useState(null) plus an effect that reads storage and
 * calls setState - is a setState-during-effect cascade, and it renders one
 * frame of the wrong answer before correcting itself. useSyncExternalStore
 * reads the real value during render on the client while returning null from
 * getServerSnapshot on the server, so hydration matches and there is no extra
 * render. Storage stays the single source of truth for the manual choice.
 */
const storeListeners = new Set<() => void>();

function subscribeToArea(cb: () => void) {
  storeListeners.add(cb);
  // 'storage' fires in OTHER tabs, which is exactly what we want: pick an area
  // in one tab and the rest follow.
  window.addEventListener('storage', cb);
  return () => {
    storeListeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

function getStoredArea(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage. Not worth failing over.
    return null;
  }
}

/** The server has no storage, and neither does the first hydration pass. */
function getServerArea(): string | null {
  return null;
}

function writeStoredArea(next: string | null) {
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, next);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage unavailable - the choice just won't outlive the session. */
  }
  // localStorage doesn't notify the tab that wrote it, so do it by hand.
  storeListeners.forEach((l) => l());
}

interface LocationValue {
  /** The areas available to pick from, straight out of the `areas` table. */
  areas: Area[];
  /** null = all locations. Never invent one. */
  area: string | null;
  /** Pass null to go back to all locations. */
  setArea: (area: string | null) => void;
  mode: LocationMode;
  /**
   * True when we have a real fix but it's outside the market entirely. The map
   * can still show where they are; the UI must NOT label them with an area.
   */
  outsideServiceArea: boolean;
  /**
   * The real place name for the current fix ("Victoria Island, Lagos"), looked
   * up only when outside the service area - inside it, our own area names are
   * the meaningful labels. Null while loading or if the lookup fails.
   */
  placeName: string | null;
  /** Non-null only when mode === 'near-me'. */
  coords: Coords | null;
  /** Ask for GPS. Safe to call repeatedly; no-ops once denied. */
  requestLocation: () => void;
  /** Drop back to all locations. */
  showAllLocations: () => void;
  geoStatus: ReturnType<typeof useGeolocation>['status'];
  geoError: string | null;
  /** False on browsers with no geolocation, or on an insecure origin. */
  supportsGeo: boolean;
}

const LocationContext = createContext<LocationValue | null>(null);

export function LocationProvider({
  children,
  areas = FALLBACK_AREAS,
}: {
  children: ReactNode;
  /** Fetched server-side by the root layout so the first paint has the real list. */
  areas?: Area[];
}) {
  const geo = useGeolocation();

  /**
   * Whether the user wants proximity mode.
   *
   * Three-valued on purpose. `null` means "hasn't decided", which is NOT the
   * same as "no": in the installed PWA, launching from the home screen is
   * itself the opt-in, so an undecided user defaults to near-me there and to
   * off in a browser tab. Once they actually choose - by tapping "show my
   * location", picking an area, or going back to all locations - their choice
   * is recorded and the default stops applying.
   *
   * Deriving it this way, rather than setting state from the launch effect
   * below, is what keeps that effect free of setState.
   */
  const [nearMeChoice, setNearMeChoice] = useState<boolean | null>(null);
  const isStandalone = useSyncExternalStore(
    subscribeStandalone,
    readStandalone,
    // The server cannot know, and guessing "installed" would ship the
    // near-me default to every browser tab for one hydration frame.
    () => false,
  );
  const wantsNearMe = nearMeChoice ?? isStandalone;

  // null = all locations. The user has chosen nothing yet, and that's fine.
  const storedArea = useSyncExternalStore(subscribeToArea, getStoredArea, getServerArea);

  // Validated on read, not on write: an area can be renamed or retired in the
  // database long after it was saved here, and a stale value would filter every
  // list to nothing with no way for the user to tell why. Deriving it means the
  // check re-runs whenever `areas` changes.
  const manualArea = useMemo(
    () => (storedArea && areas.some((a) => a.name === storedArea) ? storedArea : null),
    [storedArea, areas],
  );

  const coords = wantsNearMe && geo.status === 'granted' ? geo.coords : null;

  // null = the fix is outside every service area. Don't fall back to an area:
  // there isn't an honest one to pick.
  const detectedArea = useMemo(
    () => (coords ? nearestArea(coords, areas) : null),
    [coords, areas],
  );
  const outsideServiceArea = Boolean(coords && !detectedArea);

  const area = coords ? detectedArea : manualArea;
  const mode: LocationMode = coords ? 'near-me' : manualArea ? 'area' : 'all';

  // Only bother naming the place when our own area names don't apply.
  const { place: placeName } = usePlaceName(coords, outsideServiceArea);

  const requestLocation = useCallback(() => {
    setNearMeChoice(true);
    geo.request();
  }, [geo]);

  const showAllLocations = useCallback(() => {
    setNearMeChoice(false);
    writeStoredArea(null);
  }, []);

  // Picking an area explicitly is an override - it always beats a fix.
  const setArea = useCallback((next: string | null) => {
    setNearMeChoice(false);
    writeStoredArea(next);
  }, []);

  /**
   * One permission prompt at launch - INSTALLED PWA ONLY.
   *
   * Because this provider is mounted at the root, the single grant here scopes
   * every map and every feed in the app: /around, the module pages, distance
   * on each pin. Nothing else ever has to ask.
   *
   * WHY ONLY IN THE PWA, and not in a browser tab: `useGeolocation` refuses to
   * auto-prompt for a good reason - a dialog that appears before the visitor
   * has asked for anything gets dismissed, and a denial is STICKY. The browser
   * will not ask again, so a drive-by prompt does not just fail, it burns
   * "near me" for that person permanently. On the open web that trade is bad.
   * In an installed app it is the opposite: launching from the home screen is
   * an explicit act, asking on first run is the platform convention, and there
   * is no address bar to explain the app another way.
   *
   * Deliberately conservative about when it fires:
   *   - standalone display-mode only
   *   - `geo.status === 'idle'` only, so a previous denial (which the hook
   *     reads from the Permissions API without prompting) is never re-asked,
   *     and an existing grant is not re-requested
   *   - once per mount, via the ref - React 18 double-invokes effects in dev
   *     and a second getCurrentPosition would be a second dialog
   */
  const autoAsked = useRef(false);
  useEffect(() => {
    if (autoAsked.current) return;
    if (geo.status !== 'idle') return;
    if (!isStandalone) return;
    autoAsked.current = true;
    // geo.request() only talks to the browser API - the resulting status
    // change flows back through useGeolocation. No setState here.
    geo.request();
  }, [geo, isStandalone]);

  const value = useMemo<LocationValue>(
    () => ({
      areas,
      area,
      setArea,
      mode,
      outsideServiceArea,
      placeName,
      coords,
      requestLocation,
      showAllLocations,
      geoStatus: geo.status,
      geoError: geo.error,
      supportsGeo: geo.supported,
    }),
    [
      areas,
      area,
      setArea,
      mode,
      outsideServiceArea,
      placeName,
      coords,
      requestLocation,
      showAllLocations,
      geo.status,
      geo.error,
      geo.supported,
    ],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/** Returns the context if a provider is mounted, else null. */
export function useOptionalLocation() {
  return useContext(LocationContext);
}

/**
 * The location scope. Throws if no provider is mounted - which, now that it
 * lives at the root, means a genuine wiring mistake rather than "this route
 * doesn't have one".
 */
export function useLocationScope(): LocationValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocationScope must be used within a <LocationProvider>');
  return ctx;
}
