/**
 * What a student can DO about a booking, at the point they are looking at it.
 *
 * The card used to show a status rail and nothing else, so "pay within 24
 * hours" was an instruction with no button attached to it. Every state below is
 * driven by a column, not by local state:
 *
 *   awaiting_payment  the hold is running   Pay now, or book a viewing.
 *   confirmed         paid                  Confirm move-in, or refund inside 72h.
 *
 * PAYING AND VIEWING ARE BOTH OFFERED, and neither is the fallback. A student
 * being asked for ₦300,000 on a room they have never stood in should not have
 * to choose between paying blind and losing the hold: booking a viewing extends
 * the hold to the viewing date (`sync_booking_hold` reads the inspection), so
 * it is a real third option rather than a consolation.
 *
 * THE REFUND BUTTON DISAPPEARS ON CONFIRMATION, not on the landlord's say-so.
 * `moved_in_at` is the landlord's claim and it only softens the copy; the
 * window closes when the STUDENT confirms. See 20260912090000.
 */
'use client';

import { useEffect, useState, useTransition } from 'react';
import { CalendarDays, FileText, Loader2, Undo2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui';
import { BookViewingDialog } from '@/components/hostels/book-viewing-dialog';
import { useActionRefresh } from '@/lib/query/use-action-refresh';
import { acceptTenancyTerms } from '@/modules/hostels/consent-actions';
import {
  payBookingFromWallet,
  confirmMoveIn,
  refundBooking,
} from '@/modules/hostels/payment-actions';

export interface BookingActionProps {
  bookingId: string;
  status: string;
  /** ISO. Set only while a hold is live. */
  reservedUntil: string | null;
  /** ISO. When they paid, which is what the 72 hours run from. */
  paidAt: string | null;
  movedInAt: string | null;
  moveInConfirmedAt: string | null;
  /** Formatted naira, for the button face. */
  amount: string;
  /** Where the viewing is booked. The hostel page owns that flow. */
  hostelSlug: string;
  /** Booking a viewing needs the hostel, not the listing's URL. */
  hostelId: string;
  hostelName: string;
  /** null when the listing prices no viewing, which hides the button. */
  inspectionFeeKobo: number | null;
  /** ISO. Null means they have not agreed the terms, and cannot pay yet. */
  agreementAcceptedAt: string | null;
  /** The landlord's own agreement, when they have uploaded one. */
  agreementUrl: string | null;
}

/** Today, as the yyyy-mm-dd a date input wants. */
function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function BookingActions(props: BookingActionProps) {
  const { status, paidAt, moveInConfirmedAt, movedInAt } = props;

  if (status === 'awaiting_payment') return <PayPanel {...props} />;
  if (status === 'confirmed') {
    return (
      <ConfirmPanel
        bookingId={props.bookingId}
        paidAt={paidAt}
        movedInAt={movedInAt}
        moveInConfirmedAt={moveInConfirmedAt}
      />
    );
  }

  /*
   * `requested` HAS NO BUTTON, AND HAS TO SAY SO.
   *
   * There is genuinely nothing for the student to do - the landlord has not
   * accepted, so there is no hold and nothing to pay for. But rendering null
   * left a card with a progress rail and no explanation, which reads as a
   * screen that failed to load its own controls rather than a state with no
   * action in it. Pay and Book a viewing appear the moment it is accepted.
   */
  if (status === 'requested' || status === 'interested') {
    return <WaitingPanel {...props} />;
  }
  return null;
}

/**
 * Waiting on the landlord - which is not the same as having nothing to do.
 *
 * A VIEWING DOES NOT WAIT FOR THE LANDLORD. This branch rendered a sentence and
 * no controls, and the sentence said paying and booking a viewing "both appear
 * here" once the request is accepted. Half of that is wrong: an inspection is a
 * separate purchase against the LISTING, it needs no acceptance and no hold,
 * and it is the one thing a student can usefully do during the wait. Told to
 * wait instead, they waited - and a landlord who never answers meant a student
 * who never saw the building.
 *
 * It is also the right order of events. Seeing the room before a landlord
 * accepts is how you find out you do not want it, before there is a 24-hour
 * clock and ₦300,000 attached to the decision.
 */
function WaitingPanel({ bookingId, hostelId, hostelName, inspectionFeeKobo }: BookingActionProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-content-muted text-xs">
        Waiting on the landlord. Once they accept, the room is held for you for 24 hours and the pay
        button appears here.
      </p>
      {inspectionFeeKobo ? (
        <>
          <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
            <CalendarDays className="size-4" aria-hidden="true" />
            Book a viewing ({naira(inspectionFeeKobo)})
          </Button>
          <p className="text-content-muted text-[11px]">
            You do not have to wait for the landlord to see the place. The fee goes to the agent who
            shows you around.
          </p>
          <BookViewingDialog
            open={open}
            onOpenChange={setOpen}
            hostelId={hostelId}
            hostelName={hostelName}
            feeKobo={inspectionFeeKobo}
            bookingId={bookingId}
          />
        </>
      ) : null}
    </div>
  );
}

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

function PayPanel({
  bookingId,
  amount,
  hostelId,
  hostelName,
  inspectionFeeKobo,
  agreementAcceptedAt,
  agreementUrl,
}: BookingActionProps) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const refresh = useActionRefresh();
  // Defaulted to today and editable. The date is required by the payment
  // function because it dates the escrow release, so it cannot be skipped.
  const [moveIn, setMoveIn] = useState(todayIso());

  /*
   * AGREEING IS ITS OWN ACT, AND IT COMES FIRST.
   *
   * Paying used to be the only thing that happened, so it stood in for
   * agreement to terms the student may never have opened. The tick below is
   * recorded by `accept_tenancy_terms` before the payment is attempted, and
   * `bookings_require_terms` refuses the move to `confirmed` without it - so
   * this is a real gate rather than a disabled button somebody could route
   * around. Already-agreed bookings start ticked and stay ticked; consent is a
   * fact about the past and unticking it would be pretending otherwise.
   */
  const alreadyAgreed = !!agreementAcceptedAt;
  const [agreed, setAgreed] = useState(alreadyAgreed);

  function pay() {
    setError(null);
    start(async () => {
      // Recorded BEFORE the payment, in that order. If the payment then fails,
      // the consent stands - which is correct, they did agree - and the
      // database still refuses to confirm anything that was not paid for.
      if (!alreadyAgreed) {
        const consent = await acceptTenancyTerms(bookingId);
        if (!consent.ok) {
          setError(consent.error);
          return;
        }
      }

      const res = await payBookingFromWallet({ bookingId, moveIn });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // revalidatePath in the action busts the SERVER cache; this card and the
      // wallet beside it read React Query, which that leaves untouched. Without
      // this the rail still says "awaiting payment" until a manual reload.
      await refresh();
    });
  }

  return (
    <div className="border-line/10 mt-3 flex flex-col gap-3 rounded-xl border p-3">
      <label className="flex flex-col gap-1">
        <span className="text-content-muted text-[10px] font-bold tracking-widest uppercase">
          When are you moving in?
        </span>
        <input
          type="date"
          value={moveIn}
          min={todayIso()}
          onChange={(e) => setMoveIn(e.target.value)}
          className="border-line/15 bg-surface-deep text-content rounded-lg border px-3 py-2 text-sm"
        />
        {/* Said out loud because it is not obvious that a date field decides
            when money moves. */}
        <span className="text-content-muted text-[11px]">
          Your rent stays in escrow until a week after this date, so the landlord is only paid once
          you are actually in.
        </span>
      </label>

      {/* The terms, and the tick. Above the button, because it is a
          precondition of pressing it rather than a footnote under it. */}
      <label className="border-line/15 bg-surface-deep flex items-start gap-2 rounded-xl border p-3">
        <input
          type="checkbox"
          checked={agreed}
          disabled={alreadyAgreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 size-4 shrink-0"
        />
        <span className="text-content-muted text-xs leading-relaxed">
          I have read and agree to the tenancy terms for {hostelName}
          {agreementUrl ? (
            <>
              {' '}
              — including{' '}
              <a
                href={agreementUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-content inline-flex items-center gap-1 underline"
              >
                <FileText className="size-3" aria-hidden="true" />
                the landlord&rsquo;s own agreement
              </a>
            </>
          ) : null}
          . The full agreement is on your booking once you have paid.
          {alreadyAgreed && <span className="text-content"> Agreed.</span>}
        </span>
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="flex-1" disabled={busy || !moveIn || !agreed} onClick={pay}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Wallet className="size-4" aria-hidden="true" />
          )}
          {busy ? 'Paying…' : `Pay ${amount} from wallet`}
        </Button>

        {/* Was a link to /hostels?h=<slug>, which opened the listing's own
            "Visit before you decide" modal - and that modal ran a setTimeout
            and an alert() and booked nothing. Same dialog as the waiting
            state, opened in place, so the hold countdown and the pay button
            stay on screen behind it. */}
        {inspectionFeeKobo ? (
          <Button variant="outline" className="flex-1" onClick={() => setViewing(true)}>
            <CalendarDays className="size-4" aria-hidden="true" />
            Book a viewing first
          </Button>
        ) : null}
      </div>

      {inspectionFeeKobo ? (
        <BookViewingDialog
          open={viewing}
          onOpenChange={setViewing}
          hostelId={hostelId}
          hostelName={hostelName}
          feeKobo={inspectionFeeKobo}
          bookingId={bookingId}
        />
      ) : null}

      {error && <p className="text-coral text-xs">{error}</p>}
      <p className="text-content-muted text-[11px]">
        Booking a viewing moves the hold to your viewing date, so you do not lose the room while you
        wait to see it.
      </p>
    </div>
  );
}

function ConfirmPanel({
  bookingId,
  paidAt,
  movedInAt,
  moveInConfirmedAt,
}: {
  bookingId: string;
  paidAt: string | null;
  movedInAt: string | null;
  moveInConfirmedAt: string | null;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const refresh = useActionRefresh();

  /*
   * The window is computed from paid_at exactly as the refund function does, so
   * the button disappears at the same moment the database starts refusing.
   *
   * `now` is state rather than a `Date.now()` read during render: reading the
   * clock while rendering is impure (React can render twice and get two
   * answers), and the minute tick is what makes the button vanish on its own
   * rather than on the next navigation.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const windowOpen = paidAt ? now < new Date(paidAt).getTime() + 72 * 3_600_000 : false;

  // Every hook is above this early return: hooks must run in the same order on
  // every render, and a confirmed booking would otherwise skip the two below.
  if (moveInConfirmedAt) {
    return (
      <p className="text-content-muted mt-3 text-xs">
        You confirmed you moved in. Anything from here is settled with our support team.
      </p>
    );
  }

  function run(fn: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn(bookingId);
      if (!res.ok) {
        setError(res.error ?? 'That did not go through.');
        return;
      }
      await refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {movedInAt && (
        <p className="text-content-muted text-xs">
          Your landlord marked you as moved in. Confirming closes this off.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="flex-1" disabled={busy} onClick={() => run(confirmMoveIn)}>
          {busy && <Loader2 className="size-4 animate-spin" />}I have moved in
        </Button>

        {windowOpen && (
          <Button
            variant="outline"
            className="text-coral border-coral/30 hover:bg-coral/10 flex-1"
            disabled={busy}
            onClick={() => run(refundBooking)}
          >
            <Undo2 className="size-4" aria-hidden="true" />
            Cancel and refund
          </Button>
        )}
      </div>

      {error && <p className="text-coral text-xs">{error}</p>}
      <p className="text-content-muted text-[11px]">
        {windowOpen
          ? 'You can cancel for a full refund within 72 hours of paying, as long as you have not confirmed you moved in.'
          : 'The 72 hours to cancel have passed. Our support team can still help if something is wrong.'}
      </p>
    </div>
  );
}
