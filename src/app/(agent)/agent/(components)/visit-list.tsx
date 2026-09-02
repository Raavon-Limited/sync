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
import { Building2, CalendarClock, MapPin, Phone, Store, User } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { submitVisit } from '@/modules/agents/actions';

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

const STATUS_STYLE: Record<string, string> = {
  'Not Visited': 'bg-ink/5 text-content-muted',
  'Visit Scheduled': 'bg-amber-500/10 text-amber-600',
  'Under Review': 'bg-blue-500/10 text-blue-600',
  Verified: 'bg-emerald-500/10 text-emerald-600',
  Rejected: 'bg-rose-500/10 text-rose-600',
};

export function VisitList({ visits }: { visits: AgentVisit[] }) {
  if (visits.length === 0) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
        Nothing assigned yet. When somebody sends you out, it appears here and your phone gets a
        notification.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visits.map((v) => (
        <VisitCard key={v.id} visit={v} />
      ))}
    </div>
  );
}

function VisitCard({ visit }: { visit: AgentVisit }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [video, setVideo] = useState('');
  const [busy, startSubmit] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const decided = visit.status === 'Verified' || visit.status === 'Rejected';
  const filed = visit.status === 'Under Review';

  function file() {
    setNote(null);
    startSubmit(async () => {
      const res = await submitVisit({ visitId: visit.id, notes, videoUrl: video });
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
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy} onClick={file}>
              {busy ? 'Filing…' : 'Submit for review'}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {/* Said here rather than discovered on submit: the database refuses
                a visit with no photograph on it. */}
            <span className="text-content-muted text-xs">
              Photo upload is not wired up yet until it is, a visit with no photo will be refused.
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
