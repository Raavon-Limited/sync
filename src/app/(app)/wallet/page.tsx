/**
 * ROUTE: /wallet
 * ACCESS: authenticated student
 *
 * REDIRECT, NOT A SECOND IMPLEMENTATION
 *   The wallet screen already exists, wired to the ledger. A second one would
 *   be two places to fix every balance bug, and two screens that can disagree
 *   about how much money somebody has. This route is kept because links to it
 *   exist; it points at the real one.
 *
 * TO THE ONE THIS CALLER CAN OPEN, WHICH IT DID NOT USED TO DO
 *   It sent everybody to /user/wallet, and the proxy gates /user to students.
 *   So a rider, an agent, a landlord or an organiser following any wallet link
 *   in the product arrived at /403   a dead end at the end of a redirect, which
 *   is worse than a missing link because it reads as "you are not allowed money"
 *   rather than "this page moved".
 *
 *   Roles with a screen of their own go to it. The rest go to the student
 *   wallet, which is correct for them: /user is where a person without a
 *   business dashboard lives.
 */
import { redirect } from 'next/navigation';
import { getProfile } from '@/modules/auth/queries';

/** Where each role's money actually lives. */
const WALLET_HOME: Record<string, string> = {
  agent: '/agent/wallet',
  vendor: '/vendor/earnings',
  landlord: '/landlord/earnings',
  student: '/user/wallet',
};

export default async function Page() {
  const profile = await getProfile();
  redirect(WALLET_HOME[(profile?.role as string) ?? 'student'] ?? '/user/wallet');
}
