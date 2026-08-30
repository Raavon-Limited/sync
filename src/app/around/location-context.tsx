/**
 * LocationContext - shares the selected Malete area between the ServicesDock's
 * location dropdown and the AroundMap, so picking an area re-centres the map.
 *
 * The dock works standalone too (e.g. inside the authenticated app shell where
 * there's no map): components read the context when present and fall back to
 * local state when it isn't - see `useOptionalLocation`.
 */
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';


interface LocationValue {
  area: string;
  setArea: (area: string) => void;
}

const LocationContext = createContext<LocationValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  // Empty until the picker sets one. Seeding from a hardcoded first area
  // meant every signed-in student silently started filtered to Safari.
  const [area, setArea] = useState<string>('');
  return <LocationContext.Provider value={{ area, setArea }}>{children}</LocationContext.Provider>;
}

/** Returns the context if a provider is mounted, else null. */
export function useOptionalLocation() {
  return useContext(LocationContext);
}
