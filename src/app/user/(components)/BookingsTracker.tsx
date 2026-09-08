// Client component: reads useMyBookings, and /user/page.tsx is a server component.
'use client';

/**
 * BookingsTracker - the student's hostel bookings with a countdown to when each
 * one ends (or to move-in for upcoming ones). This is the core "track the
 * hostels I collected and when they end" surface. Card-per-booking with a
 * status badge + days-left pill.
 */
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, Home, MapPin, Timer } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useMyBookings } from '@/modules/hostels/hooks';
import type { Booking, BookingStatus as DomainBookingStatus } from '@/modules/hostels/types';

/** What this card renders. Unchanged from the shape it was built against. */
/**
 * `awaiting` USED TO MEAN BOTH SIDES OF THE DECISION, AND SAID THE WRONG ONE.
 *
 * There was one waiting state, mapped from `awaiting_payment` and labelled
 * "Awaiting landlord". The code's own comment said it meant "we are waiting on
 * the STUDENT to pay" - so the label asserted the exact opposite of the state
 * it rendered. A student whose landlord had already accepted was told to sit
 * and wait for that landlord, and the booking stalled until the 24-hour hold
 * quietly expired and the room went back on the market.
 *
 * They are two states because they are two different people's turn:
 *   awaiting_landlord  the request is in, nothing to do but wait.
 *   awaiting_payment   the landlord said yes; the room is held and the clock
 *                      is running on the STUDENT.
 */
export type BookingStatus =
  | 'active'
  | 'awaiting_landlord'
  | 'awaiting_payment'
  | 'ending_soon'
  | 'upcoming'
  | 'completed';

export interface StudentBooking {
  id: string;
  property: string;
  room: string;
  area: string;
  status: BookingStatus;
  moveIn: string;
  endDate: string;
  daysLeft: number;
  /** Whether the relevant date exists at all - see the countdown pill. */
  hasDate: boolean;
  /** ISO deadline of a live 24h hold, or null when nothing is being held. */
  holdEndsAt: string | null;
  pricePerSession: number;
  image: string;
}

const dayLabel = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : ' ';

const daysBetween = (iso?: string | null) => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
};

/**
 * The hold clock, in hours and minutes.
 *
 * DAYS ARE THE WRONG UNIT FOR THIS ONE. Every other date on this card is weeks
 * or months away, so "N days" reads fine. The hold is 24 HOURS - rounded to
 * days it says "1 day" for the first twenty-three and a half hours and then
 * "0 days", which is the least useful possible rendering of a deadline you can
 * actually miss.
 */
function holdRemaining(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Re-renders on a timer so the countdown actually counts.
 *
 * Every 30s, not every second: the display has minute granularity, so a
 * per-second tick would be 59 renders that change nothing. `active` is false
 * for every card that is not on a hold, so a list of confirmed bookings sets no
 * interval at all.
 */
function useTick(active: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [active]);
}

/**
 * The card's four states are about TIME (has it started, is it ending soon).
 * The database's seven are about the BOOKING LIFECYCLE (requested, awaiting
 * payment, confirmed…). They are different questions, so the lifecycle decides
 * first and the dates only refine a confirmed stay.
 */
function toCardStatus(b: Booking): BookingStatus {
  const terminal: DomainBookingStatus[] = ['completed', 'cancelled', 'expired'];
  if (terminal.includes(b.status)) return 'completed';
  if (b.status === 'awaiting_payment') return 'awaiting_payment';
  // `requested` is the one that genuinely IS waiting on the landlord. It used
  // to fall through to 'upcoming' and render as "Upcoming", which told a
  // student a room was theirs before anybody had agreed to it.
  if (b.status === 'requested') return 'awaiting_landlord';
  if (b.status !== 'confirmed') return 'upcoming';
  if (b.moveIn && new Date(b.moveIn).getTime() > Date.now()) return 'upcoming';
  return daysBetween(b.endDate) <= 30 ? 'ending_soon' : 'active';
}

function toCard(b: Booking): StudentBooking {
  const status = toCardStatus(b);
  return {
    id: b.id,
    property: b.hostelName ?? 'Hostel',
    room: b.roomLabel ?? 'Room not assigned',
    area: b.hostelArea ?? ' ',
    status,
    moveIn: dayLabel(b.moveIn),
    endDate: dayLabel(b.endDate),
    // Counting down to move-in before it starts, to the end date after.
    daysLeft: status === 'upcoming' ? daysBetween(b.moveIn) : daysBetween(b.endDate),
    // The date this card is counting to, if there is one at all.
    hasDate: Boolean(status === 'completed' ? b.endDate : (b.moveIn ?? b.endDate)),
    // Only set while a hold is actually running. `reserved_until` is maintained
    // by `bookings_sync_hold` and is null for every status except
    // awaiting_payment, so this is empty exactly when there is no clock.
    holdEndsAt: b.reservedUntil ?? null,
    pricePerSession: (b.pricePerSessionKobo ?? 0) / 100,
    // '' when the hostel has no image, which is every hostel today. BookingCard
    // renders a placeholder rather than an <Image> for it - next/image throws
    // on an empty src.
    image: b.hostelImageUrl ?? '',
  };
}

const STATUS: Record<
  BookingStatus,
  { label: string; variant: 'accent' | 'warning' | 'neutral' | 'outline'; countdown: string }
> = {
  active: { label: 'Active', variant: 'accent', countdown: 'Ends in' },
  awaiting_landlord: { label: 'Awaiting landlord', variant: 'neutral', countdown: 'Move-in in' },
  // `warning` because this one is on a clock the student can lose: the hold
  // runs out and the room goes back on the market.
  awaiting_payment: { label: 'Pay to confirm', variant: 'warning', countdown: 'Move-in in' },
  ending_soon: { label: 'Ending soon', variant: 'warning', countdown: 'Ends in' },
  upcoming: { label: 'Upcoming', variant: 'neutral', countdown: 'Move-in in' },
  completed: { label: 'Completed', variant: 'outline', countdown: 'Ended' },
};

function naira(n: number) {
  return `₦${n.toLocaleString('en-NG')}`;
}

/** Single booking row - reused by the dashboard tracker and /user/bookings. */
export function BookingCard({ booking: b }: { booking: StudentBooking }) {
  const status = STATUS[b.status];
  const done = b.status === 'completed';

  /*
   * THE HOLD CLOCK WINS THE PILL WHENEVER ONE IS RUNNING.
   *
   * Move-in is the right thing to count to for a confirmed stay, and the wrong
   * thing here twice over: nothing has set a move-in date, and the number that
   * decides whether this student keeps the room is the 24 hours they have to
   * pay. `reserved_until` is the real deadline - after it, expire_stale_holds
   * releases the room and it goes back on the market.
   */
  const onHold = b.status === 'awaiting_payment' && !!b.holdEndsAt;
  useTick(onHold);
  const left = onHold ? holdRemaining(b.holdEndsAt) : null;
  return (
    <Card className="border-line/10 flex flex-col gap-4 border p-4 sm:flex-row sm:items-center">
      {/* No hostel in the database carries an image yet, and `toCard` maps a
          missing one to ''. next/image REJECTS an empty src - it warns that the
          browser may re-download the whole page, then throws "Image is missing
          required src property" - so the element must not render at all rather
          than render empty. The comment in toCard already promised this
          fallback; it just did not exist. */}
      <div className="bg-surface-deep relative h-20 w-full shrink-0 overflow-hidden rounded-xl sm:w-28">
        {b.image ? (
          <Image src={b.image} alt={b.property} fill className="object-cover" sizes="112px" />
        ) : (
          <span
            aria-hidden="true"
            className="text-content-muted flex h-full w-full items-center justify-center"
          >
            <Home className="h-6 w-6" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-content text-sm font-medium">
            {b.property} · {b.room}
          </p>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-content-muted mt-1 flex items-center gap-1 text-xs">
          <MapPin className="size-3.5 shrink-0" />
          {b.area} · {naira(b.pricePerSession)}/session
        </p>
        <p className="text-content-muted mt-1 font-mono text-[11px] tracking-wide">
          MOVE-IN {b.moveIn.toUpperCase()} · ENDS {b.endDate.toUpperCase()}
        </p>
      </div>

      {/* Countdown pill */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-2 self-start rounded-xl px-3 py-2 sm:self-center',
          done
            ? 'bg-ink/5 text-content-muted'
            : // Urgent only when the student can actually lose something by
              // waiting: a hold that lapses, or a lease running out. Waiting on
              // the landlord costs them nothing, so it is not coloured as loss.
              b.status === 'ending_soon' || b.status === 'awaiting_payment'
              ? 'bg-coral/10 text-coral'
              : 'bg-lime/15 text-accent-fg',
        )}
      >
        {onHold ? (
          <Timer className="size-4 shrink-0" />
        ) : (
          <CalendarClock className="size-4 shrink-0" />
        )}
        <div className="leading-tight">
          {/*
            NO DATE MEANS NO COUNTDOWN, not a countdown to zero.
            `move_in` is null on every booking - nothing in the request flow
            asks for one - and `daysBetween(null)` returns 0, so this rendered
            "MOVE-IN IN 0 days" on a room nobody had agreed a date for. A
            student reading that is being told they move in today.
          */}
          <p className="text-[10px] font-medium uppercase opacity-80">
            {onHold ? 'Pay within' : done || b.hasDate ? status.countdown : 'Move-in'}
          </p>
          <p className="text-sm font-semibold">
            {onHold
              ? // null once the deadline passes: the sweep has not necessarily
                // run yet, but the room is already gone as far as the student
                // is concerned, so it must not keep counting.
                (left ?? 'Hold expired')
              : done
                ? b.endDate
                : b.hasDate
                  ? `${b.daysLeft} days`
                  : 'Not set'}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function BookingsTracker({ basePath = '/user' }: { basePath?: string }) {
  const { data: bookings = [], isLoading } = useMyBookings();
  const cards = bookings.map(toCard);

  return (
    <div className="flex flex-col gap-3">
      {isLoading &&
        Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-28 animate-pulse rounded-xl" />
        ))}

      {!isLoading && cards.length === 0 && (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
          No bookings yet. Browse hostels to request a room.
        </p>
      )}

      {cards.map((b) => (
        <BookingCard key={b.id} booking={b} />
      ))}

      <Button asChild variant="outline" className="text-content-muted self-start border-none">
        <Link href={`${basePath}/bookings`}>
          View all bookings <ArrowRight className="ml-1 size-4" />
        </Link>
      </Button>
    </div>
  );
}
