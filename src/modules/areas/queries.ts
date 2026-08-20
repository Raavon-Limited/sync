/**
 * Server-side data fetching for service areas.
 *
 * The areas back the location picker in the ServicesDock, the "you are in X"
 * copy on /around, and the map's fly-to targets. They used to be a hardcoded
 * const; they are now rows, so a new area or a corrected coordinate is an
 * INSERT/UPDATE rather than a deploy.
 *
 * Degrades to FALLBACK_AREAS rather than an empty list. /around is a public
 * page and the picker is part of its chrome - a Supabase outage should leave a
 * slightly stale filter, not a page with no way to narrow the feed.
 */
import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { FALLBACK_AREAS, type Area } from '@/lib/constants/areas';

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

/**
 * Active areas in display order.
 *
 * `cache()` de-dupes within a request: the layout renders the dock and the
 * page renders location-aware copy, and both want this list.
 */
export const listAreas = cache(async (): Promise<Area[]> => {
  if (!configured) return FALLBACK_AREAS;

  try {
    // `areas` postdates the checked-in generated types (src/types/database.ts),
    // so the typed client rejects the table name. Dropping to the untyped
    // client for this one call rather than hand-editing a generated file.
    // TODO: after applying 0007, regenerate with
    //   npx supabase gen types typescript --linked > src/types/database.ts
    // and delete this cast. (Write it as UTF-8 - the current file is UTF-16,
    // which is why grep and most tooling can't read it.)
    const supabase = (await createClient()) as unknown as SupabaseClient;
    const { data, error } = await supabase
      .from('areas')
      .select('name, slug, lat, lng')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    // An empty table is treated as "not set up yet", not as "no areas exist" -
    // rendering a picker with nothing in it would be worse than the fallback.
    if (error || !data || data.length === 0) return FALLBACK_AREAS;

    return data.map((r) => ({
      name: r.name as string,
      slug: r.slug as string,
      lat: Number(r.lat),
      lng: Number(r.lng),
    }));
  } catch {
    return FALLBACK_AREAS;
  }
});
