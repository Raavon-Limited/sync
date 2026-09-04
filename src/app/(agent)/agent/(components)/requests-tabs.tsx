/**
 * An agent's viewing work, in the three states it is actually in.
 *
 * REQUESTS IS ITS OWN TAB
 *   The open board used to sit as a section BELOW the Taken/Completed tabs, so
 *   an agent with nothing taken saw two empty lists and had to scroll past both
 *   to reach the only thing on the screen worth looking at. The board is not a
 *   footnote to your own work   for a new agent it is the entire screen.
 *
 * TAKING ONE IS OFFERING A TIME, NOT BOOKING ONE
 *   The student paid and said roughly when they were free; they did not know
 *   which agent would come or when that agent could. So taking a request opens
 *   a form: when can you do it, and where will you meet. The student confirms
 *   or sends it back to the board.
 *
 * THE DEFAULT TAB FOLLOWS THE WORK. An agent with something waiting on them
 * lands on Taken; one with an empty queue lands on the board.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, MapPin, Wallet } from 'lucide-react';
import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { claimInspection } from '@/modules/agents/actions';
import { InspectionList, type AgentInspection } from './visit-list';

export interface BoardJob {
  inspectionId: string;
  hostelName: string;
  area: string | null;
  /** What the student asked for when they paid. A preference, not a booking. */
  scheduledFor: string | null;
  /** Their own words about when they are free. */
  availabilityNote: string | null;
  feeKobo: number;
}

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

function when(iso: string | null): string {
  if (!iso) return 'no preference given';
  return new Date(iso).toLocaleString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** `datetime-local` wants a local, second-less string, not an ISO one. */
function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RequestsTabs({
  taken,
  board,
}: {
  taken: AgentInspection[];
  board: BoardJob[];
}) {
  const active = taken.filter((i) => !['completed', 'cancelled', 'student_no_show', 'agent_no_show'].includes(i.status));
  const [tab, setTab] = useState<string>(active.length > 0 ? 'taken' : 'requests');

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-3">
      <TabsList>
        {/*
          "Taken" was ambiguous once taking one became an OFFER rather than a
          booking: it covered both "they have not answered yet" and "we are on
          for Friday", which are different days out. Upcoming is everything you
          are on the hook for, and each card says which of the two it is.
        */}
        <TabsTrigger value="requests">Requests ({board.length})</TabsTrigger>
        <TabsTrigger value="taken">Upcoming ({active.length})</TabsTrigger>
        <TabsTrigger value="completed">Completed ({taken.length - active.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="requests" className="flex flex-col gap-2">
        <OpenBoard jobs={board} />
      </TabsContent>

      <TabsContent value="taken">
        <InspectionList inspections={taken} only="active" />
      </TabsContent>

      <TabsContent value="completed">
        <InspectionList inspections={taken} only="completed" />
      </TabsContent>
    </Tabs>
  );
}

function OpenBoard({ jobs }: { jobs: BoardJob[] }) {
  const [offering, setOffering] = useState<BoardJob | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-content-muted text-sm">
        Paid viewings nobody has taken. Offer a time you can do — the student confirms it, or it
        comes back here for somebody else.
      </p>

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
                      They asked for {when(job.scheduledFor)}
                    </span>
                    <span className="text-lime-deep flex items-center gap-1 font-medium">
                      <Wallet className="size-3.5" />
                      {naira(job.feeKobo)}
                    </span>
                  </p>
                  {/* The student's own words. An agent cannot offer a sensible
                      time without them, and they were not on the board before. */}
                  {job.availabilityNote && (
                    <p className="text-content-muted mt-1 text-xs italic">
                      “{job.availabilityNote}”
                    </p>
                  )}
                </div>

                <Button onClick={() => setOffering(job)}>Offer a time</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-content-muted text-xs">
        Taking one is a commitment. Miss the agreed time and it goes back on the board — and you
        will not be able to take that one again.
      </p>

      <OfferSheet job={offering} onClose={() => setOffering(null)} />
    </div>
  );
}

/**
 * The offer.
 *
 * ONE TAP USED TO CLAIM IT OUTRIGHT, which meant the platform told a student a
 * meeting was arranged that neither party had agreed to. Two fields is the
 * whole cost of that not being a lie.
 */
function OfferSheet({ job, onClose }: { job: BoardJob | null; onClose: () => void }) {
  const router = useRouter();
  const [proposed, setProposed] = useState('');
  const [meeting, setMeeting] = useState('');
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Seeded from what the student asked for, because agreeing to their own
  // suggestion is the common case and should cost no typing.
  const value = proposed || toLocalInput(job?.scheduledFor ?? null);

  function submit() {
    if (!job) return;
    setError(null);
    start(async () => {
      const res = await claimInspection({
        inspectionId: job.inspectionId,
        meetingPoint: meeting,
        proposedFor: new Date(value).toISOString(),
      });
      if (res.ok) {
        setProposed('');
        setMeeting('');
        onClose();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Sheet open={job !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-line/10 shrink-0 border-b p-4">
          <SheetTitle>Offer a time</SheetTitle>
          <SheetDescription>{job?.hostelName}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            {job?.availabilityNote && (
              <p className="border-line/15 bg-surface-deep text-content rounded-lg border px-3 py-2 text-sm">
                They said: “{job.availabilityNote}”
              </p>
            )}

            <div className="flex flex-col gap-2">
              <label htmlFor="offer-when" className="text-content text-sm font-medium">
                When can you show them?
              </label>
              <Input
                id="offer-when"
                type="datetime-local"
                value={value}
                onChange={(e) => setProposed(e.target.value)}
              />
              <p className="text-content-muted text-xs">
                They asked for {when(job?.scheduledFor ?? null)}. Offer that or something else —
                they confirm either way.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="offer-where" className="text-content text-sm font-medium">
                Where will you meet them?
              </label>
              <Input
                id="offer-where"
                value={meeting}
                onChange={(e) => setMeeting(e.target.value)}
                placeholder="KWASU gate, by the bank — or leave blank for the property"
              />
            </div>

            <p className="text-content-muted text-xs">
              This takes the request off the board straight away, so nobody else can offer while
              they decide. If they cannot make it, it goes back for another agent and you will not
              be able to take it again.
            </p>
          </div>
        </div>

        <div className="border-line/10 bg-panel shrink-0 border-t p-4">
          {error && <p className="text-coral mb-2 text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={busy || !value} onClick={submit}>
              {busy ? 'Sending…' : 'Send the offer'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
