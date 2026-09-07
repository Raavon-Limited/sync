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

/**
 * The area board. Two minutes: busyness and cooldowns move on that order, and
 * the underlying RPC scans a week of orders, so this is not free.
 */
export function useCampusPulse() {
  return useQuery({
    queryKey: ['around', 'pulse'] as const,
    queryFn: () => api.fetchCampusPulse(db()),
    staleTime: 2 * 60_000,
  });
}
