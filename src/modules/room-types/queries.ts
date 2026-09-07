/**
 * Server-side data fetching for room types.
 *
 * The types back the landlord's "Room type" picker and the student's layout
 * filter. They were a CHECK constraint enumerating four values, two of which
 * were not room types at all (see 20260907180000_room_types); they are now rows,
 * so a new layout is an INSERT rather than a deploy.
 *
 * Degrades to FALLBACK_ROOM_TYPES rather than an empty list, for the same
 * reason `listAreas` does: the browse page is public, and a Supabase blip
 * should leave a slightly stale filter, not a form with nothing to pick.
 */
import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { FALLBACK_ROOM_TYPES, type RoomTypeOption } from '@/lib/constants/room-types';

// The fallback and the type live in lib/constants: this module is
// `server-only`, and the browse filter and search sidebar are client
// components that need the same labels. Same split as FALLBACK_AREAS.
export { FALLBACK_ROOM_TYPES, type RoomTypeOption } from '@/lib/constants/room-types';

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

/**
 * Active room types in display order.
 *
 * `cache()` de-dupes within a request, the same way `listAreas` does: a page
 * that renders both a filter and a form wants this once.
 */
export const listRoomTypes = cache(async (): Promise<RoomTypeOption[]> => {
  if (!configured) return FALLBACK_ROOM_TYPES;

  try {
    // `room_types` postdates the checked-in generated types, so the typed
    // client rejects the table name. REGENERATE after applying
    // 20260907180000 and delete this cast:
    //   npx supabase gen types typescript --linked | Out-File -Encoding utf8 src/types/database.types.ts
    const supabase = (await createClient()) as unknown as SupabaseClient;
    const { data, error } = await supabase
      .from('room_types')
      .select('name, slug')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    // An empty table reads as "not seeded yet", not as "no room types exist".
    if (error || !data || data.length === 0) return FALLBACK_ROOM_TYPES;

    return data.map((r) => ({ name: r.name as string, slug: r.slug as string }));
  } catch {
    return FALLBACK_ROOM_TYPES;
  }
});
