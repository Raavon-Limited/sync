/**
 * A student's own identity row, and their own verification status.
 *
 * WHY THIS IS NOT `profiles.verification_status`
 *   That column is the MIRROR of `vendor_profiles` (20260901100000), kept in
 *   step by a trigger that fires on every business decision. One account can be
 *   a student and a vendor at the same time, so reading a student's status from
 *   there means the next thing a reviewer does to their business overwrites it.
 *   `student_profiles` is the authority for the student half. See
 *   20260903180000.
 *
 * READS RUN AS THE STUDENT. The select policy already limits them to their own
 * row, so a bug here shows up as missing data rather than as somebody else's.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';

/**
 * student_profiles postdates the checked-in generated types. Same escape hatch
 * as modules/admin/roles - REGENERATE once 20260903180000 is applied.
 */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

export interface StudentIdentity {
  matricNumber: string | null;
  department: string | null;
  level: string | null;
  verificationStatus: string;
}

const EMPTY: StudentIdentity = {
  matricNumber: null,
  department: null,
  level: null,
  verificationStatus: 'unverified',
};

/** The signed-in student's own row. Absent until they first save something. */
export async function getMyStudentIdentity(): Promise<StudentIdentity> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  const { data, error } = await loose(supabase)
    .from('student_profiles')
    .select('matric_number, department, level, verification_status')
    .eq('id', user.id)
    .maybeSingle();

  // Missing table means the migration has not been applied. Answering "not
  // verified, nothing filled in" keeps the page usable and is the truth as far
  // as anything can tell.
  if (error) {
    console.error('[students] identity unavailable:', error.message);
    return EMPTY;
  }

  const row = data as Row | null;
  if (!row) return EMPTY;

  return {
    matricNumber: (row.matric_number as string) ?? null,
    department: (row.department as string) ?? null,
    level: (row.level as string) ?? null,
    verificationStatus: (row.verification_status as string) ?? 'unverified',
  };
}

/**
 * Student rows for staff, keyed by id.
 *
 * Service role, because the admin list reads everybody. The page above it has
 * already established the caller is staff and holds the `students` area.
 */
export async function getStudentIdentities(ids: string[]): Promise<Map<string, StudentIdentity>> {
  const out = new Map<string, StudentIdentity>();
  // An empty `.in()` matches everything in PostgREST, so the guard is
  // load-bearing rather than a micro-optimisation.
  if (ids.length === 0) return out;

  const { data, error } = await loose(createAdminClient())
    .from('student_profiles')
    .select('id, matric_number, department, level, verification_status')
    .in('id', ids);

  if (error) {
    console.error('[students] identities unavailable:', error.message);
    return out;
  }

  for (const row of (data ?? []) as Row[]) {
    out.set(row.id as string, {
      matricNumber: (row.matric_number as string) ?? null,
      department: (row.department as string) ?? null,
      level: (row.level as string) ?? null,
      verificationStatus: (row.verification_status as string) ?? 'unverified',
    });
  }
  return out;
}
