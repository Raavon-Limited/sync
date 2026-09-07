/**
 * Hostel verification visits.
 *
 * THE PREVIOUS SCREEN WAS ABOUT A DIFFERENT THING
 *   It modelled vendor store inspections   statuses Scheduled / In Progress /
 *   Completed / Failed, an "inspector", a vendor category. The table this route
 *   is named after is `verification_visits`: an ambassador visits a
 *   HOSTEL, uploads photos, and staff decide whether it is real. Vendor store
 *   inspection has no table at all, so that screen could never have been wired.
 *
 * A GRID OF CARDS, AND THE WORK HAPPENS IN A PANEL
 *   This was one column of tall cards, each carrying the evidence, the agent
 *   picker and the decision inline. Ten visits made a page you scrolled past
 *   rather than scanned, and the question the screen answers first   "what is
 *   waiting on me"   needed the whole column read to answer.
 *
 *   So the card became a summary you take in at a glance, several to a row, and
 *   everything you DO with a visit moved into a side panel behind it. The card
 *   says what state it is in; the panel is where you look at the listing, send
 *   somebody, and decide.
 *
 * EVIDENCE IS STILL THE POINT
 *   The panel shows the landlord's claims and the agent's photographs together,
 *   because the decision is whether the second corroborates the first. A visit
 *   with no evidence says so, and cannot be decided at all   see DECIDABLE.
 */
'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import {
  Loader2,
  MapPin,
  Calendar,
  Video,
  StickyNote,
  AlertTriangle,
  Camera,
  UserRound,
  LayoutGrid,
  List,
  ShieldAlert,
} from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/ui';
import { HostelFacts, type HostelFactsData } from '@/components/shared/hostel-facts';
import { PhotoGrid } from '@/components/shared/photo-grid';
import { decideHostelVisit, flagVisitFraud, scheduleHostelVisit } from '@/modules/admin/actions';
import { assignVisit, reassignVisit } from '@/modules/agents/actions';

export interface AdminVisit {
  id: string;
  hostelId: string;
  hostelName: string;
  hostelArea: string | null;
  hostelVerified: boolean;
  /**
   * Everything the listing claims, for the side panel. Null only if the hostel
   * row went missing under a visit that still points at it.
   */
  hostel: HostelFactsData | null;
  ambassadorId: string | null;
  ambassadorName: string | null;
  status: string;
  scheduledFor: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  /** Who verified, rejected or flagged it. On the row since 0006, never read. */
  decidedByName: string | null;
  photos: string[];
  videoUrl: string | null;
  /** The agent, at the property. Its own field because it proves a different
   *  thing from the photos   see 20260909180000. */
  selfieUrl: string | null;
  notes: string | null;
}

export interface UnvisitedHostel {
  id: string;
  name: string;
  area: string | null;
  /**
   * The listing itself, so this row opens the same panel a visit does.
   *
   * These are the hostels with NO visit row, which means they are the ones a
   * reviewer is deciding whether to send somebody to   and that decision wants
   * the address, the photos and the price as much as a decided visit does. The
   * row used to be a name, an area and a scheduler, and clicking it did
   * nothing, which read as the whole screen being broken.
   */
  hostel: HostelFactsData | null;
}

/** Who can be sent. Same shape the agents console uses, for the same reason. */
export interface AgentOption {
  id: string;
  name: string;
  suspended: boolean;
  /** Visits assigned and not yet decided   the load you are adding to. */
  open: number;
}

/** A visit whose agent can still be changed. Past this, the evidence on the row
 *  belongs to whoever filed it and reassigning would misattribute it. */
const REASSIGNABLE = new Set(['Not Visited', 'Visit Scheduled']);

/**
 * A visit can only be decided once the agent has filed.
 *
 * `submit_verification_visit` refuses a submission with no photograph, so
 * "Under Review" is a reliable proxy for "there is evidence to look at". Before
 * that, the buttons were live from the moment a visit was SCHEDULED   a verified
 * badge could be issued on a building nobody had been to, which is the one
 * thing that badge cannot survive.
 *
 * `decideHostelVisit` enforces the same rule server-side. This is the half that
 * stops somebody trying.
 */
const DECIDABLE = 'Under Review';

const STATUS_BADGE: Record<string, string> = {
  'Not Visited': 'bg-ink/5 text-content-muted',
  'Visit Scheduled': 'bg-blue-500/10 text-blue-600',
  // DEEPER THAN THE REST, on purpose. This is the only status that is waiting
  // on the person reading the screen; a 10% tint made the one actionable state
  // the faintest thing on the card.
  'Under Review': 'bg-amber-500 text-white',
  Verified: 'bg-emerald-500/10 text-emerald-600',
  Rejected: 'bg-rose-500/10 text-rose-600',
  Fraud: 'bg-rose-600 text-white',
};

const FILTERS = ['all', 'Visit Scheduled', 'Under Review', 'Verified', 'Rejected', 'Fraud'];

const FIELD = 'border-line/15 bg-surface-deep text-content rounded-lg border px-3 py-2 text-sm';

function whenText(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-NG') : 'Not scheduled';
}

export function VisitsQueue({
  visits,
  unvisited,
  agents,
}: {
  visits: AdminVisit[];
  unvisited: UnvisitedHostel[];
  agents: AgentOption[];
}) {
  const [filter, setFilter] = useState('all');
  /**
   * Grid or list, for BOTH sections at once.
   *
   * Two different layouts on one page would be a page that looks like two
   * pages. Grid is for scanning   the amber ones stand out   and list is for
   * working through a long queue in order, which is what a reviewer with
   * forty listings actually wants.
   */
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The agent and date drafts moved into each row, which owns them   the
  // parent was holding a map keyed by id purely because the markup was inline.

  // Suspended agents stay out of every picker: they are still agents, and
  // sending one is a mistake the list should not offer to make.
  const assignable = agents.filter((a) => !a.suspended);

  const visible = visits.filter((v) => filter === 'all' || v.status === filter);

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed');
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === f
                ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
                : 'border-line/10 text-content-muted hover:text-content'
            }`}
          >
            {f}
          </button>
        ))}
        {pending && <Loader2 className="text-content-muted size-4 animate-spin" />}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
            className={`rounded-lg border p-1.5 transition-colors ${
              view === 'grid'
                ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
                : 'border-line/10 text-content-muted hover:text-content'
            }`}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            className={`rounded-lg border p-1.5 transition-colors ${
              view === 'list'
                ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
                : 'border-line/10 text-content-muted hover:text-content'
            }`}
          >
            <List className="size-4" />
          </button>
        </div>
      </div>

      {error && (
        <p className="text-coral border-coral/30 bg-coral/5 rounded-lg border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {visible.length === 0 && (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          {filter === 'all'
            ? unvisited.length > 0
              ? `No visits scheduled yet. The ${unvisited.length} listing${unvisited.length === 1 ? '' : 's'} below are waiting for one   open one to see it, then send an agent.`
              : 'No visits yet.'
            : `Nothing is ${filter.toLowerCase()}.`}
        </p>
      )}

      {/* THE GRID. Three across on a desktop, one on a phone   a reviewer
          working a queue is scanning for the amber ones, and that is a shape
          you read rather than scroll. */}
      {visible.length > 0 && (
        <div
          className={
            view === 'grid'
              ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'
              : 'flex flex-col gap-2'
          }
        >
          {visible.map((v) => (
            <VisitCard
              key={v.id}
              visit={v}
              agents={assignable}
              pending={pending}
              run={run}
              view={view}
            />
          ))}
        </div>
      )}

      {/* Hostels nobody has been sent to yet   the queue behind the queue,
          and in practice the one that matters on a young platform, where every
          listing is waiting for a first visit. */}
      {unvisited.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-content-muted font-mono text-sm tracking-wide">
            AWAITING A VISIT · {unvisited.length}
          </h2>
          <div
            className={
              view === 'grid'
                ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'
                : 'border-line/10 divide-line/5 divide-y rounded-xl border'
            }
          >
            {unvisited.map((h) => (
              <UnvisitedItem
                key={h.id}
                hostel={h}
                agents={assignable}
                pending={pending}
                run={run}
                view={view}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * One visit in the grid, and everything you can do to it.
 *
 * THE WHOLE CARD IS THE TRIGGER, which is why it holds no buttons of its own.
 * A card with an inline Verify AND a click-anywhere-to-open is a card that
 * opens a panel when you meant to press Verify.
 */
function VisitCard({
  visit: v,
  agents,
  pending,
  run,
  view,
}: {
  visit: AdminVisit;
  agents: AgentOption[];
  pending: boolean;
  run: (fn: () => Promise<unknown>) => void;
  view: 'grid' | 'list';
}) {
  const [notes, setNotes] = useState('');
  const [fraudReason, setFraudReason] = useState('');
  const [picked, setPicked] = useState<string>(v.ambassadorId ?? '');

  const settled = v.status === 'Verified' || v.status === 'Rejected' || v.status === 'Fraud';
  const hasEvidence = v.photos.length > 0 || !!v.videoUrl || !!v.selfieUrl || !!v.notes;
  // The listing's own primary photo, falling back to the agent's first shot so
  // a card is not blank the moment there is anything to show.
  const thumb = v.hostel?.images?.[0] ?? v.photos[0];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className={
            view === 'grid'
              ? 'border-line/10 bg-panel hover:border-line/30 flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-colors'
              : 'hover:bg-surface-deep flex w-full items-center gap-3 px-4 py-3 text-left transition-colors'
          }
        >
          <div
            className={
              view === 'grid'
                ? 'bg-surface-deep relative aspect-video w-full overflow-hidden rounded-lg'
                : 'bg-surface-deep relative size-14 shrink-0 overflow-hidden rounded-lg'
            }
          >
            {thumb ? (
              <Image
                src={thumb}
                alt={v.hostelName}
                fill
                sizes="(max-width: 640px) 100vw, 33vw"
                className="object-cover"
              />
            ) : (
              <span className="text-content-muted absolute inset-0 grid place-items-center text-xs">
                No photo yet
              </span>
            )}
            {view === 'grid' && (
              <Badge
                className={`absolute top-2 right-2 ${STATUS_BADGE[v.status] ?? STATUS_BADGE['Not Visited']}`}
              >
                {v.status}
              </Badge>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-content flex items-center gap-2 truncate font-medium">
              {v.hostelName}
              {view === 'list' && (
                <Badge className={STATUS_BADGE[v.status] ?? STATUS_BADGE['Not Visited']}>
                  {v.status}
                </Badge>
              )}
              {v.hostelVerified && (
                <Badge className="bg-emerald-500/10 text-emerald-600">verified</Badge>
              )}
            </p>
            <p className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {v.hostelArea ?? 'No area'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="size-3" />
                {whenText(v.scheduledFor)}
              </span>
            </p>
            <p className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="flex items-center gap-1">
                <UserRound className="size-3" />
                {v.ambassadorName ?? 'Unassigned'}
              </span>
              <span className="flex items-center gap-1">
                <Camera className="size-3" />
                {v.photos.length} photo{v.photos.length === 1 ? '' : 's'}
              </span>
            </p>
          </div>
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader className="pr-8 pb-4">
          {/* The hostel name is the SheetTitle AND was the first line of
              HostelFacts directly below it, so the panel opened with the same
              name twice and the evidence appeared again further down. The tabs
              are what removed the second copy of everything. */}
          <SheetTitle>{v.hostelName}</SheetTitle>
          <SheetDescription>
            The decision is whether the agent&rsquo;s findings corroborate the listing.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-4">
          {/*
            THREE TABS, BECAUSE A REVIEW IS THREE READS.
            What is claimed, what was found, and what you do about it. They were
            one long scroll, so comparing a listing photo against an agent photo
            meant scrolling between them from memory   which is the entire job.

            It opens on Findings when there is something to decide, and on the
            Listing otherwise: a scheduled visit has no findings yet.
          */}
          <Tabs defaultValue={v.status === DECIDABLE ? "findings" : "listing"}>
            <TabsList className="w-full">
              <TabsTrigger value="listing" className="flex-1">
                Listing
              </TabsTrigger>
              {/* NO SEPARATE DECISION TAB. The decision IS looking at the
                  evidence   putting the buttons behind a tab meant deciding
                  from memory of the photographs you had just navigated away
                  from, which is the same mistake as splitting the listing
                  from the findings. They live at the foot of Findings. */}
              <TabsTrigger value="findings" className="flex-1">
                Findings &amp; decision
              </TabsTrigger>
            </TabsList>

            <TabsContent value="listing" className="pt-4">
              {/* THE SAME COMPONENT the account view renders, so the two cannot
                  drift   a field added there shows up here the same day. */}
              {v.hostel && <HostelFacts hostel={v.hostel} />}
            </TabsContent>

            <TabsContent value="findings" className="flex flex-col gap-4 pt-4">
              {hasEvidence ? (
                <>
                  {v.photos.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-content-muted font-mono text-xs tracking-wide uppercase">
                        What the agent photographed
                      </h3>
                      <PhotoGrid photos={v.photos} label="Agent photo" />
                    </section>
                  )}

                  {/* THE ONE PIECE OF EVIDENCE ABOUT THE AGENT rather than the
                      building. It has been collected since 20260909180000 and
                      never shown, which is why this panel only ever had a single
                      picture on it. */}
                  <section className="flex flex-col gap-2">
                    <h3 className="text-content-muted font-mono text-xs tracking-wide uppercase">
                      The agent, at the property
                    </h3>
                    {v.selfieUrl ? (
                      <PhotoGrid photos={[v.selfieUrl]} label="The agent there" />
                    ) : (
                      <p className="text-content-muted flex items-center gap-1 text-xs">
                        <AlertTriangle className="size-3 shrink-0" />
                        None. Photos of a building do not prove who took them.
                      </p>
                    )}
                  </section>

                  <section className="flex flex-col gap-2">
                    <h3 className="text-content-muted font-mono text-xs tracking-wide uppercase">
                      Walkthrough
                    </h3>
                    {v.videoUrl ? (
                      <video
                        src={v.videoUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="border-line/10 max-h-64 w-full rounded-lg border bg-black"
                      />
                    ) : (
                      <p className="text-content-muted flex items-center gap-1 text-xs">
                        <Video className="size-3 shrink-0" /> None submitted.
                      </p>
                    )}
                  </section>

                  {v.notes && (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-content-muted font-mono text-xs tracking-wide uppercase">
                        What they wrote
                      </h3>
                      <p className="text-content flex items-start gap-1.5 text-sm">
                        <StickyNote className="mt-0.5 size-3.5 shrink-0" />
                        {v.notes}
                      </p>
                    </section>
                  )}
                </>
              ) : (
                <p className="text-content-muted flex items-center gap-1 text-xs">
                  <AlertTriangle className="size-3" />
                  No photos, video or notes submitted yet.
                </p>
              )}

              <div className="border-line/10 mt-2 border-t pt-4" />

          {/* Who is going. Until this existed the screen could schedule a visit
              and never name anybody, so a row read "Visit Scheduled" with
              nobody on their way to it. */}
          {REASSIGNABLE.has(v.status) && (
            <section className="flex flex-col gap-2">
              <h3 className="text-content-muted font-mono text-xs tracking-wide uppercase">
                Who is going
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={picked}
                  onChange={(e) => setPicked(e.target.value)}
                  className={`${FIELD} max-w-56`}
                  aria-label={`Agent for ${v.hostelName}`}
                >
                  <option value="">Nobody assigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.open} open
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  disabled={pending || picked === (v.ambassadorId ?? '')}
                  onClick={() =>
                    run(() => reassignVisit({ visitId: v.id, agentId: picked || null }))
                  }
                >
                  {v.ambassadorId ? 'Reassign' : 'Assign'}
                </Button>
                {v.ambassadorId && (
                  <Button
                    variant="outline"
                    className="text-coral"
                    disabled={pending}
                    onClick={() => {
                      setPicked('');
                      run(() => reassignVisit({ visitId: v.id, agentId: null }));
                    }}
                  >
                    Stand down
                  </Button>
                )}
                {agents.length === 0 && (
                  <p className="text-content-muted text-xs">
                    No agents available invite one from Agents.
                  </p>
                )}
              </div>
            </section>
          )}

          {!settled && v.status !== DECIDABLE && (
            <p className="text-content-muted flex items-center gap-1.5 text-xs">
              <AlertTriangle className="size-3.5 shrink-0" />
              {v.ambassadorName
                ? `Waiting on ${v.ambassadorName} to visit and file their report. Nothing can be decided until then.`
                : 'Assign an agent above. A listing cannot be verified until somebody has been and filed a report.'}
            </p>
          )}

          {!settled && v.status === DECIDABLE && (
            <section className="flex flex-col gap-2">
              <h3 className="text-content-muted font-mono text-xs tracking-wide uppercase">
                Your decision
              </h3>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Decision note (optional)"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      decideHostelVisit({
                        visitId: v.id,
                        hostelId: v.hostelId,
                        decision: 'Verified',
                        notes,
                      }),
                    )
                  }
                >
                  Verify hostel
                </Button>
                <Button
                  variant="outline"
                  className="text-coral"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      decideHostelVisit({
                        visitId: v.id,
                        hostelId: v.hostelId,
                        decision: 'Rejected',
                        notes,
                      }),
                    )
                  }
                >
                  Reject
                </Button>
              </div>

              {/*
                FRAUD IS NOT A HARSHER REJECTION, it is a different decision.
                Rejected is recoverable   the landlord fixes the listing and
                re-submits, which submit_verification explicitly allows. A
                photograph of a building that does not exist is not that, and
                filing it as Rejected leaves the person free to try again on
                Monday with a different address.

                So it sits apart from the two ordinary buttons, behind its own
                reason field, and it is the reason field that makes it
                deliberate rather than a mis-click beside Reject.
              */}
              <div className="border-coral/20 bg-coral/5 mt-2 flex flex-col gap-2 rounded-lg border p-3">
                <p className="text-content flex items-center gap-1.5 text-sm font-medium">
                  <ShieldAlert className="text-coral size-4" /> This listing is fraudulent
                </p>
                <p className="text-content-muted text-xs">
                  Permanent. The listing stays unverified and the account behind it is blocked
                  from submitting anything again. Use Reject for an ordinary problem.
                </p>
                <Textarea
                  value={fraudReason}
                  onChange={(e) => setFraudReason(e.target.value)}
                  rows={2}
                  placeholder="What makes this fraud? Shown on the blocked account."
                />
                <Button
                  variant="outline"
                  className="text-coral self-start"
                  disabled={pending || !fraudReason.trim()}
                  onClick={() => run(() => flagVisitFraud({ visitId: v.id, reason: fraudReason }))}
                >
                  Mark as fraud &amp; block the account
                </Button>
              </div>
            </section>
          )}

              {/*
                THE RECORD OF THE DECISION, not just the fact of one.
                It said "Decided." and a date. Who verified a hostel is the
                thing anybody asks about afterwards   an appeal, a complaint,
                a listing that turns out not to exist   and it was on the row
                the whole time in `decided_by`, never read.
              */}
              {settled && (
                <section className="border-line/10 bg-surface-deep flex flex-col gap-1.5 rounded-lg border p-3">
                  <p className="text-content-muted font-mono text-xs tracking-wide uppercase">
                    The decision
                  </p>
                  <p className="text-content flex flex-wrap items-center gap-2 text-sm">
                    <Badge className={STATUS_BADGE[v.status] ?? STATUS_BADGE['Not Visited']}>
                      {v.status}
                    </Badge>
                    {v.decidedByName ? (
                      <span>
                        by <span className="font-medium">{v.decidedByName}</span>
                      </span>
                    ) : (
                      <span className="text-content-muted">by a staff account</span>
                    )}
                    {v.decidedAt && (
                      <span className="text-content-muted text-xs">
                        {new Date(v.decidedAt).toLocaleString('en-NG')}
                      </span>
                    )}
                  </p>
                  {v.notes && <p className="text-content-muted text-sm">{v.notes}</p>}
                  <p className="text-content-muted text-xs">
                    {v.status === 'Fraud'
                      ? 'The account behind this listing is blocked from submitting again.'
                      : v.status === 'Rejected'
                        ? 'A rejected listing can be sent for another visit from the list below.'
                        : 'This listing is live to students.'}
                  </p>
                </section>
              )}
            </TabsContent>
          </Tabs>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/**
 * A hostel nobody has been sent to, and the act of sending somebody.
 *
 * THE ASSIGNMENT LIVES IN THE PANEL, not on the row.
 *   It used to be a select, a date field and a button squeezed onto a list row,
 *   which worked and told you nothing: you were choosing who to send to a
 *   building you could not see. The panel puts the listing   its address, its
 *   photos, its price   above the controls, so the decision is made looking at
 *   the thing it is about.
 *
 * TWO PATHS, DELIBERATELY
 *   `scheduleHostelVisit` is a service-role write and notifies nobody, which is
 *   fine for a placeholder date and NOT fine once a named person is going: the
 *   landlord has to be told who is coming to their gate, and only
 *   `assignVisit` does that.
 */
function UnvisitedItem({
  hostel: h,
  agents,
  pending,
  run,
  view,
}: {
  hostel: UnvisitedHostel;
  agents: AgentOption[];
  pending: boolean;
  run: (fn: () => Promise<unknown>) => void;
  view: 'grid' | 'list';
}) {
  const [picked, setPicked] = useState('');
  const [when, setWhen] = useState('');

  const thumb = h.hostel?.images?.[0];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className={
            view === 'grid'
              ? 'border-line/10 bg-panel hover:border-line/30 flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-colors'
              : 'hover:bg-surface-deep flex w-full items-center gap-3 px-4 py-3 text-left transition-colors'
          }
        >
          <div
            className={
              view === 'grid'
                ? 'bg-surface-deep relative aspect-video w-full overflow-hidden rounded-lg'
                : 'bg-surface-deep relative size-14 shrink-0 overflow-hidden rounded-lg'
            }
          >
            {thumb ? (
              <Image
                src={thumb}
                alt={h.name}
                fill
                sizes={view === 'grid' ? '(max-width: 640px) 100vw, 33vw' : '56px'}
                className="object-cover"
              />
            ) : (
              <span className="text-content-muted absolute inset-0 grid place-items-center text-xs">
                No photo
              </span>
            )}
            {view === 'grid' && (
              <Badge className="bg-ink/70 absolute top-2 right-2 text-white">Needs a visit</Badge>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-content truncate text-sm font-medium">{h.name}</p>
            <p className="text-content-muted flex items-center gap-1 text-xs">
              <MapPin className="size-3" />
              {h.area ?? 'No area'}
            </p>
          </div>

          {view === 'list' && (
            <Badge className="bg-ink/5 text-content-muted shrink-0">Needs a visit</Badge>
          )}
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader className="pr-8 pb-4">
          <SheetTitle>{h.name}</SheetTitle>
          <SheetDescription>
            Nobody has been sent here yet. Read what the landlord claims, then send an agent to go
            and check it.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-6">
          {h.hostel && <HostelFacts hostel={h.hostel} />}

          <section className="flex flex-col gap-2">
            <h3 className="text-content-muted font-mono text-xs tracking-wide uppercase">
              Send an agent
            </h3>
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className={FIELD}
              aria-label={`Agent for ${h.name}`}
            >
              <option value="">Nobody yet just put it on the calendar</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.open} open
                </option>
              ))}
            </select>
            <Input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              aria-label={`Visit time for ${h.name}`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={pending || !when}
                onClick={() =>
                  run(() =>
                    picked
                      ? assignVisit({
                          agentId: picked,
                          hostelId: h.id,
                          scheduledFor: new Date(when).toISOString(),
                        })
                      : scheduleHostelVisit({
                          hostelId: h.id,
                          ambassadorId: null,
                          scheduledFor: new Date(when).toISOString(),
                        }),
                  )
                }
              >
                {picked ? 'Assign & schedule' : 'Schedule'}
              </Button>
              {picked && (
                <span className="text-content-muted text-xs">
                  The landlord and the agent are both told.
                </span>
              )}
            </div>
            {agents.length === 0 && (
              <p className="text-content-muted text-xs">
                No agents available invite one from Agents.
              </p>
            )}
          </section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
