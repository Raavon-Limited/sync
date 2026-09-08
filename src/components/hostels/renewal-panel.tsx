'use client';

/**
 * "Do you want to keep this room?"
 *
 * WHY IT EXISTS. A tenancy ended, the sweep freed the room, and the person
 * living in it found out by seeing their room on the market. There was no way
 * to keep it and no moment at which anybody was asked.
 *
 * ONE COMPONENT, BOTH SIDES. A tenant asking to stay and a landlord asking
 * them to stay are the same arrangement, so this renders for either - `side`
 * only decides the wording and which button is offered. Whoever did not start
 * it is the one who answers; the database refuses an accept from the person who
 * asked, and offers them Withdraw instead.
 *
 * IT APPEARS WHEN THE DECISION IS LIVE, not permanently. Renewal opens
 * `renewal_window_days` (60) before the lease ends - asking in month one is
 * asking about a room nobody can price yet - and the panel is absent until
 * then rather than present and disabled.
 *
 * ACCEPTING DOES NOT BILL ANYBODY. It agrees the intention; the booking is
 * created when the current term actually ends, at `awaiting_payment`, with the
 * usual 24 hours to pay. The copy says so, because "renewal agreed" reads like
 * a completed transaction and this one still has a payment in front of it.
 */

import { useState, useTransition } from 'react';
import { CalendarCheck, Loader2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { requestRenewal, respondToRenewal } from '@/modules/hostels/renewal-actions';
import { useActionRefresh } from '@/lib/query/use-action-refresh';

const longDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

export type RenewalStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'fulfilled';

export interface RenewalPanelProps {
  bookingId: string;
  /** Whose screen this is. */
  side: 'tenant' | 'landlord';
  endDate?: string | null;
  hostelName?: string | null;
  /** The open request, if there is one. */
  renewal?: { status: RenewalStatus; initiatedBy: 'tenant' | 'landlord' } | null;
  /** How many days before the end renewal opens. Mirrors renewal_window_days. */
  windowDays?: number;
}

export function RenewalPanel({
  bookingId,
  side,
  endDate,
  hostelName,
  renewal,
  windowDays = 60,
}: RenewalPanelProps) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const refresh = useActionRefresh();

  // Absent until the decision is live, rather than present and disabled.
  const daysLeft = endDate ? (new Date(endDate).getTime() - Date.now()) / 86_400_000 : null;
  const open = daysLeft !== null && daysLeft <= windowDays;
  if (!open && !renewal) return null;
  // Settled one way or the other; nothing to show and nothing to press.
  if (renewal && ['declined', 'withdrawn', 'fulfilled'].includes(renewal.status)) return null;

  const theirs = renewal?.initiatedBy === side;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? 'That did not go through.');
        return;
      }
      await refresh();
    });
  }

  return (
    <Card className="border-line/15 flex flex-col gap-3 border p-4">
      <div className="flex items-start gap-3">
        <CalendarCheck className="text-lime-deep mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-content text-sm font-medium">
            {renewal?.status === 'accepted'
              ? 'Renewal agreed'
              : renewal?.status === 'pending'
                ? theirs
                  ? 'Waiting on an answer'
                  : side === 'tenant'
                    ? 'Your landlord offered you another term'
                    : 'Your tenant wants to stay'
                : side === 'tenant'
                  ? 'Keep this room for another term?'
                  : 'Offer this tenant another term?'}
          </p>

          <p className="text-content-muted mt-1 text-xs leading-relaxed">
            {renewal?.status === 'accepted' ? (
              <>
                A new booking opens when this term ends
                {endDate ? ` on ${longDate(endDate)}` : ''}, held for 24 hours while the rent is
                paid. Nothing is charged until then, and the rent is whatever the room is listed at
                on the day.
              </>
            ) : renewal?.status === 'pending' && theirs ? (
              <>
                {side === 'tenant' ? 'Your landlord' : 'Your tenant'} has not answered yet. The room
                stays off the market for a fortnight past the end date while this is open.
              </>
            ) : (
              <>
                {hostelName ? `${hostelName} ` : 'This tenancy '}ends
                {endDate ? ` on ${longDate(endDate)}` : ' soon'}, and the room goes back on the
                market. Agreeing now keeps it{side === 'tenant' ? ' for you' : ' for them'} - the
                rent is due when the new term starts, at whatever the room is listed at then.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Nothing to press once it is agreed - the next action is paying, and
          that appears on the new booking when the term turns over. */}
      {renewal?.status !== 'accepted' && (
        <div className="flex flex-wrap gap-2">
          {!renewal && (
            <Button disabled={busy} onClick={() => run(() => requestRenewal(bookingId))}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {side === 'tenant' ? 'Ask to stay on' : 'Offer another term'}
            </Button>
          )}

          {/* The asker may withdraw; only the other side may accept. */}
          {renewal?.status === 'pending' && theirs && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => run(() => respondToRenewal({ bookingId, accept: false }))}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Withdraw
            </Button>
          )}

          {renewal?.status === 'pending' && !theirs && (
            <>
              <Button
                disabled={busy}
                onClick={() => run(() => respondToRenewal({ bookingId, accept: true }))}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Agree to renew
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => run(() => respondToRenewal({ bookingId, accept: false }))}
              >
                No thanks
              </Button>
            </>
          )}
        </div>
      )}

      {error && <p className="text-coral text-xs">{error}</p>}
    </Card>
  );
}
