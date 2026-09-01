/**
 * The open board: unclaimed jobs, and the tap that takes one.
 *
 * LOSING THE RACE IS A NORMAL OUTCOME, NOT AN ERROR
 *   Two riders tapping the same job at the same instant is the expected case on
 *   a busy campus, and the database settles it — delivery_offers_one_accepted_idx
 *   lets exactly one insert through. The loser gets "somebody already took this
 *   one", which is a sentence about the world rather than a failure of theirs,
 *   so it is shown on the card in plain type and the list refreshes underneath.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   The dropoff address. The board is visible to every online rider on the
 *   campus and that address belongs to a student who has not agreed to share it
 *   with any of them yet. Area, distance and fee are enough to decide on a job;
 *   claiming it is what unseals the rest.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MapPin, Navigation, Store } from 'lucide-react';
import { Button } from '@/components/ui';
import { formatKobo } from '@/lib/utils/format';
import { claimDelivery } from '@/modules/rider/actions';
import type { BoardJob } from '@/modules/rider/queries';

function distanceLabel(metres: number | null) {
  if (metres == null) return null;
  return metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;
}

export function JobBoard({ jobs, canWork }: { jobs: BoardJob[]; canWork: boolean }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});

  function claim(id: string) {
    setClaiming(id);
    setError((e) => ({ ...e, [id]: '' }));
    startTransition(async () => {
      try {
        await claimDelivery(id);
        // Straight to the job. A rider who has just taken one wants the address
        // and the phone number, not the board they were staring at.
        router.push('/rider');
      } catch (e) {
        setError((prev) => ({
          ...prev,
          [id]: e instanceof Error ? e.message : 'That did not go through.',
        }));
      } finally {
        setClaiming(null);
      }
    });
  }

  if (!canWork) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
        Jobs appear here once your account is verified and you are online.
      </p>
    );
  }

  if (jobs.length === 0) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
        No jobs waiting right now. This page updates when you reload it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {jobs.map((job) => {
        const mine = claiming === job.deliveryId;
        return (
          <div
            key={job.deliveryId}
            className="border-line/10 bg-panel flex flex-wrap items-center gap-4 rounded-xl border p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-content flex items-center gap-2 font-medium">
                <Store className="text-content-muted size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{job.vendorName}</span>
              </p>
              <p className="text-content-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {job.pickupAddress && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" aria-hidden="true" />
                    {job.pickupAddress}
                  </span>
                )}
                {job.dropoffArea && <span>to {job.dropoffArea}</span>}
                {distanceLabel(job.distanceMeters) && (
                  <span className="flex items-center gap-1">
                    <Navigation className="size-3" aria-hidden="true" />
                    {distanceLabel(job.distanceMeters)}
                  </span>
                )}
              </p>
              {error[job.deliveryId] && (
                <p className="text-coral mt-1 text-xs">{error[job.deliveryId]}</p>
              )}
            </div>

            <p className="text-content font-medium">{formatKobo(job.feeKobo)}</p>

            <Button disabled={busy} onClick={() => claim(job.deliveryId)}>
              {mine && <Loader2 className="animate-spin" aria-hidden="true" />}
              {mine ? 'Taking…' : 'Take it'}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
