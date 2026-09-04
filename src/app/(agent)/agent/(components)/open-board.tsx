/**
 * The open board - viewings nobody has taken yet.
 *
 * FIRST TAP WINS, AND THE LOSER IS TOLD SO
 *   Two agents can be looking at the same row. The database settles it
 *   (`inspection_claims_one_active_idx`), so one of them gets an error rather
 *   than a job that quietly belongs to someone else. That error is shown on the
 *   row it happened on, not in a toast that has scrolled away, because the next
 *   thing that agent does is look at the rest of the board.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   The student's name, their phone, and the street address. `open_inspection_board`
 *   does not return them. Every working agent on the campus can see this list,
 *   and the student agreed to meet one agent, not to have their number on a
 *   noticeboard. Claiming is what unseals it - and after claiming, the row moves
 *   into "Where you are expected" below with all of it.
 *
 * ONE TAP, NO CONFIRM STEP
 *   A confirm dialog on a race you can lose is a dialog that costs you the job.
 *   The commitment is real, so the button says what it costs in the line under
 *   the list rather than in a modal that has to be dismissed before you can act.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, MapPin, Wallet } from 'lucide-react';
import { Button } from '@/components/ui';
import { claimInspection } from '@/modules/agents/actions';

export interface BoardJob {
  inspectionId: string;
  hostelName: string;
  area: string | null;
  scheduledFor: string | null;
  feeKobo: number;
}

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

function when(iso: string | null): string {
  if (!iso) return 'no time agreed';
  return new Date(iso).toLocaleString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function OpenBoard({ jobs }: { jobs: BoardJob[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Keyed by inspection id: an error belongs to the row it came from.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  function take(id: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setBusy(id);
    startTransition(async () => {
      // NO MEETING POINT AT THIS MOMENT, on purpose. Claiming is a race and
      // every second spent typing is a second another agent is tapping. The
      // student is told "at the property" straight away, which is true and is
      // the common case, and the agent sets a pickup point afterwards on the
      // card below   which re-notifies them.
      const res = await claimInspection({ inspectionId: id });
      setBusy(null);
      if (res.ok) {
        // The row leaves this list and appears above, taken, with the student's
        // details and the meeting-point control on it.
        router.refresh();
      } else {
        setErrors((prev) => ({ ...prev, [id]: res.error }));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-content-muted font-mono text-xs tracking-wide uppercase">
          Open board · {jobs.length}
        </p>
        <p className="text-content-muted mt-1 text-sm">
          Paid viewings nobody has taken. First to tap gets it, and the student is told your name
          straight away.
        </p>
      </div>

      {jobs.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
          Nothing on the board right now. New viewings land here as students pay for them.
        </p>
      ) : (
        <ul className="border-line/10 divide-line/10 divide-y rounded-xl border">
          {jobs.map((job) => (
            <li key={job.inspectionId} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-content text-sm font-medium">{job.hostelName}</p>
                  <p className="text-content-muted mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {job.area ?? 'Malete'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {when(job.scheduledFor)}
                    </span>
                    <span className="text-lime-deep flex items-center gap-1 font-medium">
                      <Wallet className="size-3.5" />
                      {naira(job.feeKobo)}
                    </span>
                  </p>
                </div>

                <Button
                  disabled={pending && busy === job.inspectionId}
                  onClick={() => take(job.inspectionId)}
                >
                  {pending && busy === job.inspectionId ? 'Taking…' : 'Take it'}
                </Button>
              </div>

              {errors[job.inspectionId] && (
                <p className="text-coral text-xs">{errors[job.inspectionId]}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Said once, under the list, rather than in a dialog on every tap. */}
      <p className="text-content-muted text-xs">
        Taking one is a commitment. Miss the time and it goes back on the board for someone else —
        and you will not be able to take that one again.
      </p>
    </div>
  );
}
