/**
 * Campuses - the institutions students belong to.
 *
 * Read-only reference data, like `areas`: seeded and edited by an admin through
 * the service role, never written from the app.
 *
 * NOT a new table. public.campuses predates this (identity_roles), is already
 * referenced by vendor_profiles.campus_id, and is already world-readable. What
 * the campus migration added is LOCATION - address, area, lat/lng - so the
 * address hangs off the campus row instead of being typed by every student.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Row } from '@/lib/supabase/row';

export interface Campus {
  id: string;
  /** Full institution name: "Kwara State University, Malete". */
  name: string;
  /** Short form students actually say: "KWASU". Always present - it is the PK-ish
   *  unique code on the table, not an optional nicety. */
  code: string;
  /** The campus address. Null only while a new campus is being set up. */
  address: string | null;
  /** Which service area the campus sits in; null when outside all of them. */
  area: string | null;
}

/**
 * Active campuses, in picker order.
 *
 * Readable signed-out: the campuses_select policy grants `anon` select on
 * active rows, which matters because this renders on the public signup form
 * before any account exists. Inactive campuses (the roadmap ones) are filtered
 * by the policy itself, so they cannot be picked before we serve them.
 */
export function useCampuses() {
  return useQuery({
    queryKey: ['campuses'] as const,
    queryFn: async (): Promise<Campus[]> => {
      const { data, error } = await createClient()
        .from('campuses')
        .select('id, code, name, address, area')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      // Reference data failing to load is not a reason to break signup - the
      // field renders empty and says so rather than throwing under the form.
      if (error || !data) return [];

      // `address`/`area` are newer than types/database.types.ts, which is
      // generated FROM the database. REGENERATE THE TYPES once the migration is
      // applied and this cast can go; the mapping below is what pins the shape
      // in the meantime.
      return (data as unknown as Row[]).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        code: r.code as string,
        address: (r.address as string | null) ?? null,
        area: (r.area as string | null) ?? null,
      }));
    },
    // Reference data. It changes when a campus is switched on, which is rare.
    staleTime: 60 * 60_000,
  });
}

/** "KWASU" - what students call it - with the full name as the subtitle. */
export function campusLabel(c: Campus): string {
  return c.code;
}
