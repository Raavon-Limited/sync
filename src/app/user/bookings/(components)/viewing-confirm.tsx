/**
 * "Did your viewing happen?" - the student's half of a paid inspection.
 *
 * WHY THIS SCREEN HAD TO EXIST
 *   `settle_inspection` has always let a student confirm their own visit as
 *   'completed', and nothing in the product ever called it. So every agent fee
 *   waited the full 24-hour auto-release, and an agent who never turned up was
 *   paid anyway unless a staff member happened to intervene. The permission was
 *   there; the button was not.
 *
 * CONFIRMING PAYS SOMEBODY, SO IT SAYS SO
 *   The student is not filling in a satisfaction survey   they are releasing
 *   ₦5,000 to the person who showed them round. That is stated on the button's
 *   own line rather than discovered afterwards.
 *
 * "NOBODY CAME" DOES NOT SETTLE ANYTHING, DELIBERATELY
 *   20260906180000 is explicit that neither party may declare the other a
 *   no-show, and that rule is right: an accusation should not move money in
 *   either direction. Disputing clears `release_after`, which stops the sweep,
 *   and fetches staff. Nothing is taken from anyone by pressing it.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { confirmViewing, disputeViewing } from '@/modules/hostels/inspection-actions';

export interface StudentInspection {
  id: string;
  hostelName: string;
  scheduledFor: string;
  status: string;
  feeKobo: number;
  agentName: string | null;
  meetingPoint: string | null;
  reportFiledAt: string | null;
  disputedAt: string | null;
}

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

export function ViewingConfirm({ inspections }: { inspections: StudentInspection[] }) {
  if (inspections.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-content-muted font-mono text-xs tracking-wide uppercase">
        Your viewings
      </p>
      <div className="flex flex-col gap-3">
        {inspections.map((i) => (
          <ViewingCard key={i.id} inspection={i} />
        ))}
      </div>
    </div>
  );
}

function ViewingCard({ inspection: i }: { inspection: StudentInspection }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');

  // Only once the time has actually passed. Asking "did it happen?" about a
  // viewing that is still three hours away is a question with no answer.
  const past = new Date(i.scheduledFor).getTime() < Date.now();
  const settled = i.status !== 'scheduled';
  const answerable = past && !settled && !i.disputedAt;

  function confirm() {
    setError(null);
    start(async () => {
      const res = await confirmViewing(i.id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function dispute() {
    setError(null);
    start(async () => {
      const res = await disputeViewing({ inspectionId: i.id, reason });
      if (res.ok) {
        setAsking(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="border-line/10 bg-panel flex min-w-0 flex-col gap-3 rounded-xl border p-3 sm:p-4">
      <div className="min-w-0">
        <p className="text-content truncate font-medium">{i.hostelName}</p>
        <p className="text-content-muted mt-0.5 flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3.5 shrink-0" />
            {new Date(i.scheduledFor).toLocaleString('en-NG', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
          {/* The agent set this and it is the only thing that tells the student
              where to stand. It belongs above everything else on the card. */}
          <span className="flex min-w-0 items-center gap-1">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">
              {i.meetingPoint ? `Meet at ${i.meetingPoint}` : 'Meet at the property'}
            </span>
          </span>
        </p>
        {i.agentName && (
          <p className="text-content-muted mt-1 text-xs">Your agent is {i.agentName}.</p>
        )}
      </div>

      {i.disputedAt && (
        <p className="text-content-muted border-line/15 bg-surface-deep rounded-lg border px-3 py-2 text-xs">
          You told us this did not happen. Staff are looking at it and the fee is on hold — nothing
          has been paid out.
        </p>
      )}

      {answerable && !asking && (
        <div className="flex flex-col gap-2">
          <p className="text-content text-sm">Did this viewing happen?</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="w-full sm:w-auto" disabled={busy} onClick={confirm}>
              {busy ? 'Confirming…' : 'Yes, we viewed it'}
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => setAsking(true)}
            >
              No, nobody came
            </Button>
          </div>
          {/* Said before the tap, because it moves money. */}
          <p className="text-content-muted text-xs">
            Confirming pays your agent {naira(i.feeKobo)} straight away. If you say nothing, it
            releases on its own 24 hours after they file.
          </p>
        </div>
      )}

      {answerable && asking && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`why-${i.id}`} className="text-content text-sm font-medium">
            What happened?
          </label>
          <textarea
            id={`why-${i.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Did you wait? Did you reach them?"
            className="border-line/15 bg-surface-deep text-content placeholder:text-content-muted/60 rounded-lg border px-3 py-2 text-sm"
          />
          <p className="text-content-muted text-xs">
            This holds the fee and sends it to staff. Nothing is taken from anybody.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              disabled={busy}
              onClick={() => setAsking(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              disabled={busy || !reason.trim()}
              onClick={dispute}
            >
              {busy ? 'Sending…' : 'Tell staff'}
            </Button>
          </div>
        </div>
      )}

      {!answerable && !settled && !i.disputedAt && (
        <p className="text-content-muted text-xs">
          {i.reportFiledAt
            ? 'Your agent has filed their report. You will be asked to confirm after the viewing time.'
            : 'Not yet. We will ask you to confirm once the time has passed.'}
        </p>
      )}

      {error && <p className={cn('text-coral text-xs')}>{error}</p>}
    </div>
  );
}
