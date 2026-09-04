/**
 * The two things an agent does on a paid viewing: say where to meet, and say
 * what happened.
 *
 * WHY THIS IS NOT THE VERIFICATION-VISIT FORM
 *   A verification visit is the agent going ALONE to check a listing is real,
 *   so photographs are the only thing that can tell a reviewer what was there.
 *   A student inspection is the agent and the student walking through the house
 *   TOGETHER. The student is the witness and confirms it themselves, so asking
 *   the agent to photograph a room the student just stood in is friction with
 *   nothing on the other side of it.
 *
 *   An earlier pass got this wrong and put the full evidence uploader on both.
 *   `evidence-fields` is now verification-visits-only; this collects an outcome.
 *   See 20260909210000.
 */
'use client';

import { useState, useTransition } from 'react';
import { Navigation } from 'lucide-react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { fileInspectionReport, setInspectionMeetingPoint } from '@/modules/agents/actions';

/**
 * Where the agent will meet the student.
 *
 * THE AGENT DECIDES, not the student and not the platform. They know the area,
 * which gate is actually usable, and whether the place is findable by somebody
 * who has never been. Blank means at the property   the common case, and
 * therefore the one that needs no typing.
 *
 * Editable after the fact on purpose: plans change, and a student who has
 * already set off needs to hear that more than they needed the first message.
 * The RPC re-notifies on every save.
 */
export function MeetingPoint({
  inspectionId,
  current,
}: {
  inspectionId: string;
  current: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? '');
  const [busy, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startSave(async () => {
      const res = await setInspectionMeetingPoint({ inspectionId, meetingPoint: value });
      if (res.ok) setEditing(false);
      else setError(res.error);
    });
  }

  if (!editing) {
    return (
      <div className="border-line/15 bg-surface-deep flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
        <Navigation className="text-content-muted size-3.5 shrink-0" />
        <span className="text-content min-w-0 flex-1">
          {current ? `Meeting at ${current}` : 'Meeting at the property'}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-lime-deep shrink-0 text-xs underline underline-offset-2"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="border-line/15 bg-surface-deep flex flex-col gap-2 rounded-lg border p-3">
      <label htmlFor={`meet-${inspectionId}`} className="text-content text-sm font-medium">
        Where will you meet them?
      </label>
      <input
        id={`meet-${inspectionId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="KWASU gate, by the bank — or leave blank for the property"
        className="border-line/15 bg-panel text-content placeholder:text-content-muted/60 rounded-lg border px-3 py-2 text-sm"
      />
      <p className="text-content-muted text-xs">
        They get a notification with this, straight away.
      </p>
      {error && <p className="text-coral text-xs">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1 sm:flex-none" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Tell them'}
        </Button>
        <Button
          variant="outline"
          className="flex-1 sm:flex-none"
          disabled={busy}
          onClick={() => {
            setValue(current ?? '');
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Filing an inspection: what happened, not what it looked like.
 *
 * A NO-SHOW IS NOT A WAY TO GET PAID. Reporting one does not start the 24-hour
 * clock   the RPC only sets `release_after` on 'viewed'. It notifies staff, who
 * settle it against the student's free-reschedule allowance first.
 */
export function ReportSheet({
  open,
  onOpenChange,
  hostelName,
  studentName,
  inspectionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostelName: string;
  studentName: string | null;
  inspectionId: string;
}) {
  const [outcome, setOutcome] = useState<'viewed' | 'student_no_show'>('viewed');
  const [notes, setNotes] = useState('');
  const [busy, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startSubmit(async () => {
      const res = await fileInspectionReport({ inspectionId, notes, outcome });
      if (res.ok) {
        onOpenChange(false);
        setNotes('');
      } else {
        setError(res.error);
      }
    });
  }

  const who = studentName ?? 'the student';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Full screen on a phone, a panel from `sm` up   SheetContent's own
          side variant already does exactly that. */}
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-line/10 shrink-0 border-b p-4">
          <SheetTitle>File your report</SheetTitle>
          <SheetDescription>{hostelName}</SheetDescription>
        </SheetHeader>

        {/* The only scrolling region, so the actions stay reachable with a
            thumb however long the notes get. */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-content mb-2 text-sm font-medium">How did it go?</legend>
              <OutcomeChoice
                selected={outcome === 'viewed'}
                onSelect={() => setOutcome('viewed')}
                title="We viewed it together"
                detail={`You and ${who} walked through the place.`}
              />
              <OutcomeChoice
                selected={outcome === 'student_no_show'}
                onSelect={() => setOutcome('student_no_show')}
                title={`${who} did not turn up`}
                detail="Staff decide this one. It does not release your fee on its own."
              />
            </fieldset>

            <div className="flex flex-col gap-2">
              <label htmlFor={`notes-${inspectionId}`} className="text-content text-sm font-medium">
                Notes {outcome === 'student_no_show' && <span className="text-coral">*</span>}
              </label>
              <textarea
                id={`notes-${inspectionId}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder={
                  outcome === 'viewed'
                    ? 'How did the viewing go? What did they ask about?'
                    : 'How long did you wait, and did you reach them?'
                }
                className="border-line/15 bg-surface-deep text-content placeholder:text-content-muted/60 rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <p className="text-content-muted text-xs">
              {outcome === 'viewed'
                ? 'Filing releases your fee in 24 hours, or immediately if the student confirms first.'
                : 'Staff check this against the student’s free reschedule before anything is forfeited.'}
            </p>
          </div>
        </div>

        <div className="border-line/10 bg-panel shrink-0 border-t p-4">
          {error && <p className="text-coral mb-2 text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              // A no-show accusation with no explanation is not something staff
              // can act on, so it is the one case where notes are required.
              disabled={busy || (outcome === 'student_no_show' && !notes.trim())}
              onClick={submit}
            >
              {busy ? 'Filing…' : 'File report'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OutcomeChoice({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
        selected
          ? 'border-lime-deep/40 bg-lime/5 ring-lime-deep/20 ring-2'
          : 'border-line/15 hover:border-line/25',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
          selected ? 'border-lime-deep' : 'border-line/30',
        )}
      >
        {selected && <span className="bg-lime-deep size-2 rounded-full" />}
      </span>
      <span className="min-w-0">
        <span className="text-content block text-sm font-medium">{title}</span>
        <span className="text-content-muted block text-xs">{detail}</span>
      </span>
    </button>
  );
}
