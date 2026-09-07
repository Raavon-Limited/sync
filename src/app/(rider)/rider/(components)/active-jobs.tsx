/**
 * The job in the rider's hands: who to collect from, where it goes, and the one
 * button that moves it forward.
 *
 * ONE BUTTON, NOT A STATUS PICKER
 *   A delivery has exactly one legal next state at any moment   advance_delivery
 *   enforces that in the database   so offering a dropdown of every status would
 *   be offering four moves the server will refuse. The button says the next
 *   thing that can happen, and the only other exit is marking it failed.
 *
 * THE CONTACT DETAILS ONLY EXIST HERE
 *   open_delivery_board withholds the dropoff address and both phone numbers;
 *   my_active_delivery returns them. That line is the moment the rider took the
 *   job, and it is why this component and the board render different shapes of
 *   the same delivery.
 */
'use client';

import { useState, useTransition } from 'react';
import { Loader2, MapPin, Phone, Store } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { formatKobo } from '@/lib/utils/format';
import { advanceDelivery } from '@/modules/rider/actions';
import type { ActiveJob } from '@/modules/rider/queries';

/** What the rider can do next, per state. Mirrors advance_delivery's machine. */
const NEXT: Record<string, { status: string; label: string; busy: string }> = {
  assigned: { status: 'picked_up', label: 'I have collected it', busy: 'Confirming…' },
  picked_up: { status: 'delivering', label: 'On my way', busy: 'Starting…' },
  delivering: { status: 'delivered', label: 'Delivered', busy: 'Completing…' },
};

export function ActiveJobs({ jobs }: { jobs: ActiveJob[] }) {
  if (jobs.length === 0) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
        Nothing in your hands right now. Open jobs are on the board.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {jobs.map((job) => (
        <ActiveJobCard key={job.deliveryId} job={job} />
      ))}
    </div>
  );
}

function ActiveJobCard({ job }: { job: ActiveJob }) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = NEXT[job.status];

  function move(status: string) {
    setError(null);
    startTransition(async () => {
      try {
        await advanceDelivery(job.deliveryId, status);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not go through.');
      }
    });
  }

  return (
    <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-content flex items-center gap-2 font-medium">
          {job.vendorName}
          <Badge className="bg-lime/10 text-lime-deep">{job.status.replace('_', ' ')}</Badge>
        </p>
        <p className="text-content font-medium">{formatKobo(job.feeKobo)}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Leg
          icon={<Store className="size-3.5" aria-hidden="true" />}
          label="Collect from"
          value={job.pickupAddress ?? job.vendorName}
          phone={job.vendorPhone}
        />
        <Leg
          icon={<MapPin className="size-3.5" aria-hidden="true" />}
          label="Deliver to"
          value={job.dropoffAddress}
          phone={job.customerPhone}
          name={job.customerName}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {next && (
          <Button disabled={busy} onClick={() => move(next.status)}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {busy ? next.busy : next.label}
          </Button>
        )}
        {/* Deliberately quiet, and deliberately confirmed: a failed delivery is
            somebody's money and somebody's dinner, and it lands a human in the
            middle of it. */}
        <Button
          variant="ghost"
          className="text-coral"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                'Mark this delivery as failed?\n\nUse this only if you genuinely cannot complete it. ' +
                  'Support will have to sort out the order and the refund.',
              )
            ) {
              move('failed');
            }
          }}
        >
          Cannot deliver
        </Button>
        {error && <p className="text-coral w-full text-xs">{error}</p>}
      </div>
    </div>
  );
}

function Leg({
  icon,
  label,
  value,
  phone,
  name,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  phone?: string | null;
  name?: string | null;
}) {
  return (
    <div className="border-line/10 rounded-lg border p-3">
      <p className="text-content-muted flex items-center gap-1.5 text-[11px] tracking-wide uppercase">
        {icon}
        {label}
      </p>
      <p className="text-content mt-1 text-sm">{value}</p>
      {name && <p className="text-content-muted text-xs">{name}</p>}
      {phone && (
        // A tel: link rather than text: the rider is on a bike and should not be
        // copying a number out by hand.
        <a
          href={`tel:${phone}`}
          className="text-lime-deep mt-1 inline-flex items-center gap-1 text-xs"
        >
          <Phone className="size-3" aria-hidden="true" />
          {phone}
        </a>
      )}
    </div>
  );
}
