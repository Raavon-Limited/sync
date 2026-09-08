'use client';

/**
 * The one booking at the top of the dashboard - the one that needs something.
 *
 * IT WAS PROPS, AND THE PROPS WERE INVENTED. /user/page.tsx rendered this with
 * propertyName="Tanke Crescent Lodge", room="Room 4B", moveInDate="Sept 5",
 * daysAway={18} and requestedAgo="2 hrs ago" written into the JSX. So every
 * student on Sync opened their dashboard to somebody else's room, directly
 * above a MY BOOKINGS list showing their real one - two contradictory answers
 * to "what did I book", a few inches apart. The three buttons took onMessage,
 * onViewBooking and onCancelRequest callbacks and the page passed none of them,
 * so all three were dead on click as well.
 *
 * WHICH BOOKING. Not the newest: the one with a decision in it. A hold running
 * out tonight outranks a stay that starts in March, and a cancelled or finished
 * booking is not featured at all. RANK below is that order, and choosing is the
 * only thing this component decides.
 *
 * NOTHING TO SHOW MEANS NOTHING RENDERED. A billboard with placeholder text is
 * how the invented one survived this long. The list below already says "no
 * bookings yet" properly.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, MessageCircle } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { openChat } from '@/lib/chat-events';
import { useCancelBooking, useMyBookings } from '@/modules/hostels/hooks';
import { confirmMoveIn } from '@/modules/hostels/payment-actions';
import { useOpenHostelConversation } from '@/modules/messaging/hooks';
import { useActionRefresh } from '@/lib/query/use-action-refresh';
import { useSession } from '@/providers/session-provider';
import type { Booking, BookingStatus } from '@/modules/hostels/types';

/** Lower sorts first. A status absent from this map is never featured. */
const RANK: Partial<Record<BookingStatus, number>> = {
  awaiting_payment: 0,
  requested: 1,
  interested: 2,
  confirmed: 3,
};

/** The right-hand line: whose turn it is, in words. */
const HEADLINE: Partial<Record<BookingStatus, string>> = {
  awaiting_payment: 'Pay to confirm',
  requested: 'Awaiting landlord',
  interested: 'Enquiry sent',
  confirmed: 'Confirmed',
};

function relative(iso?: string | null): string | null {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const dayLabel = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : null;

function daysAway(iso?: string | null): number | null {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return d > 0 ? d : null;
}

/**
 * How long until a date, in the unit somebody would actually say.
 *
 * A LEASE IS EIGHT MONTHS, AND "243 days away" IS NOT AN ANSWER. The move-in
 * countdown is days because it is days; the end of a tenancy is months away for
 * most of its life and only becomes a number of days worth reading near the
 * end. Switching at sixty days is where "two months" stops being the more
 * useful phrasing.
 */
function until(iso?: string | null): string | null {
  const days = daysAway(iso);
  if (days === null) return null;
  if (days < 60) return `${days} day${days === 1 ? '' : 's'} away`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'} away`;
}

export function BookingBillboard({ basePath = '/user' }: { basePath?: string }) {
  const router = useRouter();
  const { userId } = useSession();
  const { data: bookings = [] } = useMyBookings();
  const message = useOpenHostelConversation();
  const cancel = useCancelBooking();
  const [error, setError] = useState<string | null>(null);
  const [movingIn, startMoveIn] = useTransition();
  const refresh = useActionRefresh();

  const featured = useMemo<Booking | null>(() => {
    const ranked = bookings
      .filter((b) => RANK[b.status] !== undefined)
      .sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9));
    return ranked[0] ?? null;
  }, [bookings]);

  if (!featured) return null;

  const b = featured;
  // 'requested' and 'interested' are the two a student can still simply
  // withdraw. Cancelling a PAID booking is a refund with its own 72-hour rules
  // and it lives on /user/bookings - calling that "Cancel request" here would
  // understate what the button does.
  const withdrawable = b.status === 'requested' || b.status === 'interested';

  /*
   * YOU CANNOT MESSAGE YOURSELF, AND THE BUTTON USED TO OFFER TO.
   *
   * `open_hostel_conversation` raises 'cannot open a thread with yourself'
   * (42501) when the caller is the hostel's landlord - correctly, since a
   * thread needs two parties. Nothing checked, so a landlord looking at a
   * booking on their own property got a button that could only ever produce a
   * raw database sentence. It is not a rare case either: it is exactly what
   * happens the first time anyone tests both sides on one account, which is
   * how it was found - with zero rows in `conversations` and messaging looking
   * broken from end to end when it was not.
   */
  const ownListing = !!userId && b.hostelLandlordId === userId;
  /*
   * ONCE THEY ARE IN, THE DATE THAT MATTERS CHANGES.
   *
   * The card counted down to move-in for the life of the tenancy, so somebody
   * who had already moved in was told "Move-in 11 Sept - 3 days away" about a
   * day in the past, and nothing anywhere said when their stay ends. Pressing
   * "I have moved in" appeared to do nothing because the only thing it changed
   * was the disappearance of its own button.
   *
   * Before move-in the question is "when do I get in"; after it, "how long have
   * I got". `move_in_confirmed_at` is the switch between the two.
   */
  const movedIn = !!b.moveInConfirmedAt;
  const endsOn = b.graceUntil ?? b.endDate;

  const moveIn = dayLabel(b.moveIn);
  const away = until(b.moveIn);
  const endLabel = dayLabel(endsOn);
  const endAway = until(endsOn);

  // "Requested 18 hrs ago" stops being the interesting fact the moment they
  // are living there.
  const since = movedIn ? relative(b.moveInConfirmedAt) : relative(b.requestedAt ?? b.createdAt);

  return (
    <section className="bg-ink mt-3.5 flex w-full flex-col justify-between gap-6 rounded-xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          {/*
            "ACTIVE BOOKING" DESCRIBED THE ROW, NOT THE THING. A student rents
            one apartment; calling it a booking made this read as one item from
            a list, which is exactly how it looked - the identical room was
            repeated under MY BOOKINGS six inches below. It is their place.
          */}
          <Badge variant="outline" className="self-start border-white/20 text-white">
            {b.status === 'confirmed' ? 'Your apartment' : 'Your apartment · pending'}
          </Badge>
          <div>
            <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
              {b.hostelName ?? 'Hostel'}
              {b.roomLabel ? ` · ${b.roomLabel}` : ''}
            </h2>
            {/*
              MOST BOOKINGS HAVE NO MOVE-IN DATE. Nothing in the request flow
              asks for one - it is chosen at payment - and the invented
              billboard said "Move-in Sept 5, 18 days away" regardless. This is
              the exact line that has to stay quiet rather than count down to a
              date nobody has agreed.
            */}
            <p className="mt-1 text-sm text-white/50">
              {movedIn && endLabel
                ? `Moved in · ends ${endLabel}${endAway ? ` · ${endAway}` : ''}`
                : movedIn
                  ? 'Moved in'
                  : moveIn
                    ? `Move-in ${moveIn}${away ? ` · ${away}` : ''}`
                    : 'Move-in date is set when you pay'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-lime font-display text-right text-lg font-bold sm:text-xl">
            {movedIn ? 'Moved in' : (HEADLINE[b.status] ?? 'In progress')}
          </p>
          {since && (
            <p className="text-sm text-white/40">
              {movedIn ? `Since ${since}` : `Requested ${since}`}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {ownListing ? (
          <p className="text-sm text-white/50">
            This is your own listing, so there is nobody to message about it.
          </p>
        ) : (
          <Button
            disabled={message.isPending}
            onClick={() => {
              setError(null);
              message.mutate(b.hostelId, {
                onSuccess: (conversationId) => {
                  // The floating widget that used to listen for this is gone, so
                  // the event on its own left the student exactly where they
                  // stood. Kept for whatever mounts next, and followed by a real
                  // navigation into the thread.
                  openChat(conversationId);
                  router.push(`${basePath}/messages?c=${conversationId}`);
                },
                onError: (e) =>
                  setError(e instanceof Error ? e.message : 'Could not open that chat.'),
              });
            }}
            className="text-content bg-panel hover:bg-panel/90 flex items-center gap-2 rounded-full font-medium"
          >
            {message.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageCircle className="size-4" />
            )}
            Message landlord
          </Button>
        )}

        {/* The stage rail, the hold clock and the Pay button all live on
            /user/bookings. This points at them rather than being a second copy
            of them that can disagree. */}
        <Button
          variant="outline"
          className="hover:bg-panel/10 rounded-full border-white/30 text-white"
          onClick={() => router.push(`${basePath}/bookings`)}
        >
          {b.status === 'awaiting_payment' ? 'Pay for this room' : 'View booking'}
        </Button>

        {/*
          MOVE-IN IS THE ACTION THIS CARD EXISTS FOR once the rent is paid, and
          it was only reachable from /user/bookings. Confirming is what closes
          the 72-hour refund window and what releases the rent, so it belongs
          on the apartment itself. Hidden once confirmed - there is nothing
          left to do.
        */}
        {b.status === 'confirmed' && !b.moveInConfirmedAt && (
          <Button
            disabled={movingIn}
            className="text-ink bg-lime hover:bg-lime/85 rounded-full font-semibold"
            onClick={() => {
              setError(null);
              startMoveIn(async () => {
                const res = await confirmMoveIn(b.id);
                if (!res.ok) {
                  setError(res.error ?? 'That did not go through.');
                  return;
                }
                // Confirming clears the saved-hostels shortlist and closes the
                // refund window, so several sections of this page change at
                // once - none of them via a server render.
                await refresh();
              });
            }}
          >
            {movingIn ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {movingIn ? 'Confirming…' : 'I have moved in'}
          </Button>
        )}

        {withdrawable && (
          <Button
            variant="outline"
            disabled={cancel.isPending}
            className="hover:bg-panel/10 rounded-full border-white/30 text-white"
            onClick={() => {
              setError(null);
              cancel.mutate(b.id, {
                onError: (e) =>
                  setError(e instanceof Error ? e.message : 'Could not cancel that request.'),
              });
            }}
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel request'}
          </Button>
        )}
      </div>

      {error && <p className="text-coral text-xs">{error}</p>}
    </section>
  );
}
