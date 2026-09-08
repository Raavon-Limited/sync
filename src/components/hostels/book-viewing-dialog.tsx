'use client';

/**
 * Book a paid viewing of a hostel, for real.
 *
 * WHAT THIS REPLACES. `/hostels` had a "Visit before you decide" modal with a
 * name, a phone and an availability field, and a submit handler that ran a
 * 1000ms `setTimeout`, called `alert()` and cleared the form. Nothing was
 * inserted into `hostel_inspections`, nothing was charged, and the alert told
 * the student "an agent will call to confirm a time". No agent could: the board
 * an agent reads (`open_inspection_board`) lists inspections that are
 * 'scheduled' with no agent yet, and only `confirm_inspection_payment` - driven
 * by the Paystack webhook - ever sets 'scheduled'. So the form produced a
 * student waiting indefinitely for a call that nothing had asked anybody to
 * make.
 *
 * TWO STEPS, IN THIS ORDER, AND THE ORDER IS THE PRODUCT RULE.
 *   1. Insert the row. It lands 'pending_payment' and is invisible to agents.
 *   2. Charge the fee. The webhook flips it to 'scheduled', which is the moment
 *      it appears on the board.
 * Paying is what puts the job in front of agents - it is not a deposit taken
 * after somebody accepts. Any copy implying otherwise has been wrong here
 * before; see docs/WORKFLOW.md.
 *
 * THE ROW SURVIVES A FAILED PAYMENT, deliberately. If the popup is closed or
 * the card is declined, the inspection stays 'pending_payment' rather than
 * being deleted - `confirm_inspection_payment` is idempotent on the reference,
 * so the student can pay for the same row later without booking a second visit
 * and being charged twice for one walk-through.
 *
 * THE FEE IS DISPLAYED FROM THE HOSTEL AND CHARGED FROM THE ROW. What is shown
 * here is `hostels.inspection_fee_kobo`; what is actually charged is read
 * server-side from the inspection's own snapshotted `fee_kobo`, so a price
 * change between opening this dialog and paying cannot surprise anybody.
 */

import { useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { openPaystackCheckout } from '@/lib/paystack/client';
import { useScheduleInspection } from '@/modules/hostels/hooks';
import { useActionRefresh } from '@/lib/query/use-action-refresh';

/** `datetime-local` wants no timezone suffix and minute precision. */
function nowLocalInput(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

export interface BookViewingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostelId: string;
  hostelName: string;
  feeKobo: number;
  /** Ties the visit to a booking so `inspections_sync_hold` extends its hold. */
  bookingId?: string;
  /** Fired once the charge is initialised and the popup reports success. */
  onBooked?: () => void;
}

export function BookViewingDialog({
  open,
  onOpenChange,
  hostelId,
  hostelName,
  feeKobo,
  bookingId,
  onBooked,
}: BookViewingDialogProps) {
  const schedule = useScheduleInspection();
  const refresh = useActionRefresh();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const ready = fullName.trim() && phone.trim() && when && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    setBusy(true);

    try {
      const inspection = await schedule.mutateAsync({
        hostelId,
        // The picker is local time; the column is timestamptz.
        scheduledFor: new Date(when).toISOString(),
        fullName: fullName.trim(),
        phone: phone.trim(),
        feeKobo,
        bookingId,
      });

      const res = await fetch('/api/inspections/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionId: inspection.id }),
      });
      const data = (await res.json()) as {
        accessCode?: string;
        reference?: string;
        alreadyPaid?: boolean;
        error?: string;
      };

      if (data.alreadyPaid) {
        setPaid(true);
        onBooked?.();
        return;
      }
      if (!res.ok || !data.accessCode) {
        // The row exists and is unpaid. Say so, because "try again" on a
        // half-finished booking is how a student ends up with three of them.
        throw new Error(
          data.error ??
            'Your viewing is saved but we could not start the payment. Open it from your bookings to pay.',
        );
      }

      await openPaystackCheckout(data.accessCode, {
        onSuccess: () => {
          /*
           * SCHEDULING IS THE WEBHOOK'S JOB, AND THE WEBHOOK MAY NEVER COME.
           *
           * `confirm_inspection_payment` is what moves this row to 'scheduled'
           * and puts it on the agent board, and only Paystack's webhook called
           * it - which needs a public URL, so on a dev machine a paid viewing
           * stayed 'pending_payment' and invisible to every agent, exactly as
           * a wallet top-up stayed uncredited. Asking the server to verify our
           * own reference applies the same RPC now; it is idempotent on the
           * reference, so the webhook arriving later changes nothing.
           *
           * Deliberately not awaited into the UI: the charge has succeeded
           * either way, and the panel below already says an agent still has to
           * take it. A slow verify must not look like a failed payment.
           */
          if (data.reference) {
            void fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reference: data.reference }),
            }).catch(() => {});
          }
          setPaid(true);
          onBooked?.();
          void refresh();
        },
        onCancel: () => {
          setError('Payment cancelled. Your viewing is saved and unpaid until you pay the fee.');
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not book that viewing.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Visit {hostelName} before you decide</DialogTitle>
          <DialogDescription>
            An agent meets you at the property and walks you through the room.
          </DialogDescription>
        </DialogHeader>

        {paid ? (
          <div className="flex flex-col gap-3">
            <p className="text-content text-sm">
              Payment received. Your request is now in front of our agents - one will take it and
              propose a time, and you confirm that time before anybody sets off.
            </p>
            <p className="text-content-muted text-xs">
              It shows up under Your viewings on the bookings page.
            </p>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            {/*
              THE FEE, AND WHAT PAYING ACTUALLY DOES.
              Stated before the fields rather than at the button, because it is
              the thing that decides whether to fill them in at all. It goes to
              the agent in full - Sync takes no commission on an inspection.
            */}
            <div className="border-line/15 bg-surface-deep rounded-xl border p-3">
              <p className="text-content text-sm font-semibold">A visit costs {naira(feeKobo)}</p>
              <p className="text-content-muted mt-1 text-xs leading-relaxed">
                It goes to the agent who shows you around and is separate from the rent - skip the
                visit and you never pay it. Paying is what puts your request in front of agents: one
                takes it, proposes a time, and you confirm before anybody sets off. One reschedule
                is free.
              </p>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-content-muted text-[10px] font-bold tracking-widest uppercase">
                Your name
              </span>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="First and last name"
                className="border-line/15 bg-surface-deep text-content rounded-lg border px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-content-muted text-[10px] font-bold tracking-widest uppercase">
                Phone
              </span>
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="080..."
                className="border-line/15 bg-surface-deep text-content rounded-lg border px-3 py-2 text-sm"
              />
              <span className="text-content-muted text-[11px]">
                The agent needs a way to reach you on the day.
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-content-muted text-[10px] font-bold tracking-widest uppercase">
                When suits you
              </span>
              <input
                required
                type="datetime-local"
                value={when}
                min={nowLocalInput()}
                onChange={(e) => setWhen(e.target.value)}
                className="border-line/15 bg-surface-deep text-content rounded-lg border px-3 py-2 text-sm"
              />
              <span className="text-content-muted text-[11px]">
                A preference, not a fixture. The agent who takes it proposes a time and you confirm
                it.
              </span>
            </label>

            {error && <p className="text-coral text-xs">{error}</p>}

            <Button type="submit" disabled={!ready}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarDays className="size-4" />
              )}
              {busy ? 'Booking…' : `Pay ${naira(feeKobo)} and book`}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
