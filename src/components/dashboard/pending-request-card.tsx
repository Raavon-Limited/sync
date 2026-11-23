'use client';

/**
 * PendingRequestList - the single "pending requests" list used by every
 * dashboard variant. One card design; the role decides what each row means:
 *   - vendor:   an order   (badge = order id, subtitle = items, amount = total)
 *   - landlord: a booking  (tags = location · room · time)
 *
 * Owns the list as client state, seeded from the server-fetched `items`
 * prop (same pattern as RevenueChartPanel's initialData) so Accept/Decline
 * can optimistically remove a row without a full page re-fetch.
 *
 * Accept: fires immediately, row shows a brief "Accepting…" state, then is
 * removed on success. On failure the row is restored with an inline error.
 * Decline: opens a reason popover anchored to that row's Decline button
 * (portaled to body   see DeclineReasonPopover) before the decline call
 * fires.
 *
 * THE DEFAULTS ARE A DEMO AND THEY LOOK EXACTLY LIKE THE REAL THING.
 * `acceptOrderMock` waits half a second, fails 8% of the time at random, and
 * touches nothing. /landlord rendered this list without handlers for months, so
 * a landlord pressing Accept watched the row vanish, changed no booking, and
 * every twelfth press showed "Couldn't accept this order. Try again." on a
 * request that was never sent anywhere. Every student request therefore sat at
 * `requested` forever, which is also why the student's own Pay button - which
 * only exists at `awaiting_payment` - could never appear.
 *
 * PASS `onAccept`/`onDecline`. A caller with no real endpoint yet should say so
 * on screen rather than fall through to a mock that is indistinguishable from
 * a working button.
 */
import { useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import {
  acceptOrderMock,
  declineOrderMock,
  type DeclinePayload,
  type DeclineReasonOption,
} from './order-actions';
import { DeclineReasonPopover } from './decline-reason-popover';

export interface PendingRequestItem {
  id: string;
  name: string;
  avatarUrl?: string;
  /** Small mono badge after the name, e.g. an order id. */
  badge?: string;
  /** Secondary line under the name, e.g. the order items. */
  subtitle?: string;
  /** Highlighted (accent) value on the meta line, e.g. the order total. */
  amount?: string;
  /** Dot-separated meta chips, e.g. ["delivery", "2h ago"] or ["Tanke Crescent", "3B", "2h"]. */
  tags?: string[];
}

interface PendingRequestListProps {
  items: PendingRequestItem[];
  onAccept?: (id: string) => Promise<void>;
  onDecline?: (id: string, payload: DeclinePayload) => Promise<void>;
  /** Decline choices for this role. Defaults to a food vendor's. */
  reasons?: readonly DeclineReasonOption[];
  /** What a row is, in the copy: "order" for a vendor, "request" for a landlord. */
  subject?: string;
  /** Shown when the list is empty. */
  emptyLabel?: string;
}

type RowState = 'idle' | 'accepting' | 'declining' | 'error';

function PendingRow({
  item,
  onAccept,
  onDecline,
  reasons,
  subject,
}: {
  item: PendingRequestItem;
  onAccept: (id: string) => Promise<void>;
  onDecline: (id: string, payload: DeclinePayload) => Promise<void>;
  reasons?: readonly DeclineReasonOption[];
  subject: string;
}) {
  const [state, setState] = useState<RowState>('idle');
  const [error, setError] = useState('');
  const [declineOpen, setDeclineOpen] = useState(false);
  // Plain span wrapper (not the Button itself) as the popover anchor   this
  // works whether or not the Button component forwards refs.
  const declineAnchorRef = useRef<HTMLElement | null>(null);

  const busy = state === 'accepting' || state === 'declining';

  async function handleAccept() {
    setError('');
    setState('accepting');
    try {
      await onAccept(item.id);
      // Parent removes this row from the list on success.
    } catch (e) {
      setState('error');
      // The thrown message when there is one. The generic line used to swallow
      // "That request is no longer waiting on you. Refresh to see where it got
      // to." - which is the whole answer - and replace it with "try again",
      // which is advice that cannot work.
      setError(
        e instanceof Error && e.message ? e.message : "Couldn't accept this request. Try again.",
      );
    }
  }

  async function handleDeclineConfirm(payload: DeclinePayload) {
    setError('');
    setState('declining');
    try {
      await onDecline(item.id, payload);
      setDeclineOpen(false);
    } catch (e) {
      setState('error');
      setError(
        e instanceof Error && e.message ? e.message : "Couldn't decline this request. Try again.",
      );
      setDeclineOpen(false);
    }
  }

  return (
    <Card className="group border-line/5 flex flex-col gap-2 border px-4 py-4 transition-shadow duration-300 hover:shadow-2xl sm:px-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="bg-ink/10 size-10 shrink-0 overflow-hidden rounded-full transition-transform duration-300 group-hover:scale-110">
            {item.avatarUrl && (
              <Image
                src={item.avatarUrl}
                alt={item.name}
                className="size-full object-cover"
                width={100}
                height={100}
              />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-card leading-tight font-semibold break-words">
                {item.name}
              </h3>
              {item.badge && (
                <span className="text-content-muted font-mono text-xs">{item.badge}</span>
              )}
            </div>
            {item.subtitle && (
              <p className="text-content-muted text-sm break-words">{item.subtitle}</p>
            )}
            {(item.amount || item.tags?.length) && (
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                {item.amount && (
                  <span className="text-accent-fg font-mono text-xs font-semibold">
                    {item.amount}
                  </span>
                )}
                {item.tags?.map((tag, i) => (
                  <span key={i} className="text-content-muted flex items-center gap-2 text-xs">
                    {(item.amount || i > 0) && <span aria-hidden>·</span>}
                    <span className="capitalize">{tag}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          <span ref={declineAnchorRef} className="inline-block flex-1 sm:flex-none">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeclineOpen(true)}
              className="w-full sm:w-auto"
            >
              {state === 'declining' ? 'Declining…' : 'Decline'}
            </Button>
          </span>
          <Button
            disabled={busy}
            onClick={handleAccept}
            className="text-ink bg-lime hover:bg-lime/85 border-lime flex-1 rounded-full border font-semibold sm:flex-none"
          >
            {state === 'accepting' ? 'Accepting…' : 'Accept'}
            {state !== 'accepting' && <ArrowRight className="ml-1 size-4" />}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      {declineOpen && (
        <DeclineReasonPopover
          anchorRef={declineAnchorRef as React.RefObject<HTMLElement>}
          submitting={state === 'declining'}
          reasons={reasons}
          subject={subject}
          onCancel={() => setDeclineOpen(false)}
          onConfirm={handleDeclineConfirm}
        />
      )}
    </Card>
  );
}

export function PendingRequestList({
  items: initialItems,
  onAccept = acceptOrderMock,
  onDecline = declineOrderMock,
  reasons,
  subject = 'order',
  emptyLabel = 'No pending orders right now.',
}: PendingRequestListProps) {
  const [items, setItems] = useState(initialItems);

  async function handleAccept(id: string) {
    await onAccept(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleDecline(id: string, payload: DeclinePayload) {
    await onDecline(id, payload);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  if (items.length === 0) {
    // A panel whether or not anything is in it. Dropping the surface for the
    // empty state left a bare patch of page next to the revenue card beside
    // it, which reads as a render that failed rather than as "nothing yet".
    return (
      <Card className="border-line/5 text-content-muted border px-5 py-6 text-sm">
        {emptyLabel}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <PendingRow
          key={item.id}
          item={item}
          onAccept={handleAccept}
          onDecline={handleDecline}
          reasons={reasons}
          subject={subject}
        />
      ))}
    </div>
  );
}
