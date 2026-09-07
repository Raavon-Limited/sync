'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import type { PageParams } from '@/lib/query/helpers';
import * as api from './queries';

const db = () => createClient();

export function useHotspots(
  filters: { category?: string; area?: string; featuredOnly?: boolean } & PageParams = {},
) {
  return useQuery({
    queryKey: qk.hotspots.list(filters),
    queryFn: () => api.fetchHotspots(db(), filters),
    // Curated content changes rarely.
    staleTime: 10 * 60_000,
  });
}

export function useHotspot(slug: string | undefined) {
  return useQuery({
    queryKey: qk.hotspots.detail(slug ?? ''),
    queryFn: () => api.fetchHotspotBySlug(db(), slug!),
    enabled: !!slug,
  });
}
