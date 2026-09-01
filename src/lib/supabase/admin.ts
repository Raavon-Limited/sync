/**
 * Admin (service-role) Supabase client. Bypasses RLS - use ONLY in trusted
 * server code (server actions / admin pages) for privileged operations like
 * archiving/restoring/purging accounts and reading every profile.
 *
 * NEVER import this into a client component. The service-role key is server-only.
 */
import 'server-only';
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

export function createAdminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVER_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * The same service-role client with the generated schema types dropped.
 *
 * `types/database.types.ts` is generated from the applied migrations, so a table
 * or column added by a migration that has not been regenerated yet — currently
 * `logistics_companies`, `rider_profiles.company_id`, `profiles.suspended_at` —
 * is a COMPILE error on the typed client, not a runtime one.
 *
 * Rows come back as `Record<string, unknown>` and every admin page already
 * narrows them that way, so nothing is lost but the column-name checking, and
 * that returns the moment the types are regenerated.
 *
 * REGENERATE THE TYPES once 20260901270000 is applied, then delete this and the
 * `untyped` reads that use it.
 */
export function createUntypedAdminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}
