/**
 * Hostel verification visits.
 *
 * THE PREVIOUS SCREEN WAS ABOUT A DIFFERENT THING
 *   It modelled vendor store inspections — statuses Scheduled / In Progress /
 *   Completed / Failed, an "inspector", a vendor category. The table this route
 *   is named after is `hostel_verification_visits`: an ambassador visits a
 *   HOSTEL, uploads photos, and staff decide whether it is real. Vendor store
 *   inspection has no table at all, so that screen could never have been wired.
 *
 * EVIDENCE IS THE POINT
 *   A decision is only as good as what it is based on, so the photos, video and
 *   the ambassador's notes are shown inline rather than behind a modal. If a
 *   visit has no evidence, that is stated — approving an empty visit should
 *   feel like what it is.
 */
'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Loader2, MapPin, Calendar, Video, StickyNote, AlertTriangle } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { decideHostelVisit, scheduleHostelVisit } from '@/modules/admin/actions';

export interface AdminVisit {
  id: string;
  hostelId: string;
  hostelName: string;
  hostelArea: string | null;
  hostelVerified: boolean;
  ambassadorName: string | null;
  status: string;
  scheduledFor: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  photos: string[];
  videoUrl: string | null;
  notes: string | null;
}

export interface UnvisitedHostel {
  id: string;
  name: string;
  area: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  'Not Visited': 'bg-ink/5 text-content-muted',
  'Visit Scheduled': 'bg-blue-500/10 text-blue-600',
  'Under Review': 'bg-amber-500/10 text-amber-600',
  Verified: 'bg-emerald-500/10 text-emerald-600',
  Rejected: 'bg-rose-500/10 text-rose-600',
};

const FILTERS = ['all', 'Visit Scheduled', 'Under Review', 'Verified', 'Rejected'];

export function VisitsQueue({
  visits,
  unvisited,
}: {
  visits: AdminVisit[];
  unvisited: UnvisitedHostel[];
}) {
  const [filter, setFilter] = useState('all');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState<Record<string, string>>({});

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
      </div>

      {error && (
        <p className="text-coral border-coral/30 bg-coral/5 rounded-lg border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {visible.length === 0 && (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          No visits here.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {visible.map((v) => {
          const settled = v.status === 'Verified' || v.status === 'Rejected';
          const hasEvidence = v.photos.length > 0 || !!v.videoUrl || !!v.notes;
          return (
            <div key={v.id} className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-content flex items-center gap-2 font-medium">
                    {v.hostelName}
                    <Badge className={STATUS_BADGE[v.status] ?? STATUS_BADGE['Not Visited']}>
                      {v.status}
                    </Badge>
                    {v.hostelVerified && (
                      <Badge className="bg-emerald-500/10 text-emerald-600">listing verified</Badge>
                    )}
                  </p>
                  <p className="text-content-muted flex flex-wrap items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" />
                      {v.hostelArea ?? 'No area'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {v.scheduledFor
                        ? new Date(v.scheduledFor).toLocaleString('en-NG')
                        : 'Not scheduled'}
                    </span>
                    <span>Ambassador: {v.ambassadorName ?? 'unassigned'}</span>
                  </p>
                </div>
              </div>

              {/* Evidence, inline. A decision is only as good as what it sees. */}
              {hasEvidence ? (
                <div className="flex flex-col gap-2">
                  {v.photos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {v.photos.map((src, i) => (
                        <div
                          key={`${v.id}-${i}`}
                          className="border-line/10 relative size-24 overflow-hidden rounded-lg border"
                        >
                          <Image src={src} alt={`Visit photo ${i + 1}`} fill sizes="96px" className="object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                  {v.videoUrl && (
                    <a
                      href={v.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lime-deep flex items-center gap-1 text-sm underline underline-offset-2"
                    >
                      <Video className="size-4" /> Watch the walkthrough
                    </a>
                  )}
                  {v.notes && (
                    <p className="text-content-muted flex items-start gap-1 text-sm">
                      <StickyNote className="mt-0.5 size-3.5 shrink-0" />
                      {v.notes}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-content-muted flex items-center gap-1 text-xs">
                  <AlertTriangle className="size-3" />
                  No photos, video or notes submitted yet.
                </p>
              )}

              {!settled && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={notes[v.id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [v.id]: e.target.value }))}
                    placeholder="Decision note (optional)"
                    className="max-w-xs"
                  />
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        decideHostelVisit({
                          visitId: v.id,
                          hostelId: v.hostelId,
                          decision: 'Verified',
                          notes: notes[v.id],
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
                          notes: notes[v.id],
                        }),
                      )
                    }
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hostels nobody has been sent to yet — the queue behind the queue. */}
      {unvisited.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-content-muted font-mono text-sm tracking-wide">
            AWAITING A VISIT · {unvisited.length}
          </h2>
          <div className="border-line/10 divide-line/5 divide-y rounded-xl border">
            {unvisited.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-content text-sm">{h.name}</p>
                  <p className="text-content-muted text-xs">{h.area ?? 'No area'}</p>
                </div>
                <Input
                  type="datetime-local"
                  value={schedule[h.id] ?? ''}
                  onChange={(e) => setSchedule((s) => ({ ...s, [h.id]: e.target.value }))}
                  className="max-w-52"
                />
                <Button
                  variant="outline"
                  disabled={pending || !schedule[h.id]}
                  onClick={() =>
                    run(() =>
                      scheduleHostelVisit({
                        hostelId: h.id,
                        // Assigning a specific ambassador needs a roster the
                        // schema does not have yet; scheduling is what unblocks
                        // the queue today.
                        ambassadorId: null,
                        scheduledFor: new Date(schedule[h.id]).toISOString(),
                      }),
                    )
                  }
                >
                  Schedule
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
