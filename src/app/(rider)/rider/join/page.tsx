/**
 * ROUTE: /rider/join
 * ACCESS: role=rider, enforced by the proxy.
 * PURPOSE: Turn a rider account into a reviewable one — vehicle, optional fleet,
 *          and the documents staff decide on.
 *
 * REACHABLE AFTER APPROVAL TOO, ON PURPOSE
 *   A rider whose documents were bounced comes back here to replace them, and
 *   the banner on /rider links straight to it. Sending an already-verified rider
 *   away would be right; sending a rejected one away would leave them with no
 *   way to fix anything.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getRiderProfile } from '@/modules/rider/queries';
import { RiderSignup } from './(components)/rider-signup';

export const metadata: Metadata = { title: 'Start riding — Rider' };

export default async function Page() {
  const rider = await getRiderProfile();
  // Nothing to do here once approved. Anyone still pending or bounced belongs
  // on this page.
  if (rider?.verificationStatus === 'verified') redirect('/rider');

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">RIDER / SIGN UP</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Start <span className="text-lime-deep">riding.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          A reviewer checks your documents against your live photo, usually within a day.
        </p>
      </div>

      <RiderSignup />
    </section>
  );
}
