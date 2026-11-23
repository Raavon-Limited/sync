/**
 * Dispute queue   read the case, then decide where the money goes.
 *
 * ALIGNED TO THE SCHEMA, NOT THE MOCK
 *   The previous UI had statuses (Open / In Progress / Escalated / Resolved), a
 *   priority field, and categories like "Missing Items". The table has five
 *   different statuses, six different categories, and no priority at all   so
 *   filters and badges described states that could never occur.
 *
 * RESOLVING IS A MONEY DECISION
 *   Every resolution except no_action empties an escrow hold. The amounts are
 *   shown before the button, and a partial refund cannot be submitted without
 *   an amount   a "partial refund" of nothing is a full release wearing the
 *   wrong label.
 */
'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Loader2, MessageSquare } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { resolveDispute } from '@/modules/admin/actions';

export interface AdminDisputeMessage {
  id: string;
  body: string;
  isInternal: boolean;
  authorName: string | null;
  createdAt: string;
}

export interface AdminDispute {
  id: string;
  code: string;
  category: string;
  status: string;
  summary: string;
  raisedByName: string | null;
  againstName: string | null;
  orderId: string | null;
  resolution: string | null;
  refundKobo: number | null;
  createdAt: string;
  /** null when nothing is held   resolution then cannot move money. */
  holdKobo: number | null;
  holdStatus: string | null;
  messages: AdminDisputeMessage[];
}

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-amber-500/10 text-amber-600',
  investigating: 'bg-blue-500/10 text-blue-600',
  awaiting_response: 'bg-violet-500/10 text-violet-600',
  resolved: 'bg-lime/15 text-accent-fg',
  rejected: 'bg-ink/5 text-content-muted',
};

const STATUSES = ['all', 'open', 'investigating', 'awaiting_response', 'resolved', 'rejected'];

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;

export function DisputesQueue({ disputes }: { disputes: AdminDispute[] }) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [refunds, setRefunds] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = disputes.filter((d) => filter === 'all' || d.status === filter);

  function decide(d: AdminDispute, resolution: string) {
    setError(null);
    const raw = refunds[d.id];
    const refundKobo =
      resolution === 'refund_partial' ? Math.round(Number(raw) * 100) : undefined;

    if (resolution === 'refund_partial' && (!refundKobo || refundKobo <= 0)) {
      setError('Enter the amount to refund.');
      return;
    }
    startTransition(async () => {
      try {
        await resolveDispute({
          disputeId: d.id,
          resolution,
          refundKobo,
          notes: notes[d.id]?.trim() || undefined,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not resolve');
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === s
                ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
                : 'border-line/10 text-content-muted hover:text-content'
            }`}
          >
            {s.replace('_', ' ')}
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
          No disputes here.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {visible.map((d) => {
          const settled = d.status === 'resolved' || d.status === 'rejected';
          const expanded = open === d.id;
          return (
            <div key={d.id} className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : d.id)}
                className="flex flex-wrap items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <p className="text-content flex items-center gap-2 font-medium">
                    {d.code}
                    <Badge className={STATUS_BADGE[d.status] ?? STATUS_BADGE.rejected}>
                      {d.status.replace('_', ' ')}
                    </Badge>
                    <Badge className="bg-ink/5 text-content-muted">
                      {d.category.replace('_', ' ')}
                    </Badge>
                  </p>
                  <p className="text-content-muted mt-1 line-clamp-2 max-w-2xl text-sm">
                    {d.summary}
                  </p>
                  <p className="text-content-muted mt-1 text-xs">
                    {d.raisedByName ?? 'Someone'} against {d.againstName ?? 'someone'} ·{' '}
                    {new Date(d.createdAt).toLocaleDateString('en-NG')} · {d.messages.length}{' '}
                    message{d.messages.length === 1 ? '' : 's'}
                  </p>
                </div>

                <div className="text-right">
                  {d.holdKobo != null ? (
                    <>
                      <p className="text-content font-semibold">{naira(d.holdKobo)}</p>
                      <p className="text-content-muted text-xs">in escrow · {d.holdStatus}</p>
                    </>
                  ) : (
                    <p className="text-content-muted flex items-center gap-1 text-xs">
                      <AlertTriangle className="size-3" /> No escrow hold
                    </p>
                  )}
                  {settled && d.resolution && (
                    <p className="text-content-muted mt-1 text-xs">
                      {d.resolution.replace('_', ' ')}
                      {d.refundKobo ? ` · ${naira(d.refundKobo)} refunded` : ''}
                    </p>
                  )}
                </div>
              </button>

              {expanded && (
                <>
                  {d.messages.length > 0 && (
                    <div className="border-line/10 divide-line/5 divide-y rounded-lg border">
                      {d.messages.map((m) => (
                        <div key={m.id} className="px-3 py-2">
                          <p className="text-content-muted flex items-center gap-1 text-xs">
                            <MessageSquare className="size-3" />
                            {m.authorName ?? 'Unknown'}
                            {/* Internal notes are staff-only; the parties never
                                see them, so they are marked here. */}
                            {m.isInternal && (
                              <Badge className="bg-ink/5 text-content-muted">internal</Badge>
                            )}
                            <span>· {new Date(m.createdAt).toLocaleString('en-NG')}</span>
                          </p>
                          <p className="text-content text-sm">{m.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {!settled && (
                    <div className="flex flex-col gap-2">
                      <Input
                        value={notes[d.id] ?? ''}
                        onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                        placeholder="Internal note (optional)"
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          disabled={pending || d.holdKobo == null}
                          onClick={() => decide(d, 'refund_full')}
                        >
                          Refund in full
                        </Button>

                        <Input
                          value={refunds[d.id] ?? ''}
                          onChange={(e) => setRefunds((r) => ({ ...r, [d.id]: e.target.value }))}
                          placeholder="₦ amount"
                          className="max-w-32"
                          inputMode="decimal"
                        />
                        <Button
                          variant="outline"
                          disabled={pending || d.holdKobo == null}
                          onClick={() => decide(d, 'refund_partial')}
                        >
                          Refund part
                        </Button>

                        <Button
                          variant="outline"
                          disabled={pending || d.holdKobo == null}
                          onClick={() => decide(d, 'release_vendor')}
                        >
                          Release to vendor
                        </Button>

                        {/* Always available: a dispute with nothing held is
                            still a dispute that needs closing. */}
                        <Button
                          variant="outline"
                          disabled={pending}
                          onClick={() => decide(d, 'no_action')}
                        >
                          No action
                        </Button>
                      </div>

                      {d.holdKobo == null && (
                        <p className="text-content-muted text-xs">
                          Nothing is held for this dispute, so only &ldquo;no action&rdquo; is
                          available.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
