/**
 * ROUTE: /user/bookings
 * ACCESS: authenticated student
 * PURPOSE: Everything the student has reserved, across four different tables.
 *
 * THREE SOURCES, ONE LIST
 *   Hostel stays live in `bookings`, laundry and beauty in `service_requests`,
 *   event seats in `tickets`. They share no schema and no status vocabulary, so
 *   each is normalised into the card shape below and the stage rails are drawn
 *   from that source's OWN statuses rather than a made-up common set.
 *
 *   Nothing is faked when a source is empty: a student with no tickets simply
 *   has no ticket rows, which is different from the screen being broken.
 */
'use client';

import { BookingActions } from './(components)/booking-actions';
import { BookingSheet } from './(components)/booking-sheet';
import { TenancyProof } from '@/components/hostels/tenancy-proof';
import { BookingAgreementTab } from '@/components/hostels/booking-agreement-tab';
import { RenewalPanel, type RenewalStatus } from '@/components/hostels/renewal-panel';
import { useSession } from '@/providers/session-provider';
import { useMemo, useState } from 'react';
import { OrderStageTracker } from '@/components/shared';
import { EmptyState } from '@/components/shared';
import { Calendar, Home, Shirt, Sparkles, Ticket } from 'lucide-react';
import { useMyBookings, useMyInspections } from '@/modules/hostels/hooks';
import { useServiceRequests } from '@/modules/services/hooks';
import { useMyTickets } from '@/modules/events/hooks';
import type { Booking, BookingStatus } from '@/modules/hostels/types';
import { ViewingConfirm, type StudentInspection } from './(components)/viewing-confirm';
import type { ServiceRequest, ServiceRequestStatus } from '@/modules/services/types';
import type { Ticket as EventTicket } from '@/modules/events/queries';

interface BookingCard {
  id: string;
  type: 'Hostel' | 'Laundry' | 'Beauty' | 'Event';
  title: string;
  provider: string;
  date: string;
  price: string;
  status: 'active' | 'past';
  /**
   * The live booking behind this card, for hostels only.
   *
   * The card shape flattens four different sources into one row, which is
   * right for rendering and useless for acting: paying needs the booking id,
   * the real status and paid_at, none of which survive that flattening.
   * Carried alongside rather than widening the shared type with hostel-only
   * fields the other three sources would have to leave null.
   */
  actions?: import('./(components)/booking-actions').BookingActionProps;
  /** Hostel bookings only. Services and tickets have no listing to open. */
  hostelSlug?: string | null;
  /**
   * Keeping the room for another term. Present on a live tenancy inside the
   * renewal window, or whenever there is already an open request - a decision
   * that is running has to stay visible even if the window has since passed.
   */
  renewal?: {
    bookingId: string;
    endDate: string | null;
    hostelName: string | null;
    open: { status: RenewalStatus; initiatedBy: 'tenant' | 'landlord' } | null;
  } | null;
  /**
   * Proof of tenancy, for a booking that has actually been paid for.
   *
   * Separate from `actions` because it is a DOCUMENT rather than a control:
   * the tenant's own copy, which may show the rent. The scanned page at
   * /t/<code> deliberately may not - see 20260914090000.
   */
  proof?: {
    bookingId: string;
    hostelName: string;
    roomLabel: string | null;
    moveIn: string | null;
    endDate: string | null;
    amount: string | null;
    rentKobo: number | null;
    acceptedAt: string | null;
    paidAt: string | null;
  } | null;
  currentIndex: number;
  stages: { id: string; label: string }[];
}

const naira = (kobo?: number | null) => (kobo == null ? ' ' : `₦${(kobo / 100).toLocaleString()}`);
const day = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : ' ';

// Each vertical's real lifecycle, in order. `currentIndex` is a position in
// THIS list, so a rail can never imply a stage the source does not have.
/*
 * MOVING IN IS A STAGE, AND IT WAS NOT ON THE RAIL.
 *
 * These four are booking STATUSES, and confirming move-in does not change the
 * status - it sets `move_in_confirmed_at`. So a student pressed "I have moved
 * in", the rail stayed on Confirmed, and the only acknowledgement was a line of
 * grey text underneath. It looked like the button had failed.
 *
 * "Moved in" is therefore not a status but a milestone between confirmed and
 * completed, and `railIndex` below promotes a confirmed booking to it once the
 * column is set. 'completed' still means the tenancy is over.
 */
const HOSTEL_STAGES: BookingStatus[] = ['requested', 'awaiting_payment', 'confirmed', 'completed'];
const HOSTEL_LABELS = ['Requested', 'Awaiting payment', 'Confirmed', 'Moved in', 'Completed'];
const SERVICE_STAGES: ServiceRequestStatus[] = [
  'requested',
  'quoted',
  'accepted',
  'in_progress',
  'completed',
];
const SERVICE_LABELS = ['Requested', 'Quoted', 'Accepted', 'In progress', 'Completed'];

const CLOSED_HOSTEL: BookingStatus[] = ['completed', 'cancelled', 'expired'];
const CLOSED_SERVICE: ServiceRequestStatus[] = ['completed', 'cancelled', 'declined'];

function rail(labels: string[], keys: string[], status: string) {
  const i = keys.indexOf(status);
  return {
    stages: labels.map((label, n) => ({ id: `${n}`, label })),
    // -1 for a terminal status that is not on the happy path (cancelled,
    // declined): show the rail complete rather than at a phantom step 0.
    currentIndex: i >= 0 ? i : labels.length - 1,
  };
}

/**
 * Pure and module-scoped: BookingRow renders it as well as the page, and it
 * captures nothing from either.
 */
function getIcon(type: BookingCard['type']) {
  switch (type) {
    case 'Hostel':
      return <Home className="text-lime h-4 w-4" />;
    case 'Laundry':
      return <Shirt className="text-lime h-4 w-4" />;
    case 'Beauty':
      return <Sparkles className="text-lime h-4 w-4" />;
    case 'Event':
      return <Ticket className="text-lime h-4 w-4" />;
  }
}

function fromBooking(b: Booking): BookingCard {
  // 'interested' IS AN ENQUIRY, WHICH IS THE FIRST STEP, NOT THE LAST.
  // It is not on HOSTEL_STAGES, so `rail` fell through to its terminal-status
  // branch and drew the bar complete at "Completed" - on a booking nobody had
  // even accepted, directly above the line saying it was waiting on the
  // landlord. It sits at the same point on this rail as 'requested' does.
  const { stages } = rail(
    HOSTEL_LABELS,
    HOSTEL_STAGES,
    b.status === 'interested' ? 'requested' : b.status,
  );

  /*
   * The rail has five labels and the status vocabulary has four values, so the
   * position cannot come from the status alone.
   *   requested / interested  0
   *   awaiting_payment        1
   *   confirmed               2, or 3 once they have confirmed move-in
   *   completed / terminal     4
   */
  const statusIndex = HOSTEL_STAGES.indexOf(b.status === 'interested' ? 'requested' : b.status);
  const currentIndex =
    statusIndex < 0
      ? HOSTEL_LABELS.length - 1
      : b.status === 'completed'
        ? HOSTEL_LABELS.length - 1
        : b.status === 'confirmed' && b.moveInConfirmedAt
          ? 3
          : statusIndex;
  return {
    id: b.id.slice(0, 8).toUpperCase(),
    type: 'Hostel',
    title: [b.hostelName ?? 'Hostel', b.roomLabel].filter(Boolean).join(' · '),
    provider: b.hostelArea ?? 'Hostel',
    // Was the move-in date alone, so a tenancy looked like a one-day event
    // and the end date - which nothing wrote until 20260913120000 - never
    // appeared anywhere at all.
    date:
      b.moveIn && b.endDate ? `${day(b.moveIn)} - ${day(b.endDate)}` : day(b.moveIn ?? b.createdAt),
    price: b.pricePerSessionKobo ? `${naira(b.pricePerSessionKobo)} / session` : ' ',
    status: CLOSED_HOSTEL.includes(b.status) ? 'past' : 'active',
    stages,
    currentIndex,
    actions: {
      bookingId: b.id,
      status: b.status,
      reservedUntil: b.reservedUntil ?? null,
      paidAt: b.paidAt ?? null,
      movedInAt: b.movedInAt ?? null,
      moveInConfirmedAt: b.moveInConfirmedAt ?? null,
      amount: b.pricePerSessionKobo ? naira(b.pricePerSessionKobo) : 'the rent',
      hostelSlug: b.hostelSlug ?? '',
      // Booking a viewing happens in place now rather than by bouncing to
      // /hostels, so the actions need the hostel itself and its viewing price.
      // A null fee is a listing that prices no viewing, and the button is
      // hidden rather than offered at zero.
      hostelId: b.hostelId,
      hostelName: b.hostelName ?? 'this hostel',
      inspectionFeeKobo: b.inspectionFeeKobo ?? null,
      agreementAcceptedAt: b.agreementAcceptedAt ?? null,
      agreementUrl: b.hostelAgreementUrl ?? null,
    },
    hostelSlug: b.hostelSlug ?? null,
    renewal:
      b.status === 'confirmed'
        ? {
            bookingId: b.id,
            endDate: b.endDate ?? null,
            hostelName: b.hostelName ?? null,
            open: b.renewal ?? null,
          }
        : null,
    // Only once it is actually theirs. There is nothing to prove about a room
    // nobody has paid for, and the verification code is not issued until the
    // booking confirms.
    proof:
      b.status === 'confirmed' && b.paidAt
        ? {
            bookingId: b.id,
            hostelName: b.hostelName ?? 'Hostel',
            roomLabel: b.roomLabel ?? null,
            moveIn: b.moveIn ?? null,
            endDate: b.endDate ?? null,
            amount: b.pricePerSessionKobo ? naira(b.pricePerSessionKobo) : null,
            // The agreement states these; the proof does not.
            rentKobo: b.pricePerSessionKobo ?? null,
            acceptedAt: b.lockedAt ?? null,
            paidAt: b.paidAt ?? null,
          }
        : null,
  };
}

function fromServiceRequest(r: ServiceRequest): BookingCard {
  const { stages, currentIndex } = rail(SERVICE_LABELS, SERVICE_STAGES, r.status);
  return {
    id: r.code ?? r.id.slice(0, 8).toUpperCase(),
    // 'workmanship' has no icon on this screen; it rides with Laundry rather
    // than being dropped from the list.
    type: r.vertical === 'beauty' ? 'Beauty' : 'Laundry',
    title: r.serviceName ?? `${r.vertical} request`,
    provider: r.vendorName ?? 'Vendor',
    date: day(r.scheduledFor ?? r.createdAt),
    // Agreed price wins over the quote; neither exists until the vendor replies.
    price: naira(r.agreedKobo ?? r.quotedKobo),
    status: CLOSED_SERVICE.includes(r.status) ? 'past' : 'active',
    stages,
    currentIndex,
  };
}

function fromTicket(t: EventTicket): BookingCard {
  const labels = ['Paid', 'Verified', 'Attended'];
  return {
    id: t.reference ?? t.id.slice(0, 8).toUpperCase(),
    type: 'Event',
    title: t.eventName ?? 'Event ticket',
    provider: t.eventVenue ?? 'Venue',
    date: day(t.eventStartsAt ?? t.createdAt),
    price: naira(t.priceKobo),
    status: t.status === 'valid' ? 'active' : 'past',
    stages: labels.map((label, n) => ({ id: `${n}`, label })),
    currentIndex: t.status === 'used' ? 2 : t.status === 'refunded' ? 2 : 1,
  };
}

export default function BookingsPage() {
  const [activeTab, setActiveTab] = useState<'active' | 'past'>('active');

  const { data: hostelBookings = [], isLoading: lb } = useMyBookings();
  const { data: serviceRequests = [], isLoading: ls } = useServiceRequests();
  const { data: tickets = [], isLoading: lt } = useMyTickets();
  // Paid viewings. Their own section rather than a BookingCard: that card is a
  // stage rail, and the only thing that matters on a viewing is a question the
  // student has to answer.
  const { data: inspections = [] } = useMyInspections();
  const isLoading = lb || ls || lt;

  const allBookings = useMemo<BookingCard[]>(
    () => [
      ...hostelBookings.map(fromBooking),
      ...serviceRequests.map(fromServiceRequest),
      ...tickets.map(fromTicket),
    ],
    [hostelBookings, serviceRequests, tickets],
  );

  const filteredBookings = allBookings.filter((booking) => booking.status === activeTab);

  return (
    <section className="flex flex-col gap-3">
      {/* Eyebrow Path */}
      <h1 className="text-content-muted font-mono text-sm tracking-wide">/ME/BOOKINGS</h1>

      {/* ABOVE THE TABS, because it is the only thing on this page that asks
          something of the student rather than telling them something. */}
      <ViewingConfirm
        inspections={inspections.map<StudentInspection>((i) => ({
          id: i.id,
          hostelName: i.hostelName ?? 'Hostel',
          scheduledFor: i.scheduledFor,
          status: i.status,
          feeKobo: i.feeKobo,
          agentName: i.agentName ?? null,
          meetingPoint: i.meetingPoint ?? null,
          proposedFor: i.proposedFor ?? null,
          studentConfirmedAt: i.studentConfirmedAt ?? null,
          reportFiledAt: i.reportFiledAt ?? null,
          disputedAt: i.disputedAt ?? null,
        }))}
      />

      {/* Header Title */}
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Your <span className="text-lime">Bookings</span>
        </h2>
      </div>

      {/* Interactive Tabs Menu */}
      <div className="border-line/10 mt-4 flex gap-2 border-b pb-px">
        <button
          onClick={() => setActiveTab('active')}
          className={`font-body relative pb-3 text-sm font-medium transition-colors ${
            activeTab === 'active' ? 'text-content' : 'text-content-muted hover:text-content'
          }`}
        >
          Active Orders
          {activeTab === 'active' && (
            <div className="bg-lime absolute bottom-0 left-0 h-0.5 w-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('past')}
          className={`font-body relative pb-3 text-sm font-medium transition-colors ${
            activeTab === 'past' ? 'text-content' : 'text-content-muted hover:text-content'
          }`}
        >
          Past History
          {activeTab === 'past' && (
            <div className="bg-lime absolute bottom-0 left-0 h-0.5 w-full" />
          )}
        </button>
      </div>

      {/* Content Rendering Block */}
      <section className="mt-6">
        {isLoading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-ink/5 h-40 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : filteredBookings.length === 0 ? (
          <EmptyState
            title={`No ${activeTab} bookings found`}
            description={`You do not have any registered ${activeTab} bookings or reservations processing at this moment.`}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {filteredBookings.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

/**
 * One booking, and the listing behind it.
 *
 * A component rather than JSX inside the map because it owns state: the sheet
 * is open or closed PER CARD, and a single flag on the page would open every
 * row at once. Hooks cannot be called inside a map callback either.
 *
 * Only hostel bookings open a sheet - a service request and a ticket have no
 * listing to show, so their cards stay inert rather than offering a press that
 * opens an empty panel.
 */
function BookingRow({ booking }: { booking: BookingCard }) {
  // The name on the proof is the holder's own. It lives on the session's
  // profile rather than at the top level - `fullName` is a field OF the profile.
  const { profile } = useSession();
  const [open, setOpen] = useState(false);
  const canOpen = Boolean(booking.hostelSlug);

  return (
    <>
      {/* Pressable only when there is a listing to open. A service request or
            an event ticket has none, so those cards stay inert rather than
            offering a press that opens an empty panel.

            Not a <button>: this contains buttons of its own, and nesting
            interactive elements is invalid HTML. role/tabIndex plus the key
            handler give the same keyboard and screen-reader behaviour. */}
      <div
        {...(canOpen && {
          role: 'button' as const,
          tabIndex: 0,
          onClick: () => setOpen(true),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
            }
          },
        })}
        className={
          'border-line/10 bg-panel/40 flex flex-col gap-5 rounded-xl border p-5 shadow-sm backdrop-blur-sm' +
          (canOpen ? ' hover:border-line/25 cursor-pointer transition-colors' : '')
        }
      >
        {/* Card Top Row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-ink/5 border-ink/10 flex h-9 w-9 items-center justify-center rounded-lg border">
              {getIcon(booking.type)}
            </div>
            <div>
              <span className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
                {booking.id} · {booking.type}
              </span>
              <h3 className="font-display text-content text-lg leading-snug font-medium">
                {booking.title}
              </h3>
            </div>
          </div>

          <div className="text-right">
            <p className="text-content font-mono text-sm font-medium">{booking.price}</p>
            <p className="font-body text-content-muted mt-0.5 flex items-center justify-end gap-1 text-xs">
              <Calendar className="h-3 w-3" /> {booking.date}
            </p>
          </div>
        </div>

        {/* Inner progress rail using system design tokens */}
        <div className="bg-panel/60 border-line/5 rounded-lg border p-4">
          <OrderStageTracker stages={booking.stages} currentIndex={booking.currentIndex} />
        </div>

        {/* The rail says where the booking IS. This is how it moves.

              ON THE CARD, not only in the sheet: paying is the whole point of
              a held room and it must not be one press away behind a panel
              somebody has to discover. The sheet is for reading the listing.

              stopPropagation because the card around this opens that sheet -
              without it, pressing Pay would also slide a panel over the
              confirmation the student is trying to read. */}
        <div onClick={(e) => e.stopPropagation()}>
          {booking.actions && <BookingActions {...booking.actions} />}

          {/* The renewal decision sits with the tenancy it is about, not on a
              separate screen somebody has to know exists. It renders nothing
              until the term is close enough to decide. */}
          {booking.renewal && (
            <div className="mt-3">
              <RenewalPanel
                bookingId={booking.renewal.bookingId}
                side="tenant"
                endDate={booking.renewal.endDate}
                hostelName={booking.renewal.hostelName}
                renewal={booking.renewal.open}
              />
            </div>
          )}
        </div>
      </div>

      {canOpen && (
        <BookingSheet
          slug={booking.hostelSlug as string}
          open={open}
          onOpenChange={setOpen}
          agreement={
            booking.proof ? (
              <BookingAgreementTab
                slug={booking.hostelSlug as string}
                reference={booking.id}
                studentName={profile?.fullName ?? 'This student'}
                hostelName={booking.proof.hostelName}
                roomLabel={booking.proof.roomLabel}
                rentKobo={booking.proof.rentKobo}
                moveIn={booking.proof.moveIn}
                endDate={booking.proof.endDate}
                acceptedAt={booking.proof.acceptedAt}
                paidAt={booking.proof.paidAt}
              />
            ) : undefined
          }
          proof={
            booking.proof ? (
              <TenancyProof
                bookingId={booking.proof.bookingId}
                studentName={profile?.fullName ?? 'This student'}
                hostelName={booking.proof.hostelName}
                roomLabel={booking.proof.roomLabel}
                moveIn={booking.proof.moveIn}
                endDate={booking.proof.endDate}
                amount={booking.proof.amount}
              />
            ) : undefined
          }
        />
      )}
    </>
  );
}
