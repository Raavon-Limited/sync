/**
 * ROUTE: /agent/profile   (was /agent/card, redirected in next.config)
 * ACCESS: the `agent` role.
 * PURPOSE: The card an agent holds up at a gate, and the picture behind it.
 *
 * THIS IS THE ONE THAT MATTERS MOST
 *   Every other card answers "is this account real". An agent's answers "should
 *   I open my gate to this person" - asked by somebody standing alone at their
 *   own door, about a stranger with a camera who says Sync sent them. The QR is
 *   the answer, because it is the only part that cannot be printed by whoever
 *   turns up: it fetches a live answer, and an agent whose role was removed
 *   this morning scans as removed.
 *
 *   The picture is the other half of that. A code proves the CARD is real; the
 *   face is what ties it to the person holding it, which is why the upload sits
 *   directly under the card rather than on a settings page they would have no
 *   reason to open.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccountProfile } from '@/components/account/account-profile';
import { MySyncIdCard } from '@/components/account/my-sync-id-card';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';

export const metadata: Metadata = { title: 'Your Sync ID' };

// "Are they still an agent" is exactly what must not come from a cache.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [profile, user] = await Promise.all([getProfile(), getCurrentUser()]);
  if (!profile) redirect('/login?next=/agent/profile');

  const holdsRole =
    (profile.role as string) === 'agent' || (profile.roles as string[] | null)?.includes('agent');
  if (!holdsRole) redirect('/403');

  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-content-muted font-mono text-sm tracking-wide">YOUR ACCOUNT</p>
        <h1 className="font-display text-content mt-1 text-3xl">
          Your Sync <span className="text-lime-deep">ID.</span>
        </h1>
        <p className="text-content-muted mt-2 text-sm">
          Show this before you ask anybody for anything. Whoever scans the code gets a live answer
          from Sync, which is the part nobody can forge.
        </p>
      </div>

      <AccountProfile
        // Being an agent is a grant, not a document check: holding the role IS
        // the credential. Reporting the personal verification_status would put
        // "not verified" beside the card of somebody Sync deliberately sent.
        verificationStatus="verified"
        cardDescription="Download it, print it, keep it on your phone. Reissue it the moment a printed one goes missing   every copy stops working immediately."
        idCard={
          <MySyncIdCard
            kind="agent"
            holderName={profile.full_name}
            context="Sync agent"
            status="verified"
            memberSince={user?.created_at ?? null}
            photoUrl={profile.avatar_url}
            fileName="agent"
          />
        }
      />
    </section>
  );
}
