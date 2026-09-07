/**
 * ROUTE: /rider/board
 * ACCESS: role=rider, enforced by the proxy.
 * PURPOSE: Unclaimed deliveries this rider may take.
 *
 * THE EMPTY BOARD IS NOT AN ERROR STATE
 *   open_delivery_board returns nothing for a rider who is unverified,
 *   suspended, or simply has no jobs waiting, and the RPC deliberately does not
 *   distinguish those with an exception   the screen renders the same either
 *   way and the banner above the list is what says which it is.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOpenBoard, getRiderProfile } from '@/modules/rider/queries';
import { RiderStatus } from '../(components)/rider-status';
import { JobBoard } from '../(components)/job-board';

export const metadata: Metadata = { title: 'Open jobs   Rider' };

export default async function Page() {
  const rider = await getRiderProfile();
  // Straight to the dashboard, which carries the set-up prompt. Sending them
  // to the form instead would skip the explanation of what is being asked.
  if (!rider) redirect('/rider');

  const jobs = await getOpenBoard();
  const canWork = rider.verificationStatus === 'verified' && !rider.suspendedAt;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">RIDER / BOARD</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Jobs to <span className="text-lime-deep">take.</span>
        </h2>
      </div>

      <RiderStatus rider={rider} />
      <JobBoard jobs={jobs} canWork={canWork} />
    </section>
  );
}
