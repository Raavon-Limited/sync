/**
 * ROUTE: /rider
 * ACCESS: role=rider, enforced by the proxy.
 * PURPOSE: The shift — can I work, what am I carrying, and what have I earned.
 *
 * A RIDER WITH NO PROFILE IS SENT TO SIGN UP, NOT SHOWN AN EMPTY DASHBOARD
 *   Someone can hold the rider role without ever having filled in a vehicle or
 *   uploaded a document — claim_role and rider_profiles are separate writes, and
 *   an interrupted signup leaves exactly that gap.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { formatKobo } from '@/lib/utils/format';
import { getActiveJobs, getCompletedJobs, getRiderProfile } from '@/modules/rider/queries';
import { RiderStatus } from './(components)/rider-status';
import { ActiveJobs } from './(components)/active-jobs';

export const metadata: Metadata = { title: 'Your shift — Rider' };

export default async function Page() {
  const rider = await getRiderProfile();
  if (!rider) redirect('/rider/join');

  const [active, done] = await Promise.all([getActiveJobs(), getCompletedJobs(50)]);

  const delivered = done.filter((d) => d.status === 'delivered');
  const earned = delivered.reduce((sum, d) => sum + d.feeKobo, 0);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">RIDER</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Your <span className="text-lime-deep">shift.</span>
        </h2>
      </div>

      <RiderStatus rider={rider} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="In your hands" value={String(active.length)} />
        <Stat label="Delivered" value={String(rider.deliveriesCount || delivered.length)} />
        <Stat label="Fees earned" value={formatKobo(earned)} />
        <Stat label="Rating" value={rider.ratingAvg > 0 ? rider.ratingAvg.toFixed(1) : '—'} />
      </div>

      <div>
        <h3 className="text-content mb-2 font-medium">Carrying now</h3>
        <ActiveJobs jobs={active} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line/10 bg-panel rounded-xl border p-3">
      <p className="text-content truncate text-lg font-medium">{value}</p>
      <p className="text-content-muted text-[11px] tracking-wide uppercase">{label}</p>
    </div>
  );
}
