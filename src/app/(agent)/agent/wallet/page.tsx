/**
 * ROUTE: /agent/wallet
 * ACCESS: the `agent` role.
 * PURPOSE: What an agent has earned, and what is on the way.
 *
 * THE WALLET ALREADY EXISTED   THE WAY IN DID NOT
 *   Every profile gets a wallet row on signup (`ensure_wallet`), so an agent has
 *   had one since the day they accepted their invite. What they did not have was
 *   a link to it, and the one shared link that exists   /wallet   redirected to
 *   /user/wallet, which the proxy gates to students. So an agent following it
 *   landed on /403: not a missing feature, an actively misleading one.
 *
 * IT WILL READ ZERO UNTIL INSPECTIONS SHIP, AND THAT IS THE TRUTH
 *   Nothing credits an agent yet. The inspection fee is the first thing that
 *   will   held in escrow at booking, released here when the visit is filed.
 *   An empty wallet that says so is a better answer than a page that does not
 *   exist, because "I have not been paid" and "there is nowhere to look" are
 *   different problems and only one of them is ours to fix later.
 *
 * SAME PANEL AS THE STUDENT'S, DELIBERATELY. It takes no props and reads the
 * caller's own wallet through RLS, so it is already role-neutral   only the
 * route around it ever was not. If a third role needs it, it should move to
 * components/account the way ProfileForm did.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProfile } from '@/modules/auth/queries';
import { WalletPanel } from '@/app/user/wallet/(components)/wallet-panel';

export const metadata: Metadata = { title: 'Wallet' };

export default async function Page() {
  const profile = await getProfile();
  const holdsRole =
    (profile?.role as string) === 'agent' || (profile?.roles as string[] | null)?.includes('agent');
  if (!holdsRole) redirect('/403');

  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-content-muted font-mono text-sm tracking-wide">AGENT / WALLET</p>
        <h1 className="font-display text-content mt-1 text-3xl">
          Your <span className="text-lime-deep">earnings.</span>
        </h1>
        <p className="text-content-muted mt-2 text-sm">
          What you have been paid for visits and inspections, and every movement behind the number.
        </p>
      </div>

      <WalletPanel />
    </section>
  );
}
