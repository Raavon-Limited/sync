/**
 * One agent's audit trail, in sentences.
 *
 * WHY IT IS NOT A TABLE OF `action` STRINGS
 *   private.audit_log stores machine keys - 'visit.submitted',
 *   'inspection.report_filed' - because a log that stores prose cannot be
 *   queried. Rendering those keys straight onto the screen just moves the
 *   translation problem to the person reading it, at the moment they are trying
 *   to work out whether somebody is doing their job. The mapping lives here, on
 *   the one screen that shows them.
 *
 * AN UNKNOWN ACTION IS SHOWN, NOT SWALLOWED
 *   A key with no entry in ACTIONS renders as itself. A new audited action
 *   appearing as raw text is a small ugliness; a new audited action silently
 *   missing from an oversight log is a hole in the oversight.
 *
 * WHO DID IT IS THE OTHER HALF
 *   `byAgent` separates what the agent did from what was done to them. Both
 *   belong in one timeline - an agent with nothing assigned and an agent
 *   ignoring their queue look identical otherwise - but they must not read as
 *   the same kind of event.
 */
'use client';

import { ArrowDownLeft, ArrowUpRight, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActivityRow {
  occurredAt: string;
  action: string;
  actorName: string | null;
  actorRole: string | null;
  /** True when the agent was the actor; false when they were the subject. */
  byAgent: boolean;
  entityType: string;
  /** Hostel or business name, resolved by the page. Null when unresolvable. */
  place: string | null;
  detail: Record<string, unknown>;
}

/**
 * Machine key -> what a person would say happened.
 *
 * Every key here is one a migration actually writes; there is no entry for an
 * event nothing emits. A label for an action that never happens is a promise
 * the log does not keep.
 */
const ACTIONS: Record<string, string> = {
  'agent.invite_accepted': 'Accepted their invite and became an agent',
  'visit.assigned': 'Was assigned a verification visit',
  'visit.unassigned': 'A visit was taken off them',
  'visit.reassigned': 'A visit was moved between agents',
  'visit.submitted': 'Submitted photos from a visit',
  'inspection.assigned': 'Was assigned a student inspection',
  'inspection.unassigned': 'An inspection was taken off them',
  'inspection.report_filed': 'Filed an inspection report',
};

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The bits of the payload worth putting on screen, as short chips.
 *
 * Deliberately a whitelist. The summary jsonb is built by the RPC and could
 * grow, and an oversight screen that renders whatever it is handed is one
 * migration away from printing something that should not be on it.
 */
function chips(row: ActivityRow): string[] {
  const out: string[] = [];
  const d = row.detail;
  if (d.photos != null) out.push(`${d.photos} photo${Number(d.photos) === 1 ? '' : 's'}`);
  if (d.video === 'true' || d.video === true) out.push('video');
  if (d.notes === 'true' || d.notes === true) out.push('with notes');
  if (d.resubmitted === 'true' || d.resubmitted === true) out.push('resubmission');
  if (d.refiled === 'true' || d.refiled === true) out.push('re-filed');
  if (typeof d.reason === 'string' && d.reason.trim()) out.push(d.reason);
  return out;
}

/**
 * "A visit was moved between agents" is true and useless: the one thing the
 * reader wants is which direction it went for the agent whose page this is.
 * Both ids are in the payload, so it can be said.
 */
function label(row: ActivityRow, agentId: string): string {
  if (row.action === 'visit.reassigned') {
    if (row.detail.moved_to === agentId) return 'A visit was moved onto them';
    if (row.detail.moved_from === agentId) return 'A visit was moved off them';
  }
  return ACTIONS[row.action] ?? row.action;
}

export function ActivityLog({
  rows,
  agentId,
  error,
}: {
  rows: ActivityRow[];
  agentId: string;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-content-muted flex items-center gap-2 text-[11px] tracking-wide uppercase">
        <ScrollText className="size-3.5" /> Activity log
      </span>

      {/* A failed read is said out loud. An empty list where the query errored
          reads as "this agent has done nothing", which is a different fact. */}
      {error ? (
        <p className="text-coral border-coral/20 bg-coral/5 rounded-xl border p-4 text-sm">
          The activity log could not be read: {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
          Nothing recorded yet. Assignments, submitted visits and filed reports appear here as
          they happen.
        </p>
      ) : (
        <ol className="border-line/10 divide-line/10 divide-y rounded-xl border">
          {rows.map((row, i) => {
            const tags = chips(row);
            return (
              <li key={`${row.occurredAt}-${i}`} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={cn(
                    'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full',
                    row.byAgent
                      ? 'bg-lime/15 text-accent-fg'
                      : 'bg-ink/5 text-content-muted',
                  )}
                  aria-hidden="true"
                >
                  {row.byAgent ? (
                    <ArrowUpRight className="size-3.5" />
                  ) : (
                    <ArrowDownLeft className="size-3.5" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-content text-sm">
                    {label(row, agentId)}
                    {row.place && <span className="text-content-muted"> · {row.place}</span>}
                  </p>
                  <p className="text-content-muted text-xs">
                    {when(row.occurredAt)}
                    {/* Only when somebody else did it   "by them" on every row
                        an agent performed is noise. */}
                    {!row.byAgent && row.actorName ? ` · by ${row.actorName}` : ''}
                    {!row.byAgent && !row.actorName && row.actorRole
                      ? ` · by ${row.actorRole}`
                      : ''}
                  </p>
                  {tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="border-line/10 bg-surface-deep text-content-muted rounded-md border px-1.5 py-0.5 text-[10px]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-content-muted text-xs">
        Newest first, up to 200 events. Written by the database, append-only. Nothing here can be
        edited after the fact, including by staff.
      </p>
    </div>
  );
}
