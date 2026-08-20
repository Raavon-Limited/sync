'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import * as api from './queries';
import type { AroundFilters } from './queries';

const db = () => createClient();

/**
 * All map pins. Cached for five minutes: the map is expensive to populate (three
 * parallel table reads) and its contents change on the order of days, not
 * seconds.
 */
export function useNearbyPins(filters: AroundFilters = {}) {
  return useQuery({
    queryKey: ['around', 'pins', filters] as const,
    queryFn: () => api.fetchNearbyPins(db(), filters),
    staleTime: 5 * 60_000,
  });
}
