/**
 * "Is the caller a working agent?" - asked once, for both agent screens.
 *
 * The proxy gates the /agent prefix already. This is the second ask, on the
 * page itself, for the reason the layout's header gives: an agent holds
 * somebody's address and the role can only arrive by invitation, so the cheapest
 * thing to get wrong here is the most expensive to discover.
 *
 * HOLDING THE ROLE, NOT WEARING IT. `role` is a single current role and `roles`
 * is everything the account holds; an admin who also does visits has 'agent' in
 * the second and something else in the first. Reading only `role` would lock
 * them out of their own queue.
 *
 * Returns the user, because both callers need the id immediately afterwards to
 * filter their own rows and would otherwise re-fetch it.
 */
import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';

export async function requireAgent() {
  const [profile, user] = await Promise.all([getProfile(), getCurrentUser()]);
  if (!profile || !user) redirect('/login?next=/agent');

  // Read as a plain string: Profile['role'] is a union that predates the agent
  // role existing, and widening it here would ripple into every gate that
  // reads it.
  const holdsRole =
    (profile.role as string) === 'agent' || (profile.roles as string[] | null)?.includes('agent');
  if (!holdsRole) redirect('/403');

  return user;
}
