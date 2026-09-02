/**
 * The sign-in address for an account.
 *
 * IT IS NOT ON `profiles`
 *   Email lives in `auth.users`, which PostgREST does not expose, so it can
 *   only be read through the admin auth API. That is why review screens showed
 *   a name, a campus and a phone number but not the one identifier support and
 *   the reviewer actually correspond on.
 *
 * ONE ACCOUNT, ONE LOOKUP
 *   Every screen that wanted an email so far reached for
 *   `listUsers({ perPage: 1000 })` and searched the page   a thousand accounts
 *   pulled across to answer a question about one. That is the right shape for a
 *   LIST (one round trip for the whole page) and the wrong one for a detail
 *   page, which is what `getUserById` is for.
 *
 * A MISSING ADDRESS IS NOT AN ERROR
 *   Returns null rather than throwing. An email that cannot be read must not
 *   take down a verification screen: the decision on that page does not depend
 *   on it, and a reviewer with no contact line is better off than a reviewer
 *   looking at a 500.
 */
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export async function emailFor(id: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error) return null;
  return data.user?.email ?? null;
}
