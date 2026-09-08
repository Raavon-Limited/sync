/**
 * Saved hostels, for real.
 *
 * THE DASHBOARD'S "SAVED HOSTELS" SECTION WAS NOT SAVED HOSTELS. It rendered
 * `HostelCardListLive`, which calls `useHostels()` - the public catalogue - so
 * every student saw the same three newest listings under a heading claiming
 * they were theirs. The count beside it was the literal constant `12`. And the
 * "RECENTLY LISTED" section further down the same page rendered the SAME
 * component with the SAME query, so the page showed one list of hostels twice
 * under two different headings, neither of which described it.
 *
 * `favorites` IS THE SAVE TABLE, NOT `saved_hostels`. Both exist. `favorites`
 * is polymorphic (entity_type / entity_id) and is what /user/saved reads and
 * what the heart on a listing card writes; `saved_hostels` is from 0006 and has
 * never been read or written by a line of application code. Do not "fix" this
 * by using the more obviously named one - it is the dead table.
 *
 * TWO QUERIES, NOT A JOIN. `favorites` has no foreign key to hostels (it cannot
 * - it points at five different tables), so the ids come back first and the
 * hostels are fetched by id. That is also why a save pointing at a hostel that
 * has since been archived simply drops out rather than erroring.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { Row } from '@/lib/supabase/row';
import { unwrapList } from '@/lib/query/helpers';

type Client = SupabaseClient<Database>;

export interface SavedHostel {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  pricePerSessionKobo: number;
  imageUrl: string | null;
  savedAt: string;
}

export interface SavedHostels {
  items: SavedHostel[];
  /** How many are saved in total, which is not `items.length` when limited. */
  total: number;
}

/**
 * The caller's saved hostels, newest first.
 *
 * RLS on `favorites` is caller-scoped, so there is no student_id filter here
 * and adding one would be a second, weaker copy of the same rule.
 */
export async function fetchSavedHostels(db: Client, limit?: number): Promise<SavedHostels> {
  const favs = unwrapList<Row>(
    await db
      .from('favorites')
      .select('entity_id, created_at')
      .eq('entity_type', 'hostel')
      .order('created_at', { ascending: false }),
  );

  if (favs.length === 0) return { items: [], total: 0 };

  const ids = favs.map((f) => f.entity_id as string);
  const rows = unwrapList<Row>(
    await db
      .from('hostels')
      .select('id, slug, name, area, price_per_session_kobo, hostel_images(url, position)')
      .in('id', ids)
      // A student should not keep seeing a listing the landlord has withdrawn.
      .is('archived_at', null),
  );

  const byId = new Map(rows.map((r) => [r.id as string, r]));

  const items = favs
    // Annotated rather than inferred. `h.area as string` widens area to a
    // non-null string, so the inferred element type was NARROWER than
    // SavedHostel (whose area is nullable) and the `h is SavedHostel` predicate
    // below could not compile against it.
    .map((f): SavedHostel | null => {
      const h = byId.get(f.entity_id as string);
      if (!h) return null;
      const images = (h.hostel_images ?? []) as Row[];
      const first = [...images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
      return {
        id: h.id as string,
        slug: h.slug as string,
        name: h.name as string,
        area: (h.area as string) ?? null,
        pricePerSessionKobo: Number(h.price_per_session_kobo ?? 0),
        imageUrl: (first?.url as string) ?? null,
        savedAt: f.created_at as string,
      };
    })
    // Saves pointing at an archived or deleted hostel drop out here, which is
    // why `total` counts what RESOLVED rather than what was stored.
    .filter((h): h is SavedHostel => h !== null);

  return { items: limit ? items.slice(0, limit) : items, total: items.length };
}
