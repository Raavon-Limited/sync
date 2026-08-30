/**
 * Data access for the 'hotspots' module. Backs /hotspots and /hotspots/[slug].
 *
 * Hotspots are EDITORIAL, not user-generated: staff curate them, so there is no
 * owner column and no client write path. The table has a staff-only write
 * policy and clients hold SELECT alone.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { unwrapList, unwrapMaybe, toRange, type PageParams } from '@/lib/query/helpers';

/* eslint-disable @typescript-eslint/no-explicit-any -- see lib/query/helpers.ts */
type Row = any;
type Client = SupabaseClient<Database>;

export interface Hotspot {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  imageUrl: string | null;
  address: string | null;
  area: string | null;
  position: { lat: number; lng: number } | null;
  opensAt: string | null;
  closesAt: string | null;
  isFeatured: boolean;
}

/**
 * Coordinates come from the plain `lat`/`lng` columns, never from `geo`.
 * A geography column reads back over PostgREST as WKB hex, so `geo.coordinates`
 * is always undefined — a reader written against it fails silently and simply
 * never renders a pin. See 20260824090000_hostel_hotspot_coords.
 */
export function toLatLng(r: Row): { lat: number; lng: number } | null {
  if (typeof r?.lat !== 'number' || typeof r?.lng !== 'number') return null;
  return { lat: r.lat, lng: r.lng };
}

const toHotspot = (r: Row): Hotspot => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  category: r.category,
  description: r.description,
  imageUrl: r.image_url,
  address: r.address,
  area: r.area,
  position: toLatLng(r),
  opensAt: r.opens_at,
  closesAt: r.closes_at,
  isFeatured: r.is_featured,
});

export async function fetchHotspots(
  db: Client,
  opts: { category?: string; area?: string; featuredOnly?: boolean } & PageParams = {},
): Promise<Hotspot[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('hotspots')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .range(from, to);

  if (opts.category) q = q.eq('category', opts.category);
  if (opts.area) q = q.eq('area', opts.area);
  if (opts.featuredOnly) q = q.eq('is_featured', true);

  return unwrapList<Row>(await q).map(toHotspot);
}

export async function fetchHotspotBySlug(db: Client, slug: string): Promise<Hotspot | null> {
  const r = unwrapMaybe<Row>(await db.from('hotspots').select('*').eq('slug', slug).maybeSingle());
  return r ? toHotspot(r) : null;
}
