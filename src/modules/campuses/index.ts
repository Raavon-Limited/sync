/**
 * Campuses - the institutions students attend, and whether Sync runs there.
 *
 * Read-only reference data, like `areas`: seeded and edited by an admin through
 * the service role, never written from the app.
 *
 * NOT a new table. public.campuses predates this (identity_roles), is already
 * referenced by vendor_profiles.campus_id, and is already world-readable. The
 * campus migration added LOCATION (address, area, lat/lng) and the
 * `is_serviced` flag.
 *
 * TWO BOOLEANS, and conflating them is the mistake to avoid:
 *   isActive    the row is real and selectable - true for every university, so
 *               a student can always find their own school
 *   isServiced  Sync actually operates there - true for KWASU only
 * A student at an unserviced campus is a real signup, not a rejection.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Row } from '@/lib/supabase/row';

export interface Campus {
  id: string;
  /** Full institution name: "Kwara State University, Malete". */
  name: string;
  /** Short form students say out loud: "KWASU". */
  code: string;
  /** Nigerian state, used to disambiguate similarly-named institutions. */
  state: string | null;
  /** Campus address, from the campus row rather than typed by the student. */
  address: string | null;
  /** Which service area the campus sits in; null when outside all of them. */
  area: string | null;
  /** Does Sync run here? Drives the "we are not here yet" notice at signup. */
  isServiced: boolean;
}

/**
 * Every selectable campus, serviced ones first.
 *
 * Readable signed-out - the campuses_select policy grants `anon` select on
 * active rows - because this renders on the public signup form before any
 * account exists.
 */
export function useCampuses() {
  return useQuery({
    queryKey: ['campuses'] as const,
    queryFn: async (): Promise<Campus[]> => {
      const { data, error } = await createClient()
        .from('campuses')
        .select('id, code, name, state, address, area, is_serviced')
        .eq('is_active', true)
        // Where we operate comes first; everything else alphabetically, because
        // a 100-entry list has no other meaningful order.
        .order('is_serviced', { ascending: false })
        .order('name', { ascending: true });

      // Reference data failing to load must not break signup - the field falls
      // back to accepting a typed university, which is a supported path anyway.
      if (error || !data) return [];

      // `state`, `address`, `area` and `is_serviced` are newer than
      // types/database.types.ts, which is generated FROM the database.
      // REGENERATE THE TYPES once the migration is applied and this cast can go.
      return (data as unknown as Row[]).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        code: r.code as string,
        state: (r.state as string | null) ?? null,
        address: (r.address as string | null) ?? null,
        area: (r.area as string | null) ?? null,
        isServiced: Boolean(r.is_serviced),
      }));
    },
    // Reference data. It changes when a campus is switched on, which is rare.
    staleTime: 60 * 60_000,
  });
}

/** The campuses Sync actually runs at - what "we are here" means. */
export function servicedCampuses(all: Campus[]): Campus[] {
  return all.filter((c) => c.isServiced);
}

/**
 * Rank campuses against what the student has typed.
 *
 * Matches the CODE and the NAME, because people type "KWASU" as readily as
 * "Kwara State University", and a list this size is unusable if only the full
 * name matches. A prefix match outranks a mid-string one so "UI" surfaces the
 * University of Ibadan rather than every name containing those letters.
 */
export function searchCampuses(all: Campus[], query: string, limit = 8): Campus[] {
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, limit);

  const scored: { campus: Campus; score: number }[] = [];
  for (const c of all) {
    const code = c.code.toLowerCase();
    const name = c.name.toLowerCase();

    let score = -1;
    if (code === q) score = 0;
    else if (code.startsWith(q)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (code.includes(q)) score = 4;
    if (score === -1) continue;

    // Where we operate wins ties - it is the answer most likely to be right,
    // and the one we would rather surface.
    scored.push({ campus: c, score: score * 2 + (c.isServiced ? 0 : 1) });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.campus.name.localeCompare(b.campus.name))
    .slice(0, limit)
    .map((s) => s.campus);
}
