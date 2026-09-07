/**
 * Who runs Sync, and who may change that.
 *
 * SEPARATE FROM /admin/users ON PURPOSE
 *   That screen is the directory   every account on the platform, mostly
 *   students. This one answers a different question, asked far less often and
 *   with far more weight: who can open the console at all. Mixing them means
 *   the four rows that matter live at the bottom of a list of thousands.
 *
 * THE RPCS DO THE AUTHORISING, NOT THIS MODULE
 *   `set_account_role` refuses anyone who is not a super admin, refuses to
 *   remove the last one, and refuses to remove your own access   inside the
 *   database, where a request that skipped this module still hits it. Repeating
 *   those rules here would be a second copy to keep in step, so the page reads
 *   `isSuperAdmin` only to decide what to SHOW.
 */
import 'server-only';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'super_admin';
  createdAt: string;
  /**
   * THREE STATES, AND THE THIRD ONE IS WHY THIS IS NOT JUST `string | null`.
   *
   *   a date   they have signed in, and when.
   *   null     they never have. This is the point of the field: being granted
   *            access and using it are two events, and the roster only ever
   *            showed the first, so an admin who has never once opened the
   *            console looked identical to one who opens it daily. Deliberately
   *            not defaulted to the join date   "since Sept 2026" and "has
   *            never been here" are exactly the two facts that must not read as
   *            one.
   *   undefined  we do not know, because list_staff has not been upgraded yet
   *            (20260906120000). Collapsing this into null would put "Never
   *            signed in" against every row on any install that has not run
   *            the migration   including the person reading the page, who is
   *            demonstrably signed in. A false statement is worse than a
   *            missing one, so the console says nothing at all in this case.
   */
  lastSignInAt: string | null | undefined;
}

/** Everyone with console access, super admins first. */
export async function getStaff(): Promise<StaffMember[]> {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc('list_staff');

  return ((data ?? []) as Row[]).map((s) => ({
    id: s.id,
    name: s.full_name ?? 'No name set',
    email: s.email ?? ' ',
    role: s.role,
    createdAt: s.created_at,
    // Maintained by GoTrue on every sign-in; list_staff reads it straight off
    // auth.users (20260906120000) rather than us keeping a second copy.
    //
    // Tested for the KEY, not for a value: a row from the old function has no
    // such column, and `?? null` on a missing key is indistinguishable from a
    // genuine "never". See the three states on StaffMember.
    lastSignInAt:
      'last_sign_in_at' in s ? ((s.last_sign_in_at as string | null) ?? null) : undefined,
  }));
}

/**
 * Resolve an email to an account id.
 *
 * Reads `auth.users` through the admin client, because that is where email
 * lives   `profiles` has never had the column. Staff-only by virtue of where it
 * is called from, and it returns an id and nothing else: not a lookup anybody
 * could learn anything from beyond "this address has an account", which the
 * caller already has to be staff to ask.
 */
export async function findAccountByEmail(
  email: string,
): Promise<{ id: string; name: string } | null> {
  const admin = createAdminClient();
  const target = email.trim().toLowerCase();

  // listUsers is paged. One page of 1000 covers this platform comfortably;
  // when it does not, this becomes a paged loop rather than a silent miss.
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = (data?.users ?? []).find((u) => u.email?.toLowerCase() === target);
  if (!user) return null;

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  return { id: user.id, name: (profile as Row | null)?.full_name ?? user.email ?? 'No name set' };
}
