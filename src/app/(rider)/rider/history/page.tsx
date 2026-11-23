/**
 * ROUTE: /rider/history
 * ACCESS: role=rider, enforced by the proxy.
 * PURPOSE: What this rider has finished, and what it paid.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui';
import { formatKobo } from '@/lib/utils/format';
import { getCompletedJobs, getRiderProfile } from '@/modules/rider/queries';

export const metadata: Metadata = { title: 'History   Rider' };

const TONE: Record<string, string> = {
  delivered: 'bg-lime/15 text-accent-fg',
  failed: 'bg-rose-500/10 text-rose-600',
  cancelled: 'bg-ink/5 text-content-muted',
};

export default async function Page() {
  const rider = await getRiderProfile();
  // Straight to the dashboard, which carries the set-up prompt. Sending them
  // to the form instead would skip the explanation of what is being asked.
  if (!rider) redirect('/rider');

  const jobs = await getCompletedJobs(50);
  const earned = jobs
    .filter((j) => j.status === 'delivered')
    .reduce((sum, j) => sum + j.feeKobo, 0);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">RIDER / HISTORY</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          What you have <span className="text-lime-deep">moved.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          {jobs.length === 0
            ? 'Nothing finished yet.'
            : `${jobs.length} finished · ${formatKobo(earned)} in delivery fees.`}
        </p>
      </div>

      {jobs.length > 0 && (
        <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
          {jobs.map((j) => (
            <div key={j.deliveryId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-content text-sm font-medium">Order {j.orderId.slice(0, 8)}</p>
                <p className="text-content-muted text-xs">
                  {j.deliveredAt
                    ? new Date(j.deliveredAt).toLocaleString('en-NG', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : 'No completion time recorded'}
                </p>
              </div>
              <Badge className={TONE[j.status] ?? TONE.cancelled}>{j.status}</Badge>
              {/* Only a delivered job paid. Showing the fee against a failed one
                  would read as money the rider is owed. */}
              <p className="text-content text-sm font-medium">
                {j.status === 'delivered' ? formatKobo(j.feeKobo) : ' '}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
