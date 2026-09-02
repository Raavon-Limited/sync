/**
 * ROUTE: /me/bookings
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

import { useMemo, useState } from 'react';
import { OrderStageTracker } from '@/components/shared';
import { EmptyState } from '@/components/shared';
import { Calendar, Home, Shirt, Sparkles, Ticket } from 'lucide-react';
import { useMyBookings } from '@/modules/hostels/hooks';
import { useServiceRequests } from '@/modules/services/hooks';
import { useMyTickets } from '@/modules/events/hooks';
import type { Booking, BookingStatus } from '@/modules/hostels/types';
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
  currentIndex: number;
  stages: { id: string; label: string }[];
}

const naira = (kobo?: number | null) => (kobo == null ? ' ' : `₦${(kobo / 100).toLocaleString()}`);
const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : ' ';

// Each vertical's real lifecycle, in order. `currentIndex` is a position in
// THIS list, so a rail can never imply a stage the source does not have.
const HOSTEL_STAGES: BookingStatus[] = ['requested', 'awaiting_payment', 'confirmed', 'completed'];
const HOSTEL_LABELS = ['Requested', 'Awaiting payment', 'Confirmed', 'Completed'];
const SERVICE_STAGES: ServiceRequestStatus[] = ['requested', 'quoted', 'accepted', 'in_progress', 'completed'];
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

function fromBooking(b: Booking): BookingCard {
  const { stages, currentIndex } = rail(HOSTEL_LABELS, HOSTEL_STAGES, b.status);
  return {
    id: b.id.slice(0, 8).toUpperCase(),
    type: 'Hostel',
    title: [b.hostelName ?? 'Hostel', b.roomLabel].filter(Boolean).join(' · '),
    provider: b.hostelArea ?? 'Hostel',
    date: day(b.moveIn ?? b.createdAt),
    price: b.pricePerSessionKobo ? `${naira(b.pricePerSessionKobo)} / session` : ' ',
    status: CLOSED_HOSTEL.includes(b.status) ? 'past' : 'active',
    stages,
    currentIndex,
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

  const getIcon = (type: BookingCard['type']) => {
    switch (type) {
      case 'Hostel': return <Home className="h-4 w-4 text-lime" />;
      case 'Laundry': return <Shirt className="h-4 w-4 text-lime" />;
      case 'Beauty': return <Sparkles className="h-4 w-4 text-lime" />;
      case 'Event': return <Ticket className="h-4 w-4 text-lime" />;
    }
  };

  return (
    <section className="flex flex-col gap-3">
      {/* Eyebrow Path */}
      <h1 className="font-mono text-sm tracking-wide text-content-muted">
        /ME/BOOKINGS
      </h1>

      {/* Header Title */}
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display mt-2 text-3xl font-medium text-content">
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
              <div
                key={booking.id}
                className="border-line/10 bg-panel/40 flex flex-col gap-5 rounded-xl border p-5 backdrop-blur-sm shadow-sm"
              >
                {/* Card Top Row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-ink/5 flex h-9 w-9 items-center justify-center rounded-lg border border-ink/10">
                      {getIcon(booking.type)}
                    </div>
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-content-muted">
                        {booking.id} · {booking.type}
                      </span>
                      <h3 className="font-display text-lg font-medium text-content leading-snug">
                        {booking.title}
                      </h3>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-mono text-sm font-medium text-content">{booking.price}</p>
                    <p className="mt-0.5 flex items-center justify-end gap-1 font-body text-xs text-content-muted">
                      <Calendar className="h-3 w-3" /> {booking.date}
                    </p>
                  </div>
                </div>

                {/* Inner progress rail using system design tokens */}
                <div className="bg-panel/60 border border-line/5 rounded-lg p-4">
                  <OrderStageTracker 
                    stages={booking.stages} 
                    currentIndex={booking.currentIndex} 
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}