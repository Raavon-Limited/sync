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

/**
 * Every account's address, for a screen that lists people.
 *
 * The LIST counterpart to `emailFor`. One round trip for the whole page, which
 * is the shape the note above says is right here   the mistake it warns about
 * is using this for a detail page.
 *
 * An error returns an empty map rather than throwing, for the same reason
 * `emailFor` returns null: a roster that cannot resolve addresses should render
 * names and be slightly less useful, not 500.
 */
export async function emailsByAccount(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) return new Map();
  return new Map(
    (data.users ?? [])
      .filter((u) => u.email)
      .map((u) => [u.id, u.email as string] as const),
  );
}

/**
 * What to call somebody on screen.
 *
 * WHY THE EMAIL IS THE FALLBACK AND NOT A PLACEHOLDER
 *   `profiles.full_name` is null for anyone who has never filled it in, which
 *   is every agent who accepted an invite and only set a password. Five admin
 *   screens wrote `full_name ?? 'No name set'`, so those people appeared as
 *   that literal string   identical to each other, unsearchable, and impossible
 *   to tell apart in a dropdown. An account always has an address; it is a
 *   worse label than a name and an enormously better one than a placeholder.
 *
 *   'No name set' survives only as the third branch, for an account with
 *   neither. That is not reachable through normal sign-up and is left in so the
 *   return type stays a string.
 */
export function displayName(
  fullName?: string | null,
  email?: string | null,
): string {
  const named = fullName?.trim();
  if (named) return named;
  const address = email?.trim();
  if (address) return address;
  return 'No name set';
}
