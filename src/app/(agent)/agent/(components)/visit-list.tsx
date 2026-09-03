/**
 * An agent's visits, and filing one.
 *
 * FILING IS NOTES AND A COUNT, NOT AN UPLOADER   YET
 *   Photographs are the substance of a visit and they belong in the private
 *   bucket the review screen already reads from. That upload path exists for
 *   verification documents and has not been pointed at visits, so this screen
 *   deliberately does NOT pretend: it submits notes and a video link, and says
 *   plainly that photos come next. A file picker that silently dropped what
 *   somebody photographed at a gate would be worse than no picker.
 *
 * NOTHING HERE DECIDES ANYTHING. Submitting moves a visit to Under Review and
 * that is the end of an agent's authority over it   the separation the whole
 * table exists for.
 */
'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import {
  Building2,
  CalendarClock,
  Home,
  ImagePlus,
  MapPin,
  Phone,
  Store,
  User,
  Wallet,
} from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/providers/session-provider';
import { uploadVendorImage, MAX_IMAGE_BYTES, ACCEPTED_IMAGE_TYPES } from '@/modules/vendor/queries';
import { formatKobo } from '@/lib/query/helpers';
import { fileInspectionReport, submitVisit } from '@/modules/agents/actions';

export interface AgentVisit {
  id: string;
  kind: 'hostel' | 'vendor';
  place: string;
  address: string;
  status: string;
  scheduledFor: string | null;
  brief: string | null;
  photoCount: number;
  meetName: string | null;
  meetPhone: string | null;
}

/**
 * A viewing a STUDENT paid for, which is not a verification visit.
 *
 * Different table, different question ("will this student rent it?" rather than
 * "is this listing real?"), different money   and the same agent, on the same
 * afternoon, which is why both are one list.
 */
export interface AgentInspection {
  id: string;
  hostelName: string;
  address: string;
  status: string;
  scheduledFor: string | null;
  studentName: string | null;
  studentPhone: string | null;
  /** The agent's, in full: Sync takes no commission on an inspection. */
  feeKobo: number;
  reportFiledAt: string | null;
  rescheduleCount: number;
}

const STATUS_STYLE: Record<string, string> = {
  'Not Visited': 'bg-ink/5 text-content-muted',
  'Visit Scheduled': 'bg-amber-500/10 text-amber-600',
  'Under Review': 'bg-blue-500/10 text-blue-600',
  Verified: 'bg-emerald-500/10 text-emerald-600',
  Rejected: 'bg-rose-500/10 text-rose-600',
  // Inspection statuses share the map: they are shown in the same list.
  pending_payment: 'bg-ink/5 text-content-muted',
  scheduled: 'bg-amber-500/10 text-amber-600',
  completed: 'bg-emerald-500/10 text-emerald-600',
  cancelled: 'bg-ink/5 text-content-muted',
  student_no_show: 'bg-rose-500/10 text-rose-600',
  agent_no_show: 'bg-rose-500/10 text-rose-600',
};

/** What a status reads as to the agent, where the raw value is not a sentence. */
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

/**
 * ONE LIST, TWO KINDS OF ERRAND.
 *
 * A verification visit and a paid inspection are different rows answering
 * different questions, but they are the same agent walking to the same street
 * on the same afternoon. Splitting them into tabs would make "where am I going
 * next" a question the screen asks back, so they merge and sort by when.
 */
export function VisitList({
  visits,
  inspections = [],
}: {
  visits: AgentVisit[];
  inspections?: AgentInspection[];
}) {
  const items = [
    ...visits.map((v) => ({
      key: `visit:${v.id}`,
      when: v.scheduledFor,
      done: VISIT_DONE.has(v.status),
      node: <VisitCard visit={v} />,
    })),
    ...inspections.map((i) => ({
      key: `inspection:${i.id}`,
      when: i.scheduledFor,
      done: INSPECTION_DONE.has(i.status),
      node: <InspectionCard inspection={i} />,
    })),
  ].sort((a, b) => {
    // Finished things sink rather than disappear   "did that one land?" is the
    // second question an agent has.
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.when ?? '9999').localeCompare(b.when ?? '9999');
  });

  if (items.length === 0) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
        Nothing assigned yet. When somebody sends you out, it appears here and your phone gets a
        notification.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.key}>{item.node}</div>
      ))}
    </div>
  );
}

/**
 * A paid viewing.
 *
 * THE FEE AND THE CLOCK ARE THE HEADLINE, DELIBERATELY
 *   An inspection hold sits in escrow with `release_after` NULL   nothing can
 *   pay the agent until they file. So this card does not say "submit"; it says
 *   what filing does to their own money, because that is the honest reason to
 *   do it before they get home.
 */
function InspectionCard({ inspection: i }: { inspection: AgentInspection }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, startSubmit] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const filed = Boolean(i.reportFiledAt);
  const done = INSPECTION_DONE.has(i.status);
  // Only a paid, scheduled visit can be filed on   the RPC says the same and
  // would refuse, but a button that cannot work should not be offered.
  const fileable = i.status === 'scheduled' && !filed;

  function file() {
    setNote(null);
    startSubmit(async () => {
      const res = await fileInspectionReport({ inspectionId: i.id, notes });
      setNote(
        res.ok
          ? { ok: true, text: 'Filed. Your fee releases in 24 hours unless the student objects.' }
          : { ok: false, text: res.error },
      );
      if (res.ok) setOpen(false);
    });
  }

  return (
    <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start gap-3">
        <Home className="text-content-muted mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-content font-medium">{i.hostelName}</p>
          <p className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {i.address}
            </span>
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              {i.scheduledFor
                ? new Date(i.scheduledFor).toLocaleString('en-NG', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : 'No time set'}
            </span>
            <span className="text-lime-deep flex items-center gap-1">
              <Wallet className="size-3.5" />
              {formatKobo(i.feeKobo)} yours in full
            </span>
          </p>
        </div>
        <Badge className={STATUS_STYLE[i.status] ?? STATUS_STYLE['pending_payment']}>
          {INSPECTION_LABEL[i.status] ?? i.status}
        </Badge>
      </div>

      <p className="border-line/15 bg-surface-deep text-content rounded-lg border px-3 py-2 text-sm">
        Showing a student around. They are deciding whether to rent it answer what they ask, and
        file what you saw.
      </p>

      {i.studentName && (
        <p className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="flex items-center gap-1">
            <User className="size-3.5" />
            Meeting {i.studentName}
          </span>
          {i.studentPhone && (
            <a href={`tel:${i.studentPhone}`} className="text-lime-deep flex items-center gap-1">
              <Phone className="size-3.5" />
              {i.studentPhone}
            </a>
          )}
          {/* They have moved it once already, so the next miss forfeits their
              fee. Worth the agent knowing before they wait an hour at a gate. */}
          {i.rescheduleCount > 0 && <span>Moved {i.rescheduleCount} time(s)</span>}
        </p>
      )}

      {i.status === 'pending_payment' && (
        <p className="text-content-muted text-xs">
          Not paid for yet, so it is not confirmed. Nothing to do until it is.
        </p>
      )}

      {fileable && !open && (
        <div>
          <Button variant="outline" onClick={() => setOpen(true)}>
            File your report
          </Button>
        </div>
      )}

      {filed && !done && (
        <p className="text-content-muted text-xs">
          Filed {new Date(i.reportFiledAt as string).toLocaleDateString('en-NG')}. Your fee of{' '}
          {formatKobo(i.feeKobo)} releases 24 hours after filing, or sooner if the student confirms.
        </p>
      )}

      {i.status === 'completed' && (
        <p className="text-xs text-emerald-600">
          Settled {formatKobo(i.feeKobo)} went to your wallet.
        </p>
      )}

      {open && (
        <div className="flex flex-col gap-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What you showed them, and how it went. Anything the listing got wrong?"
            className="border-line/15 bg-surface-deep text-content placeholder:text-content-muted/60 rounded-lg border px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy} onClick={file}>
              {busy ? 'Filing…' : 'File report'}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <span className="text-content-muted text-xs">
              This starts the 24-hour clock on your fee. Filing again later does not delay it.
            </span>
          </div>
        </div>
      )}

      {note && (
        <p className={cn('text-xs', note.ok ? 'text-emerald-600' : 'text-coral')}>{note.text}</p>
      )}
    </div>
  );
}

function VisitCard({ visit }: { visit: AgentVisit }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [video, setVideo] = useState('');
  const [busy, startSubmit] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const { userId } = useSession();

  const decided = visit.status === 'Verified' || visit.status === 'Rejected';
  const filed = visit.status === 'Under Review';

  /**
   * THE PHOTOGRAPH IS THE EVIDENCE, so this is not optional chrome.
   *
   * `submit_verification_visit` raises "Add at least one photo before
   * submitting" and has since it was written   and this screen had no way to
   * attach one, so no visit could ever reach Under Review and nothing could
   * legitimately be verified. Its own copy admitted as much.
   */
  async function addPhotos(files: FileList | File[]) {
    const chosen = Array.from(files);
    if (!chosen.length) return;
    if (!userId) {
      setNote({ ok: false, text: 'Sign in again before adding photos.' });
      return;
    }

    const accepted = chosen.filter(
      (f) => ACCEPTED_IMAGE_TYPES.includes(f.type) && f.size <= MAX_IMAGE_BYTES,
    );
    if (accepted.length !== chosen.length) {
      setNote({ ok: false, text: 'Photos must be JPEG, PNG, WebP or AVIF, under 5MB each.' });
    }
    if (!accepted.length) return;

    const db = createClient();
    setUploading((n) => n + accepted.length);
    for (const f of accepted) {
      try {
        const url = await uploadVendorImage(db, { userId, file: f, folder: 'visits' });
        setPhotos((current) => [...current, url]);
      } catch (e) {
        setNote({ ok: false, text: e instanceof Error ? e.message : 'That photo did not upload.' });
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
  }

  function file() {
    setNote(null);
    startSubmit(async () => {
      const res = await submitVisit({
        visitId: visit.id,
        notes,
        videoUrl: video,
        photos,
      });
      setNote(
        res.ok
          ? { ok: true, text: 'Filed. A reviewer takes it from here.' }
          : { ok: false, text: res.error },
      );
      if (res.ok) setOpen(false);
    });
  }

  const Icon = visit.kind === 'hostel' ? Building2 : Store;

  return (
    <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start gap-3">
        <Icon className="text-content-muted mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-content font-medium">{visit.place}</p>
          <p className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {visit.address}
            </span>
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              {visit.scheduledFor
                ? new Date(visit.scheduledFor).toLocaleString('en-NG', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : 'Arrange a time with them'}
            </span>
          </p>
        </div>
        <Badge className={STATUS_STYLE[visit.status] ?? STATUS_STYLE['Not Visited']}>
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

      {visit.meetName && (
        <p className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="flex items-center gap-1">
            <User className="size-3.5" />
            Meeting {visit.meetName}
          </span>
          {visit.meetPhone && (
            <a href={`tel:${visit.meetPhone}`} className="text-lime-deep flex items-center gap-1">
              <Phone className="size-3.5" />
              {visit.meetPhone}
            </a>
          )}
        </p>
      )}

      {!decided && !filed && !open && (
        <div>
          <Button variant="outline" onClick={() => setOpen(true)}>
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
          . A reviewer decides from here.
        </p>
      )}

      {open && (
        <div className="flex flex-col gap-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What you saw. Does it match the listing? Anything that does not?"
            className="border-line/15 bg-surface-deep text-content placeholder:text-content-muted/60 rounded-lg border px-3 py-2 text-sm"
          />
          <Input
            value={video}
            onChange={(e) => setVideo(e.target.value)}
            placeholder="Link to a walkthrough video (optional)"
          />

          <label className="border-line/15 hover:bg-surface-deep flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm">
            <ImagePlus className="size-4" />
            {photos.length
              ? `${photos.length} photo${photos.length === 1 ? '' : 's'} attached`
              : 'Add a photo of what you found'}
            <input
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void addPhotos(e.target.files);
                e.target.value = '';
              }}
            />
          </label>

          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((src, i) => (
                <div
                  key={src}
                  className="border-line/10 relative size-16 overflow-hidden rounded-lg border"
                >
                  <Image
                    src={src}
                    alt={`Evidence ${i + 1}`}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy || uploading > 0 || photos.length === 0} onClick={file}>
              {busy ? 'Filing…' : uploading > 0 ? 'Uploading…' : 'Submit for review'}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {/* Stated here rather than discovered on submit: the database
                refuses a visit with no photograph on it. */}
            {photos.length === 0 && (
              <span className="text-content-muted text-xs">
                At least one photo is required it is the evidence a reviewer decides on.
              </span>
            )}
          </div>
        </div>
      )}

      {note && (
        <p className={cn('text-xs', note.ok ? 'text-emerald-600' : 'text-coral')}>{note.text}</p>
      )}
    </div>
  );
}
