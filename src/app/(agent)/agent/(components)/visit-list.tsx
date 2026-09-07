/**
 * An agent's work, and filing it.
 *
 * TWO LISTS, NOT ONE
 *   This used to merge verification visits and paid inspections into a single
 *   time-sorted column, arguing that an agent's afternoon does not distinguish
 *   them. It does distinguish them: a verification visit is somewhere you are
 *   already expected, and a viewing is work you chose to take off a board. They
 *   now live on `/agent/visits` and `/agent/requests` and this file exports one
 *   list for each.
 *
 * FILING IS A SHEET, NOT AN INLINE BLOCK
 *   The form was rendered inside the card, so opening it pushed every other job
 *   down the page and, on a phone, put the submit button somewhere below three
 *   other listings. It is now a side sheet - full screen on mobile, a panel
 *   from `sm` up, which is what SheetContent already does.
 *
 * NOTHING HERE DECIDES ANYTHING. Submitting moves a visit to Under Review and
 * that is the end of an agent's authority over it   the separation the whole
 * table exists for.
 */
'use client';

import { useState, useTransition } from 'react';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Hourglass,
  Home,
  MapPin,
  Phone,
  Store,
  User,
  Wallet,
} from 'lucide-react';
import {
  Badge,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatKobo } from '@/lib/query/helpers';
import { submitVisit, releaseInspection } from '@/modules/agents/actions';
import { EvidenceFields, EMPTY_EVIDENCE, type Evidence } from './evidence-fields';
import { MeetingPoint, ReportSheet } from './inspection-report';

export interface AgentVisit {
  id: string;
  kind: 'hostel' | 'vendor';
  place: string;
  address: string;
  status: string;
  scheduledFor: string | null;
  brief: string | null;
  photoCount: number;
  hasSelfie: boolean;
  meetName: string | null;
  meetPhone: string | null;
}

/**
 * A viewing a STUDENT paid for, which is not a verification visit.
 *
 * Different table, different question ("will this student rent it?" rather than
 * "is this listing real?"), and different money   the fee is the agent's in
 * full, because Sync takes no commission on an inspection.
 */
export interface AgentInspection {
  id: string;
  hostelName: string;
  address: string;
  status: string;
  scheduledFor: string | null;
  studentName: string | null;
  studentPhone: string | null;
  feeKobo: number;
  reportFiledAt: string | null;
  /** What the agent filed: they viewed it together, or the student never came. */
  outcome: 'viewed' | 'student_no_show' | null;
  /** Where the agent told the student to meet them. Null means at the property. */
  meetingPoint: string | null;
  /** The time this agent OFFERED. Not agreed until studentConfirmedAt is set. */
  proposedFor: string | null;
  /** The student accepted the offer. Until then nothing is arranged. */
  studentConfirmedAt: string | null;
  /** The student says it did not happen. The fee is held until staff settle it. */
  disputedAt: string | null;
  rescheduleCount: number;
}

const STATUS_STYLE: Record<string, string> = {
  'Not Visited': 'bg-ink/5 text-content-muted',
  'Visit Scheduled': 'bg-amber-500/10 text-amber-600',
  'Under Review': 'bg-blue-500/10 text-blue-600',
  Verified: 'bg-emerald-500/10 text-emerald-600',
  Rejected: 'bg-rose-500/10 text-rose-600',
  pending_payment: 'bg-ink/5 text-content-muted',
  scheduled: 'bg-amber-500/10 text-amber-600',
  completed: 'bg-emerald-500/10 text-emerald-600',
  cancelled: 'bg-ink/5 text-content-muted',
  student_no_show: 'bg-rose-500/10 text-rose-600',
  agent_no_show: 'bg-rose-500/10 text-rose-600',
};

const INSPECTION_LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  student_no_show: 'Student did not show',
  agent_no_show: 'Marked as missed',
};

const INSPECTION_DONE = new Set(['completed', 'cancelled', 'student_no_show', 'agent_no_show']);
const VISIT_DONE = new Set(['Verified', 'Rejected']);

function when(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  return new Date(iso).toLocaleString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Shared card chrome. `min-w-0` at every level is what stops a long address
 *  from pushing the status badge off a narrow screen. */
/**
 * The card, optionally the button.
 *
 * TAPPING THE CARD IS THE WHOLE INTERACTION, so the card takes the tap.
 * Filing used to be reachable only through the small "File what you found"
 * button, and an agent standing at a gate on a phone taps the big obvious
 * rectangle with the address on it. That did nothing, which reads as broken.
 *
 * `onOpen` is only passed when there is something to file, so a decided visit
 * stays inert rather than offering a press that goes nowhere.
 *
 * Not a <button>: this contains a phone link, and an anchor inside a button is
 * invalid HTML that browsers resolve by dropping one of them. role/tabIndex and
 * an explicit key handler give the same keyboard and screen-reader behaviour
 * while leaving the children clickable in their own right   see the
 * stopPropagation in MeetLine, which is what keeps "call them" from also
 * opening the filing sheet.
 */
function CardShell({ children, onOpen }: { children: React.ReactNode; onOpen?: () => void }) {
  return (
    <div
      className={cn(
        'border-line/10 bg-panel flex min-w-0 flex-col gap-3 rounded-xl border p-3 sm:p-4',
        onOpen &&
          'hover:border-line/25 focus-visible:ring-lime-deep/40 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2',
      )}
      {...(onOpen && {
        role: 'button',
        tabIndex: 0,
        onClick: onOpen,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        },
      })}
    >
      {children}
    </div>
  );
}

// ── Verification visits ─────────────────────────────────────────────────────

/**
 * ACTIVE AND COMPLETED ARE TABS, NOT ONE LIST WITH THE DEAD ONES AT THE BOTTOM.
 *
 * Sinking decided visits kept them findable, which was the point   but it also
 * means an agent with a season behind them scrolls past their whole history to
 * reach the one place they are going this afternoon. "Where am I going next"
 * and "did that one land?" are two questions, and only the first is urgent.
 *
 * A visit under review counts as ACTIVE: the agent has filed and a reviewer has
 * not decided, so it is still live work as far as they are concerned. Only
 * Verified and Rejected are finished.
 */
export function VisitList({ visits }: { visits: AgentVisit[] }) {
  const [tab, setTab] = useState<'active' | 'completed'>('active');

  const byWhen = (a: AgentVisit, b: AgentVisit) =>
    (a.scheduledFor ?? '9999').localeCompare(b.scheduledFor ?? '9999');

  const active = visits.filter((v) => !VISIT_DONE.has(v.status)).sort(byWhen);
  // Newest first: the last thing decided is the one being asked about.
  const completed = visits.filter((v) => VISIT_DONE.has(v.status)).sort((a, b) => byWhen(b, a));
  const items = tab === 'active' ? active : completed;

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'active' | 'completed')}>
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {items.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm sm:p-8">
          {tab === 'active'
            ? 'Nothing assigned yet. When somebody sends you out, it appears here and your phone gets a notification.'
            : 'Nothing decided yet. Visits a reviewer has accepted or rejected land here.'}
        </p>
      ) : (
        items.map((v) => <VisitCard key={v.id} visit={v} />)
      )}
    </div>
  );
}

function VisitCard({ visit }: { visit: AgentVisit }) {
  const [open, setOpen] = useState(false);
  const decided = VISIT_DONE.has(visit.status);
  const filed = visit.status === 'Under Review';
  const Icon = visit.kind === 'hostel' ? Building2 : Store;
  const canFile = !decided && !filed;

  return (
    <CardShell onOpen={canFile ? () => setOpen(true) : undefined}>
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="text-content-muted mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-content truncate font-medium">{visit.place}</p>
          <p className="text-content-muted mt-0.5 flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{visit.address}</span>
            </span>
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3.5 shrink-0" />
              {when(visit.scheduledFor, 'Arrange a time with them')}
            </span>
          </p>
        </div>
        <Badge className={cn('shrink-0', STATUS_STYLE[visit.status] ?? STATUS_STYLE['Not Visited'])}>
          {visit.status}
        </Badge>
      </div>

      {/* THE BRIEF, ABOVE EVERYTHING THE PLATFORM KNOWS. It is the half a
          listing cannot tell you: which gate, who to ask for, what to look at. */}
      {visit.brief && (
        <p className="border-line/15 bg-surface-deep text-content rounded-lg border px-3 py-2 text-sm">
          {visit.brief}
        </p>
      )}

      {visit.meetName && <MeetLine name={visit.meetName} phone={visit.meetPhone} />}

      {/* Kept even though the whole card now opens this: the card being
          pressable is discoverable only by trying it, and this is the label
          that says what pressing it does. */}
      {canFile && (
        <div>
          <Button variant="outline" className="w-full sm:w-auto">
            File what you found
          </Button>
        </div>
      )}

      {filed && (
        <p className="text-content-muted text-xs">
          Filed
          {visit.photoCount > 0
            ? ` with ${visit.photoCount} photo${visit.photoCount === 1 ? '' : 's'}`
            : ''}
          {visit.hasSelfie ? ' and a photo of you there' : ''}. A reviewer decides from here.
        </p>
      )}

      <FileSheet
        open={open}
        onOpenChange={setOpen}
        title={`File what you found`}
        description={visit.place}
        requirePhoto
        submitLabel="Submit for review"
        onSubmit={(evidence, notes) =>
          submitVisit({
            visitId: visit.id,
            notes,
            photos: evidence.photos,
            videoUrl: evidence.videoUrl ?? undefined,
            selfieUrl: evidence.selfieUrl ?? undefined,
          })
        }
        notesPlaceholder="What you saw. Does it match the listing? Anything that does not?"
      />
    </CardShell>
  );
}

// ── Paid student viewings ───────────────────────────────────────────────────

/**
 * One state of an agent's viewings. The TABS own the split now   see
 * requests-tabs   so this renders the slice it is handed.
 */
export function InspectionList({
  inspections,
  only,
}: {
  inspections: AgentInspection[];
  only: 'active' | 'completed';
}) {
  const byWhen = (a: AgentInspection, b: AgentInspection) =>
    (a.scheduledFor ?? '9999').localeCompare(b.scheduledFor ?? '9999');

  const items =
    only === 'active'
      ? inspections.filter((i) => !INSPECTION_DONE.has(i.status)).sort(byWhen)
      : inspections.filter((i) => INSPECTION_DONE.has(i.status)).sort((a, b) => byWhen(b, a));

  if (items.length === 0) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
        {only === 'active'
          ? 'Nothing on. Offer a time on a request and it appears here while the student decides.'
          : 'Nothing finished yet. Viewings settle here once they are filed and confirmed.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <InspectionCard key={i.id} inspection={i} />
      ))}
    </div>
  );
}

/**
 * A paid viewing this agent has taken.
 *
 * THE FEE AND THE CLOCK ARE THE HEADLINE, DELIBERATELY
 *   An inspection hold sits in escrow with `release_after` NULL   nothing can
 *   pay the agent until they file. So this card does not say "submit"; it says
 *   what filing does to their own money, because that is the honest reason to
 *   do it before they get home.
 */
function InspectionCard({ inspection: i }: { inspection: AgentInspection }) {
  const [open, setOpen] = useState(false);
  const [handingBack, startHandBack] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const filed = Boolean(i.reportFiledAt);
  const done = INSPECTION_DONE.has(i.status);
  // An unconfirmed offer has not happened yet, so there is nothing to file
  // on   and filing would start the payment clock on a viewing the student
  // never agreed to.
  const fileable = i.status === 'scheduled' && !filed && !!i.studentConfirmedAt;

  function handBack() {
    setNote(null);
    startHandBack(async () => {
      const res = await releaseInspection({ inspectionId: i.id });
      if (!res.ok) setNote({ ok: false, text: res.error });
    });
  }

  return (
    <CardShell onOpen={fileable ? () => setOpen(true) : undefined}>
      <div className="flex min-w-0 items-start gap-3">
        <Home className="text-content-muted mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-content truncate font-medium">{i.hostelName}</p>
          <p className="text-content-muted mt-0.5 flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{i.address}</span>
            </span>
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3.5 shrink-0" />
              {when(i.scheduledFor, 'No time set')}
            </span>
            <span className="text-lime-deep flex items-center gap-1">
              <Wallet className="size-3.5 shrink-0" />
              {formatKobo(i.feeKobo)} yours in full
            </span>
          </p>
        </div>
        <Badge
          className={cn('shrink-0', STATUS_STYLE[i.status] ?? STATUS_STYLE['pending_payment'])}
        >
          {INSPECTION_LABEL[i.status] ?? i.status}
        </Badge>
      </div>

      {i.studentName && (
        <MeetLine
          name={i.studentName}
          phone={i.studentPhone}
          extra={i.rescheduleCount > 0 ? `Moved ${i.rescheduleCount} time(s)` : null}
        />
      )}

      {/*
        AGREED, OR STILL AN OFFER. Everything else on this card reads the same
        either way, and the difference is the only thing that decides whether
        the agent should set off.
      */}
      {!done &&
        (i.studentConfirmedAt ? (
          <p className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-600">
            <CheckCircle2 className="size-4 shrink-0" />
            Confirmed by the student.
          </p>
        ) : (
          <p className="border-line/15 bg-surface-deep text-content-muted flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm">
            <Hourglass className="size-4 shrink-0" />
            Waiting on them to confirm
            {i.proposedFor
              ? ' ' + when(i.proposedFor, '')
              : ''}
            . Do not set off until they do.
          </p>
        ))}

      {/* WHERE THEY MEET. The agent owns this   they know the area and which
          gate is usable   and changing it re-notifies the student, who may
          already have set off. */}
      {/* Sealed off from the card's own click: this is an editor, and setting
          where to meet is not filing a report. */}
      {!done && (
        <div onClick={(e) => e.stopPropagation()}>
          <MeetingPoint inspectionId={i.id} current={i.meetingPoint} />
        </div>
      )}

      {i.disputedAt && (
        <p className="text-coral border-coral/20 bg-coral/5 rounded-lg border px-3 py-2 text-xs">
          The student says this viewing did not happen. Your fee is on hold until staff settle it.
        </p>
      )}

      {/* Also sealed: "I cannot make it" sits here, and a mis-tap that opened
          the report sheet instead would be the opposite of what was pressed. */}
      {fileable && (
        <div
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
            File your report
          </Button>
          {/* Handing back early is better for the student than a no-show, and
              costs the agent the same job either way   see releaseInspection. */}
          <Button
            variant="ghost"
            className="w-full sm:w-auto"
            disabled={handingBack}
            onClick={handBack}
          >
            {handingBack ? 'Releasing…' : 'I cannot make it'}
          </Button>
        </div>
      )}

      {filed && !done && (
        <p className="text-content-muted text-xs">
          {i.outcome === 'student_no_show'
            ? 'Filed as a no-show. Staff decide this one — reporting it does not release your fee.'
            : 'Filed. Your fee releases in 24 hours, or the moment the student confirms.'}
        </p>
      )}

      {note && (
        <p className={cn('text-xs', note.ok ? 'text-emerald-600' : 'text-coral')}>{note.text}</p>
      )}

      <ReportSheet
        open={open}
        onOpenChange={setOpen}
        hostelName={i.hostelName}
        studentName={i.studentName}
        inspectionId={i.id}
      />
    </CardShell>
  );
}

function MeetLine({
  name,
  phone,
  extra,
}: {
  name: string;
  phone: string | null;
  extra?: string | null;
}) {
  return (
    <p className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="flex items-center gap-1">
        <User className="size-3.5" />
        Meeting {name}
      </span>
      {/* The card around this opens the filing sheet on click. Calling
          somebody is not filing, so that tap stops at the anchor. */}
      {phone && (
        <a
          href={`tel:${phone}`}
          onClick={(e) => e.stopPropagation()}
          className="text-lime-deep flex items-center gap-1"
        >
          <Phone className="size-3.5" />
          {phone}
        </a>
      )}
      {extra && <span>{extra}</span>}
    </p>
  );
}

/**
 * The filing form.
 *
 * One component for both errands: they collect the same evidence and differ
 * only in wording and in whether a photo is mandatory (the database refuses a
 * verification visit with none; an inspection report it accepts).
 */
function FileSheet({
  open,
  onOpenChange,
  title,
  description,
  requirePhoto = false,
  submitLabel,
  notesPlaceholder,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  requirePhoto?: boolean;
  submitLabel: string;
  notesPlaceholder: string;
  onSubmit: (
    evidence: Evidence,
    notes: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [evidence, setEvidence] = useState<Evidence>(EMPTY_EVIDENCE);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, startSubmit] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  /*
   * A COMPLETE FILING IS A PHOTO, A VIDEO AND A PICTURE OF THE AGENT THERE.
   *
   * Photos and the walkthrough were the only evidence a reviewer had, and the
   * video and selfie were both optional   so most filings arrived with neither,
   * and "was this agent actually at this building" was unanswerable from the
   * review screen. All three are required now.
   *
   * The message NAMES what is missing rather than saying the filing is
   * incomplete. An agent standing outside in the sun should not have to scroll
   * the form to work out which slot is empty.
   */
  const missing: string[] = [];
  if (requirePhoto) {
    if (evidence.photos.length === 0) missing.push('a photo of the place');
    if (!evidence.videoUrl) missing.push('a walkthrough video');
    if (!evidence.selfieUrl) missing.push('a photo of you there');
  }
  const blocked = missing.length > 0;

  function submit() {
    setNote(null);
    startSubmit(async () => {
      const res = await onSubmit(evidence, notes);
      if (res.ok) {
        onOpenChange(false);
        setEvidence(EMPTY_EVIDENCE);
        setNotes('');
      } else {
        setNote({ ok: false, text: res.error });
      }
    });
  }

  return (
    <>

      <Sheet open={open} onOpenChange={onOpenChange}>
        {/* Full screen on a phone, a panel from `sm` up   SheetContent's own
            `side` variant already does exactly that. */}
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-line/10 shrink-0 border-b p-4">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>

          {/* The only scrolling region, so the actions below stay reachable
              with a thumb however many photos are attached. */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="agent-notes" className="text-content text-sm font-medium">
                  Notes
                </label>
                <textarea
                  id="agent-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder={notesPlaceholder}
                  className="border-line/15 bg-surface-deep text-content placeholder:text-content-muted/60 rounded-lg border px-3 py-2 text-sm"
                />
              </div>

              <EvidenceFields
                value={evidence}
                onChange={setEvidence}
                onBusyChange={setUploading}
              />
            </div>
          </div>

          <div className="border-line/10 bg-panel shrink-0 border-t p-4">
            {blocked && (
              <p className="text-content-muted mb-2 text-xs">
                Still needed: {missing.join(', ')}. This is everything a reviewer decides on.
              </p>
            )}
            {note && !note.ok && <p className="text-coral mb-2 text-xs">{note.text}</p>}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button className="flex-1" disabled={busy || uploading || blocked} onClick={submit}>
                {busy ? 'Filing…' : uploading ? 'Uploading…' : submitLabel}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
