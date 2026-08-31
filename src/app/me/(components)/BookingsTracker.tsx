// Client component: reads useMyBookings, and /me/page.tsx is a server component.
'use client';

/**
 * BookingsTracker - the student's hostel bookings with a countdown to when each
 * one ends (or to move-in for upcoming ones). This is the core "track the
 * hostels I collected and when they end" surface. Card-per-booking with a
 * status badge + days-left pill.
 */
import { ArrowRight, CalendarClock, Home, MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useMyBookings } from '@/modules/hostels/hooks';
import type { Booking, BookingStatus as DomainBookingStatus } from '@/modules/hostels/types';

/** What this card renders. Unchanged from the shape it was built against. */
export type BookingStatus = 'active' | 'awaiting' | 'ending_soon' | 'upcoming' | 'completed';

export interface StudentBooking {
  id: string;
  property: string;
  room: string;
  area: string;
  status: BookingStatus;
  moveIn: string;
  endDate: string;
  daysLeft: number;
  pricePerSession: number;
  image: string;
}

const dayLabel = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const daysBetween = (iso?: string | null) => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
};

/**
 * The card's four states are about TIME (has it started, is it ending soon).
 * The database's seven are about the BOOKING LIFECYCLE (requested, awaiting
 * payment, confirmed…). They are different questions, so the lifecycle decides
 * first and the dates only refine a confirmed stay.
 */
function toCardStatus(b: Booking): BookingStatus {
  const terminal: DomainBookingStatus[] = ['completed', 'cancelled', 'expired'];
  if (terminal.includes(b.status)) return 'completed';
  // 'awaiting' is the card's word for "we are waiting on the student to pay",
  // which is exactly what awaiting_payment means.
  if (b.status === 'awaiting_payment') return 'awaiting';
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
    area: b.hostelArea ?? '—',
    status,
    moveIn: dayLabel(b.moveIn),
    endDate: dayLabel(b.endDate),
    // Counting down to move-in before it starts, to the end date after.
    daysLeft: status === 'upcoming' ? daysBetween(b.moveIn) : daysBetween(b.endDate),
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
  awaiting: { label: 'Awaiting landlord', variant: 'warning', countdown: 'Move-in in' },
  ending_soon: { label: 'Ending soon', variant: 'warning', countdown: 'Ends in' },
  upcoming: { label: 'Upcoming', variant: 'neutral', countdown: 'Move-in in' },
  completed: { label: 'Completed', variant: 'outline', countdown: 'Ended' },
};

function naira(n: number) {
  return `₦${n.toLocaleString('en-NG')}`;
}

/** Single booking row - reused by the dashboard tracker and /me/bookings. */
export function BookingCard({ booking: b }: { booking: StudentBooking }) {
  const status = STATUS[b.status];
  const done = b.status === 'completed';
  return (
    <Card className="border-line/10 flex flex-col gap-4 border bg-transparent p-4 sm:flex-row sm:items-center">
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
            : b.status === 'ending_soon' || b.status === 'awaiting'
              ? 'bg-coral/10 text-coral'
              : 'bg-lime/15 text-accent-fg',
        )}
      >
        <CalendarClock className="size-4 shrink-0" />
        <div className="leading-tight">
          <p className="text-[10px] font-medium uppercase opacity-80">{status.countdown}</p>
          <p className="text-sm font-semibold">{done ? b.endDate : `${b.daysLeft} days`}</p>
        </div>
      </div>
    </Card>
  );
}

export function BookingsTracker({ basePath = '/me' }: { basePath?: string }) {
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
