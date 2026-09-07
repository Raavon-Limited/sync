'use client';

import { useMemo, useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ROOM_TYPE_NAMES } from '@/lib/constants/room-types';
import { useCreateBooking, useHostel, useHostels, useMyBookings } from '@/modules/hostels/hooks';
import { rentQuote, naira } from '@/modules/hostels/pricing';
import type {
  Booking,
  BookingStatus,
  FeeMode,
  Hostel as DomainHostel,
} from '@/modules/hostels/types';
import { useSession } from '@/providers/session-provider';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import Image, { type StaticImageData } from 'next/image';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { HostelMap } from './(components)/hostel-map';
import hostelImg from '@/assets/images/hostel.jpeg';
import hostel1Img from '@/assets/images/hostel1.jpeg';
import hostelArielImg from '@/assets/images/hostelariel.jpeg';

interface Hostel {
  id: string;
  slug: string;
  name: string;
  location: string;
  /** The street address, when the landlord gave one. */
  address?: string | null;
  landmark?: string | null;
  status: 'available' | 'full' | 'limited';
  /** Kobo. Formatting happens at render   see `modules/hostels/pricing`. */
  rentKobo: number;
  feeMode: FeeMode;
  /** What a VISIT costs, if the student books one. Never added to the rent. */
  inspectionFeeKobo: number;
  /** The landlord's own photos, in display order. Empty is a real state. */
  photos: string[];
  /** The landlord's own words, or null. Never a house style paragraph. */
  description?: string | null;
  tags: string[];
  houseRules: string[];
  /** An agent has stood in the building. Not "listed", not "live"   visited. */
  isVerified: boolean;
  lat?: number | null;
  lng?: number | null;
  totalRooms: number;
  roomsLeft: number;
  /** A `room_types` name, verbatim   see the note above `FILTERS`. */
  type: string;
}

/**
 * Card shape for this page. The domain type (`@/modules/hostels/types`) carries
 * rooms, images and availability; this is the flattened view the cards render.
 *
 * PLACEHOLDER PHOTOS, AND ONLY THAT
 *   These three stock shots stand in for a listing whose landlord has not
 *   uploaded any, so a card is not an empty grey box. They are NOT the gallery:
 *   the detail view used to render them unconditionally, captioned "+ 8
 *   Blueprint Photos", for every hostel on the platform   which meant a student
 *   was looking at a building nobody had photographed while being told there
 *   were eight more pictures of it.
 */
const HOSTEL_IMAGES = [hostelImg, hostel1Img, hostelArielImg];

/**
 * RECONCILED. This page used to map an occupancy column onto a layout filter
 * and send everything it could not express to 'others'   with only
 * 'Self-contain' overlapping, that was most of the catalogue.
 *
 * 20260907180000_room_types made `hostels.room_type` the layout taxonomy, so
 * there is nothing left to translate: the value IS the layout. The comment that
 * stood here said "reconciling them properly is a schema decision", and that
 * decision has now been made.
 *
 * Older listings whose room_type is a retired value ('Sharing', 'Female only',
 * 'Male only') match no filter chip until their landlord re-picks one. Visible,
 * and better than filing them under a layout nobody chose.
 */

/**
 * 'reserved' IS GONE, AND IT WAS THE WRONG WORD.
 *
 * A hostel with no rooms left was badged "Reserved", and the detail view then
 * printed "Reserved Allocation" beside it. Reserved by WHOM, and for whom? The
 * word describes a hold placed FOR somebody - which is what happens to one room
 * for one student for 24 hours - and it was being used for a building that is
 * simply full. A student reading it had every reason to think a room was being
 * kept for them.
 *
 * The state is 'full', it is called "Fully booked", and it is the same
 * vocabulary /hostels/[slug] already used (AVAILABILITY_LABEL there). Two
 * screens describing one condition should not need two words for it.
 */
function toStatus(availability?: string, roomsLeft?: number): Hostel['status'] {
  if (availability === 'full' || roomsLeft === 0) return 'full';
  if (availability === 'filling_up') return 'limited';
  return 'available';
}

/** Domain hostel -> the flat shape these cards were built against. */
function toCard(h: DomainHostel): Hostel {
  const roomsTotal = h.roomsTotal ?? h.rooms.length;
  // `state` is computed by the `hostel_room_state` view and is not a column on
  // `hostel_rooms`, so it is absent from every room this page is handed. The
  // old fallback filtered on it anyway, counted 0 every time, and badged the
  // catalogue "FULLY BOOKED". Whether a room is free is the availability
  // view's answer and nobody else's; when it has no answer the honest read is
  // "not known to be full", never "closed".
  const roomsLeft = h.roomsAvailable ?? roomsTotal;
  return {
    id: h.id,
    slug: h.slug,
    name: h.name,
    location: h.area,
    address: h.address ?? null,
    landmark: h.landmark ?? null,
    status: toStatus(h.availability, roomsLeft),
    rentKobo: h.pricePerSessionKobo,
    feeMode: h.feeMode,
    inspectionFeeKobo: h.inspectionFeeKobo,
    photos: h.images.map((i) => i.url),
    description: h.description ?? null,
    tags: h.amenities ?? [],
    houseRules: h.houseRules ?? [],
    isVerified: h.isVerified,
    lat: h.lat ?? null,
    lng: h.lng ?? null,
    totalRooms: roomsTotal,
    roomsLeft,
    type: h.roomType,
  };
}

// Built from the room types rather than typed out, so adding a layout is an
// insert in `room_types` and not an edit here. The label is the name: a
// landlord picked "1 room 1 parlour", and showing a student anything else
// invites them to wonder which one they are looking at.
const FILTERS = [
  { value: 'all', label: 'All Layouts' },
  ...ROOM_TYPE_NAMES.map((name) => ({ value: name, label: name })),
];

/**
 * The statuses that count as "you already have a request on this hostel".
 *
 * This list is not a judgement call: it is copied from
 * `bookings_one_active_per_student_hostel_idx` (0006), the partial unique index
 * on (student_id, hostel_id). Matching it exactly means the UI hides the button
 * in precisely the cases the database would refuse it, rather than offering a
 * request that comes back as a unique violation reading "That has already been
 * taken. Try a different one."
 */
const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  'interested',
  'requested',
  'awaiting_payment',
  'confirmed',
];

function activeBookingFor(bookings: Booking[], hostelId: string): Booking | undefined {
  return bookings.find(
    (b) => b.hostelId === hostelId && ACTIVE_BOOKING_STATUSES.includes(b.status),
  );
}

/** Where a booking has got to, in the student's words. Same rail as /user/bookings. */
const BOOKING_LABEL: Record<string, string> = {
  interested: 'Saved',
  requested: 'Waiting on the landlord',
  awaiting_payment: 'Accepted — pay to confirm',
  confirmed: 'Confirmed',
};

/**
 * Has an agent actually been to this building?
 *
 * `verified` is flipped only by the verification-visit flow, after somebody has
 * stood in the property   `guard_hostel_privileged_cols` reverts any attempt by
 * a landlord to set it themselves. So the badge is worth something, which is
 * precisely why the detail view could not go on printing "Real-time Verified ·
 * 2026" over listings nobody had visited.
 *
 * The unverified state is stated rather than left blank. "Not visited yet" is
 * something a student should weigh before paying a session of rent; an absent
 * badge just looks like a badge that failed to load.
 */
function VerifiedBadge({ verified, compact = false }: { verified: boolean; compact?: boolean }) {
  if (verified) {
    return (
      <span
        className={`whitespace-nowrap rounded-full border border-lime-500/30 bg-lime-500/10 font-semibold text-lime-400 ${
          compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-0.5 text-xs'
        }`}
      >
        ✓ Visited by an agent
      </span>
    );
  }
  return (
    <span
      className={`whitespace-nowrap rounded-full border border-line/20 bg-surface-deep font-semibold text-content-muted ${
        compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-0.5 text-xs'
      }`}
      title="No agent has inspected this listing yet."
    >
      Not visited yet
    </span>
  );
}

/**
 * The listing's own photos.
 *
 * Same three-up arrangement the mock had, filled from `hostel_images` instead
 * of from `src/assets`. The tile count adapts: one photo is one wide tile, not
 * one photo and four copies of somebody else's building.
 */
function Gallery({ hostel }: { hostel: Hostel }) {
  const photos = hostel.photos;

  if (photos.length === 0) {
    return (
      <div className="border-b border-line/10 pb-6">
        <div className="border-line/10 bg-panel text-content-muted flex h-48 flex-col items-center justify-center gap-1 rounded-2xl border text-center">
          <p className="text-sm font-semibold text-content">No photos yet</p>
          <p className="text-xs">
            The landlord has not uploaded any. Book a visit, or message them, before you pay.
          </p>
        </div>
      </div>
    );
  }

  const [cover, ...rest] = photos;
  const side = rest.slice(0, 4);
  // Only what is really behind the last tile, and only when there is more.
  const hidden = photos.length - 1 - side.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-0 pb-6 border-b border-line/10">
      <div
        className={`h-64 rounded-2xl relative overflow-hidden border border-line/10 group ${
          side.length ? 'md:col-span-2' : 'md:col-span-4'
        }`}
      >
        <Image
          src={cover}
          alt={hostel.name}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      {side.length > 0 && (
        <div className="hidden md:grid md:col-span-2 grid-cols-2 gap-2 content-start">
          {side.map((url, i) => {
            const isLast = i === side.length - 1 && hidden > 0;
            return (
              <div
                key={url}
                className={`relative h-31 overflow-hidden rounded-2xl border ${
                  isLast ? 'border-lime-500/30' : 'border-line/10'
                }`}
              >
                <Image src={url} alt={`${hostel.name}, photo ${i + 2}`} fill sizes="25vw" className="object-cover" />
                {isLast && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                    <span className="text-lime-400 font-bold text-sm">
                      +{hidden} more
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const STATUS_MAP = {
  available: {
    label: 'Rooms available',
    cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  },
  full: {
    label: 'Fully booked',
    cls: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
  },
  limited: {
    label: 'Filling up',
    cls: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  },
} as const;

/**
 * useSearchParams() suspends, and Next requires a boundary above it or the
 * whole route opts out of static rendering with a build-time error. The
 * boundary is here rather than around a fragment of the tree because the
 * selected hostel drives the entire screen.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <HostelsPage />
    </Suspense>
  );
}

function HostelsPage() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<(typeof FILTERS)[number]['value']>('all');
  const [selectedHostel, setSelectedHostel] = useState<Hostel | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Inspection Scheduler System States
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAvailableTime, setClientAvailableTime] = useState('');
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState<{ sender: 'user' | 'agent'; text: string }[]>([
    { sender: 'agent', text: 'Hello! I am the manager for this listing. Would you like to confirm a physical walkthrough or process payment details?' }
  ]);

  /**
   * THE BOOKING SIDE, WHICH IS NOW REAL.
   *
   * `useMyBookings` is scoped by RLS to the caller's own rows and refetches on
   * a 30s interval, which matters here: a hold expires on a timestamp, so a
   * page left open must not keep showing one that has lapsed. An anonymous
   * visitor gets an empty list rather than an error, so this is safe to call
   * on a public page.
   */
  // `isLoading` matters as much as the answer. "Not signed in" and "not known
  // yet" are different states, and rendering the first while the second is true
  // is what told a signed-in student to sign in.
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const book = useCreateBooking();
  const { data: myBookings = [] } = useMyBookings();

  // These modals are hand-rolled `fixed inset-0` divs rather than Radix, so
  // nothing was stopping the listing scrolling away behind them. Covers both:
  // whichever is open, the page underneath holds still.
  useScrollLock(showModal || showScheduleModal);

  /**
   * ROOMS FOR THE PICKER.
   *
   * The list query does not attach room state   `hostel_room_state` is a
   * per-hostel view and joining it across a whole catalogue is a query per
   * card. The DETAIL fetch does attach it (`fetchHostelBySlug` runs
   * `attachRoomState`), and the detail is one hostel, so this is where the
   * question is cheap to ask. Disabled until a hostel is actually selected.
   */
  /*
    The choice is stored WITH the hostel it was made on, so it cannot leak onto
    another one. Resetting it in an effect keyed on the hostel would work, but
    only after a render in which the previous hostel's room was still selected
    - and that render is the one that decides whether the request button is
    enabled.
  */
  const [roomChoice, setRoomChoice] = useState<{ hostelId: string; roomId: string } | null>(null);
  const selectedRoomId =
    roomChoice && roomChoice.hostelId === selectedHostel?.id ? roomChoice.roomId : null;
  const setSelectedRoomId = (roomId: string | null) =>
    setRoomChoice(roomId && selectedHostel ? { hostelId: selectedHostel.id, roomId } : null);
  const { data: selectedDetail, isLoading: roomsLoading } = useHostel(selectedHostel?.slug);
  const freeRooms = useMemo(
    () =>
      (selectedDetail?.rooms ?? []).filter(
        // `undefined` means the view had no row for this room yet, which is not
        // a promise that it is free   see attachRoomState. Only an explicit
        // 'free' is offered.
        (r) => r.state === 'free',
      ),
    [selectedDetail],
  );


  const bookingForSelected = useMemo(
    () => (selectedHostel ? activeBookingFor(myBookings, selectedHostel.id) : undefined),
    [myBookings, selectedHostel],
  );

  /**
   * A live hold's deadline, or null. `reserved_until` is set by
   * `bookings_sync_hold` (0006) and ONLY while the booking is
   * 'awaiting_payment' - a booking still at 'requested' is waiting on the
   * landlord and is not holding anything yet, which is why the old unconditional
   * 24-hour countdown was wrong about the one thing it was there to say.
   */
  const holdEndsAt = bookingForSelected?.reservedUntil
    ? new Date(bookingForSelected.reservedUntil).getTime()
    : null;

  // A second hand, and only while there is something counting down. Ticking
  // unconditionally would re-render the whole page once a second for the
  // benefit of a panel that is not on screen.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const counting = holdEndsAt != null && holdEndsAt > nowMs;
  useEffect(() => {
    if (holdEndsAt == null) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [holdEndsAt]);

  // Reset the per-listing UI whenever a different hostel is selected.
  // `reset` is a stable reference from useMutation, so naming it here satisfies
  // exhaustive-deps without re-running this on every render.
  const resetBooking = book.reset;
  /* eslint-disable react-hooks/set-state-in-effect -- intentional reset on selection change */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setChatOpen(false);
    setShowScheduleModal(false);
    setShowModal(false);
    setBookingError(null);
    setClientName('');
    setClientPhone('');
    setClientAvailableTime('');
    resetBooking();
  }, [selectedHostel, resetBooking]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** Milliseconds -> "HH:MM:SS". Clamped at zero rather than counting negative. */
  const formatCountdown = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Ask the landlord for a room.
   *
   * NO ROOM ID. This screen has no room picker - `/hostels/[slug]` is the one
   * that does - so the request is for the hostel and the landlord assigns the
   * room when they accept. `bookings_one_active_per_student_hostel_idx` means a
   * second request for the same hostel is refused by the database; the UI shows
   * the existing one instead of offering a button that cannot work.
   */
  const requestRoom = () => {
    if (!selectedHostel) return;
    setBookingError(null);
    book.mutate(
      // `roomId` was always accepted by the mutation and never sent, so every
      // booking landed with room_id null - the landlord got "somebody wants a
      // room" with no way to know which, and the per-room unique index had
      // nothing to enforce. undefined (not null) when a hostel lists no rooms
      // at all, which is still a legitimate request for the building.
      { hostelId: selectedHostel.id, roomId: selectedRoomId ?? undefined },
      {
        onSuccess: () => setShowModal(false),
        onError: (e) =>
          setBookingError(
            e instanceof Error ? e.message : 'We could not send that request. Try again.',
          ),
      },
    );
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    setMessages((prev) => [...prev, { sender: 'user', text: chatMessage }]);
    setChatMessage('');
    
    setTimeout(() => {
      // A canned reply, and it must not make claims about the booking. The one
      // it replaced said "Holding allocation open", which now contradicts the
      // real status shown two panels up. Real threads exist   see
      // `useOpenHostelConversation`, which /hostels/[slug] already uses.
      setMessages((prev) => [...prev, { sender: 'agent', text: 'Thanks — a real reply comes through Messages once the landlord picks this up.' }]);
    }, 1200);
  };

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !clientPhone || !clientAvailableTime) return;
    
    setIsSubmittingSchedule(true);
    
    setTimeout(() => {
      setIsSubmittingSchedule(false);
      setShowScheduleModal(false);
      alert(
        `Inspection request sent.\n\nName: ${clientName}\nPhone: ${clientPhone}\nWhen: ${clientAvailableTime}\n\nAn agent will call to confirm a time. The ${naira(
          selectedHostel?.inspectionFeeKobo ?? 0,
        )} fee is paid then, and only then   nothing has been charged yet.`,
      );
      setClientName('');
      setClientPhone('');
      setClientAvailableTime('');
    }, 1000);
  };

  // Real hostels. The page keeps its own card shape; `toCard` bridges the two.
  const { data: domainHostels = [], isLoading: hostelsLoading } = useHostels();
  const HOSTELS = useMemo(() => domainHostels.map(toCard), [domainHostels]);

  /**
   * DEEP LINK: /hostels?h=<slug> OPENS THAT HOSTEL'S DETAIL.
   *
   * There were two hostel detail screens. `/hostels/[slug]` rendered an older,
   * thinner one and is what the landing page and /around have always linked to;
   * this page rendered the maintained one but only ever reachable by clicking a
   * card, because the selection lived in local state and nothing put it in the
   * URL. So the same hostel looked different depending on how you arrived, and
   * the fee breakdown, the map and the verified badge were missing from the
   * route most visitors actually landed on.
   *
   * Selecting into state rather than routing per hostel is what the rest of
   * this screen is built around (the grid stays mounted behind the detail), so
   * the URL is made to drive the state instead of the other way round. The slug
   * route now redirects here   see hostels/[slug]/page.tsx.
   *
   * Runs once per slug, not once per render: re-selecting on every list refetch
   * would fight a student who has since pressed Back to the grid.
   */
  const deepLinkSlug = useSearchParams().get('h');
  const [appliedDeepLink, setAppliedDeepLink] = useState<string | null>(null);
  // Derived during render, not in an effect. The list arrives asynchronously so
  // this cannot be initial state, and an effect would paint the grid first and
  // then snap to the detail. Setting state during render of the SAME component
  // is the supported pattern for exactly this.
  if (deepLinkSlug && appliedDeepLink !== deepLinkSlug) {
    const match = HOSTELS.find((h) => h.slug === deepLinkSlug);
    // No match yet means the list is still loading; try again next render.
    if (match) {
      setAppliedDeepLink(deepLinkSlug);
      setSelectedHostel(match);
    }
  }
  /**
   * The landlord's own first photo, or a placeholder when they uploaded none.
   *
   * Keyed off the slug rather than the list index so a card does not change
   * picture when a filter reorders the grid   which is what the old
   * `findIndex` version did.
   */
  const imageFor = (hostel: Hostel): string | StaticImageData => {
    if (hostel.photos[0]) return hostel.photos[0];
    let hash = 0;
    for (const ch of hostel.slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return HOSTEL_IMAGES[hash % HOSTEL_IMAGES.length];
  };

  const totalHostelsCount = HOSTELS.length;
  /** The real cheapest listing, or null while there are none to be cheapest. */
  const cheapestKobo = useMemo(
    () => (HOSTELS.length ? Math.min(...HOSTELS.map((h) => h.rentKobo)) : null),
    [HOSTELS],
  );
  const remainingHostels = useMemo(() => {
    if (!selectedHostel) return [];
    return HOSTELS.filter((h) => h.slug !== selectedHostel.slug);
  }, [selectedHostel, HOSTELS]);

  const visible = useMemo(
    () =>
      HOSTELS.filter((hostel) => {
        // Address, landmark and layout joined the haystack along with the search
        // box: a student who knows the street or the landmark but not the
        // hostel's name is the ordinary case here, and those columns are now
        // being read anyway.
        const matchesQuery =
          query.trim() === '' ||
          [
            hostel.name,
            hostel.location,
            hostel.address ?? '',
            hostel.landmark ?? '',
            hostel.type,
            hostel.tags.join(' '),
          ]
            .join(' ')
            .toLowerCase()
            .includes(query.trim().toLowerCase());

        const matchesFilter =
          active === 'all' ? true : hostel.type === active;

        return matchesQuery && matchesFilter;
      }),
    // HOSTELS is fetched, not a module constant   without it here the list
    // stays empty after the data loads.
    [active, query, HOSTELS],
  );

  /* ==================== SCREEN 2: DEDICATED HOSTEL DETAIL VIEW ==================== */
  if (selectedHostel) {
    // Mirrors `public.quote_rent`. Every naira figure on this screen comes from
    // here, so the card and the charge cannot disagree.
    const quote = rentQuote(selectedHostel.rentKobo, selectedHostel.feeMode);

    return (
      <main className="min-h-screen text-current transition-colors duration-300 animate-in fade-in duration-500 relative">
        
        {/*
          THE REQUEST, CONFIRMED BEFORE IT IS SENT.

          What this replaces claimed the room "has been locked exclusively for
          your profile account token" and started a 24-hour countdown against
          nothing: no booking row was created anywhere on this screen. The
          sequence the database actually implements is request -> the landlord
          accepts -> the hold begins, and this now says that and then does it.
        */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/60 animate-in fade-in duration-200">
            <div className="border border-zinc-800 bg-zinc-950 p-6 md:p-8 rounded-3xl max-w-md w-full text-center shadow-2xl space-y-5 animate-in zoom-in-95 duration-300">
              <div className="h-12 w-12 rounded-full bg-lime-500/10 border border-lime-500/30 text-lime-400 flex items-center justify-center mx-auto text-xl">
                🔑
              </div>
              <div>
                <h3 className="text-xl font-black tracking-tight text-white">
                  Request a room at {selectedHostel.name}?
                </h3>
                <ol className="text-xs text-zinc-400 mt-3 space-y-1.5 text-left list-decimal list-inside leading-relaxed">
                  <li>The landlord sees your request and picks you a room.</li>
                  <li>
                    When they accept, that room is held for you for 24 hours and the countdown
                    starts here.
                  </li>
                  <li>You pay within the 24 hours to confirm it.</li>
                </ol>
                <p className="text-xs bg-lime-500/5 text-lime-400 border border-lime-500/20 p-3 rounded-xl mt-4 font-semibold">
                  Nothing is charged now, and nothing is charged until you choose to pay.
                </p>
              </div>

              {bookingError && (
                <p className="text-xs text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 text-left">
                  {bookingError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={book.isPending}
                  className="flex-1 py-3 border border-zinc-800 text-zinc-300 hover:text-white font-bold rounded-xl text-xs transition-all disabled:opacity-50"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={requestRoom}
                  disabled={book.isPending}
                  className="flex-2 py-3 bg-lime-400 hover:bg-lime-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all"
                >
                  {book.isPending ? 'Sending…' : 'Send request'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== SCHEDULE INSPECTION MODAL SYSTEM ==================== */}
        {showScheduleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/60 animate-in fade-in duration-200">
            <div className="border border-zinc-800 bg-zinc-950 p-6 md:p-8 rounded-3xl max-w-md w-full shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-300 text-left">
              
              <button 
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors text-lg p-1 font-mono focus:outline-none"
              >
                ✕
              </button>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-lime-400 tracking-wider font-mono">Optional</span>
                <h3 className="text-xl font-black tracking-tight text-white">Visit before you decide</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  An agent meets you at <span className="text-zinc-200 font-bold">{selectedHostel.name}</span> and walks you through the room.
                </p>
              </div>

              {/*
                THE FEE, WHERE IT ACTUALLY APPLIES.
                It used to be described as "mandatory" both here and as a line
                on the rent breakdown, so every student was quoted it whether or
                not they wanted a visit. It buys one thing - this visit - and it
                is the AGENT'S fee: Sync takes no commission on it. The amount is
                the hostel's own `inspection_fee_kobo`, not a constant, because
                the column exists and a listing may price a visit differently.
              */}
              <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-3.5 flex items-start gap-3">
                <span className="text-base mt-0.5">💡</span>
                <div className="text-xs text-amber-300/90 leading-relaxed">
                  <span className="font-extrabold text-white block mb-0.5">
                    A visit costs {naira(selectedHostel.inspectionFeeKobo)}
                  </span>
                  {/*
                    THE ORDER HERE WAS BACKWARDS AND CONTRADICTED THE DATABASE.
                    This read "you pay after an agent confirms a time, not now".
                    The opposite is true: `confirm_inspection_payment` sets the
                    inspection to 'scheduled', and `open_inspection_board` only
                    lists inspections that are 'scheduled' with no agent yet. So
                    paying is what PUTS the job in front of agents - an unpaid
                    request is invisible to every one of them and nobody is ever
                    coming. Telling a student to wait for a confirmation that
                    their own payment triggers left them waiting forever.
                  */}
                  It goes to the agent who shows you around, and it is separate from the rent
                  {' '}&mdash; skip the visit and you never pay it. Paying is what puts your request
                  in front of agents: one takes it, proposes a time, and you confirm before anybody
                  sets off. One reschedule is free.
                </div>
              </div>

              <form onSubmit={handleScheduleSubmit} className="space-y-3 pt-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Your name</label>
                  <input 
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Enter your first and last name"
                    className="w-full h-11 bg-zinc-900 border border-zinc-800 focus:border-lime-400 rounded-xl px-3.5 text-xs text-white outline-none transition-colors placeholder-zinc-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Phone / WhatsApp</label>
                  <input 
                    type="tel"
                    required
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="e.g., +234 812 345 6789"
                    className="w-full h-11 bg-zinc-900 border border-zinc-800 focus:border-lime-400 rounded-xl px-3.5 text-xs text-white outline-none transition-colors placeholder-zinc-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">When are you free?</label>
                  <input 
                    type="text"
                    required
                    value={clientAvailableTime}
                    onChange={(e) => setClientAvailableTime(e.target.value)}
                    placeholder="e.g., Saturday morning between 10am - 2pm"
                    className="w-full h-11 bg-zinc-900 border border-zinc-800 focus:border-lime-400 rounded-xl px-3.5 text-xs text-white outline-none transition-colors placeholder-zinc-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingSchedule}
                  className="w-full h-12 bg-lime-400 hover:bg-lime-500 disabled:bg-zinc-800 text-black disabled:text-zinc-500 font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all mt-4 shadow-lg flex items-center justify-center gap-2"
                >
                  {isSubmittingSchedule ? (
                    <span>Sending…</span>
                  ) : (
                    <span>Request a visit</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
          
          {/* Top Navigation Bar */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-line/10">
            <button
              type="button"
              onClick={() => setSelectedHostel(null)}
              className="flex items-center gap-2 group text-sm font-semibold text-content-muted hover:text-lime-400 transition-colors"
            >
              <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to hostels
            </button>
            <ThemeToggle />
          </div>

          {/* Other listings, when there are any. A row headed "Explore Remaining
              (0):" with nothing after it is a control with no controls in it. */}
          {remainingHostels.length > 0 && (
            <div className="mb-8 border border-line/10 rounded-2xl p-4 bg-panel flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-300">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-content-muted tracking-wider">Other hostels</span>
                <div className="text-xs text-content-muted">
                  {remainingHostels.length} more {remainingHostels.length === 1 ? 'listing' : 'listings'} in Malete.
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                {remainingHostels.map((hostel) => (
                  <button
                    key={hostel.slug}
                    onClick={() => setSelectedHostel(hostel)}
                    type="button"
                    className="whitespace-nowrap text-[11px] font-medium border border-line/10 hover:border-line/25 bg-surface-deep text-content hover:text-lime-400 px-3 py-1.5 rounded-xl transition-all"
                  >
                    {hostel.name} ·{' '}
                    {hostel.roomsLeft === 0 ? 'full' : `${hostel.roomsLeft} free`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Core Content Shell */}
          <div className="bg-transparent rounded-3xl overflow-hidden">
            
            {/*
              THE LANDLORD'S PHOTOS.
              This grid used to render the same three imported JPEGs for every
              hostel on the platform, captioned "Exterior walkway", "Kitchen
              spaces", "Bathroom profile" and "+ 8 Blueprint Photos" - four
              claims about rooms in a specific building, made by a file in
              src/assets. A listing with no photos now says it has none, which
              is information a student can act on.
            */}
            <Gallery hostel={selectedHostel} />

            {/* Core Data Fields */}
            <div className="py-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
              
              {/* Left Column Structural Details */}
              <div className="lg:col-span-7 space-y-8">
                <div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {/*
                      THE BADGE NOW READS THE COLUMN.
                      It used to say "Real-time Verified · 2026" on every
                      listing, unconditionally - including this one, which no
                      agent has visited. `verified` is set only by the
                      verification-visit flow after somebody has stood in the
                      building (see modules/hostels/actions), and a badge that
                      says otherwise for a hostel nobody has seen is worse than
                      no badge: it is the one claim the whole flow exists to
                      make.
                    */}
                    <VerifiedBadge verified={selectedHostel.isVerified} />
                    <span className={`px-3 py-0.5 rounded-full border text-xs font-semibold ${STATUS_MAP[selectedHostel.status].cls}`}>
                      {STATUS_MAP[selectedHostel.status].label}
                    </span>
                    <span className="px-3 py-0.5 rounded-full border border-line/10 bg-panel text-content-muted text-xs font-mono">
                      {selectedHostel.type}
                    </span>
                  </div>

                  <h1 className="text-4xl font-black tracking-tight text-current">
                    {selectedHostel.name}
                  </h1>

                  {/*
                    No rating and no landlord name here on purpose. There is no
                    reviews aggregate on `hostels`, so the "★ 0 (Verified
                    Reviews)" this replaced was reporting a score nobody had
                    given; and the landlord's name lives in `profiles`, which is
                    own-row-only, so "Managed by " rendered with nothing after
                    it. Both come back when there is a column behind them.
                  */}
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-content-muted">
                    <span>{selectedHostel.address ?? selectedHostel.location}</span>
                    {selectedHostel.landmark && (
                      <>
                        <span aria-hidden="true">•</span>
                        <span>near {selectedHostel.landmark}</span>
                      </>
                    )}
                    <span aria-hidden="true">•</span>
                    <span>
                      {selectedHostel.roomsLeft} of {selectedHostel.totalRooms} rooms free
                    </span>
                  </div>
                </div>

                {selectedHostel.description && (
                  <div className="border-t border-dashed border-line/10 pt-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-content-muted mb-2">
                      About this place
                    </h3>
                    {/*
                      The LANDLORD'S words (hostels.description, added by
                      20260908090000). What stood here was one house-written
                      paragraph about "maximum academic tranquility", printed
                      identically under every listing - so it described nothing
                      and distinguished nothing. A landlord who wrote no
                      description now gets no section, rather than someone
                      else's prose over their name.
                    */}
                    <p className="text-sm leading-relaxed text-content-muted whitespace-pre-line">
                      {selectedHostel.description}
                    </p>
                  </div>
                )}

                {/* The amenities the landlord actually ticked. */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-content-muted mb-3">
                    What this place has
                  </h3>
                  {selectedHostel.tags.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {selectedHostel.tags.map((facility) => (
                        <div key={facility} className="flex items-center gap-2 border border-line/10 rounded-xl p-2.5 bg-panel text-xs">
                          <span className="text-lime-400 font-bold">✓</span>
                          <span className="font-medium text-content">{facility}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-content-muted">
                      The landlord has not listed any amenities yet. Ask them before you book.
                    </p>
                  )}
                </div>

                {selectedHostel.houseRules.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-content-muted mb-3">
                      House rules
                    </h3>
                    <ul className="space-y-1.5 text-sm text-content-muted">
                      {selectedHostel.houseRules.map((rule) => (
                        <li key={rule} className="flex gap-2">
                          <span aria-hidden="true" className="text-content-muted">–</span>
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="border-t border-dashed border-line/10 pt-6">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-content-muted mb-3">
                    Where it is
                  </h3>
                  <HostelMap
                    name={selectedHostel.name}
                    lat={selectedHostel.lat}
                    lng={selectedHostel.lng}
                    area={selectedHostel.location}
                    address={selectedHostel.address}
                  />
                </div>
              </div>

              {/* Right Sidebar Calculations & CTA Interaction Deck */}
              <div className="lg:col-span-5 space-y-4">
                <div className="border border-line/10 rounded-2xl p-6 bg-panel shadow-xl relative overflow-hidden">

                  {/*
                    WHAT A STUDENT ACTUALLY PAYS.

                    This panel used to add two numbers to the rent that no
                    column produced: a flat "Original Breakdown Overhead Fee" of
                    ₦25,000, hardcoded and charged to every listing regardless of
                    price, and a "Mandatory Inspection Fee" of ₦5,000 for a visit
                    the student had not asked for. A ₦300,000 room was quoted at
                    ₦330,000 and neither ₦30,000 of it existed anywhere in the
                    schema.

                    Meanwhile Sync's REAL charge - 2.5% of the rent, per
                    20260902090000_money_model - appeared nowhere at all.

                    The quote now comes from `rentQuote`, which mirrors
                    `public.quote_rent`, so the total on this card is the total
                    the database will charge. Under 'absorb' that is the rent
                    exactly; under 'pass_on' the landlord has chosen to add
                    Sync's 2.5%, and it is itemised rather than folded in.
                  */}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[10px] text-content-muted uppercase font-bold tracking-wider">Rent per session</p>
                      <h2 className="text-4xl font-black font-mono text-current mt-1">
                        {naira(quote.rentKobo)}
                      </h2>
                    </div>
                    <span className="text-xs font-semibold bg-lime-500/10 border border-lime-500/20 text-lime-400 px-2.5 py-1 rounded-md">
                      Per session
                    </span>
                  </div>

                  <div className="space-y-2 border-b border-dashed border-line/10 pb-4 mb-4 text-xs text-content-muted">
                    <div className="flex justify-between">
                      <span>Rent, one academic session</span>
                      <span className="font-mono text-content">{naira(quote.rentKobo)}</span>
                    </div>
                    {quote.feeMode === 'pass_on' ? (
                      <div className="flex justify-between">
                        <span>Sync service fee (2.5%)</span>
                        <span className="font-mono text-content">+ {naira(quote.feeKobo)}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between">
                        <span>Sync service fee</span>
                        <span className="font-mono text-content-muted">Included</span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center text-sm font-bold text-current mb-2">
                    <span>Total to pay</span>
                    <span className="text-xl font-mono text-lime-400">{naira(quote.totalKobo)}</span>
                  </div>

                  {/*
                    Said here, next to the total, because "is there anything
                    else?" is the question this card exists to answer. The
                    inspection fee is real and is a genuine cost - it is simply
                    not part of this number unless the student chooses a visit.
                  */}
                  <p className="text-[11px] text-content-muted mb-6 leading-relaxed">
                    Nothing else is added at checkout. A visit is optional and costs{' '}
                    {naira(selectedHostel.inspectionFeeKobo)} separately, paid to the agent who
                    shows you around.
                  </p>

                  {/*
                    FOUR STATES, ALL OF THEM TRUE.

                    Signed out, full, already requested, and available. The panel
                    used to have one: a button that flipped a local boolean and
                    started a timer. Every branch below is driven by a row -
                    `bookings` for the request, `hostel_availability` for the
                    capacity, the session for the identity.
                  */}
                  <div className="space-y-3">
                    {sessionLoading ? (
                      /* Neither state asserted while the answer is unknown. The
                         session is seeded from the server in the root layout, so
                         this is a blink on a cold client rather than the norm. */
                      <div
                        aria-busy="true"
                        className="bg-surface-deep border-line/10 flex w-full items-center justify-center rounded-xl border py-3.5 text-xs font-bold tracking-wider uppercase opacity-60"
                      >
                        <span className="border-content-muted/40 border-t-content-muted mr-2 size-4 animate-spin rounded-full border-2" />
                        Checking your account
                      </div>
                    ) : !isAuthenticated ? (
                      <Link
                        href={`/login?next=${encodeURIComponent('/hostels')}`}
                        className="w-full py-3.5 bg-lime-400 hover:bg-lime-500 text-black font-extrabold rounded-xl text-xs transition-all uppercase tracking-wider shadow-lg active:scale-95 flex items-center justify-center"
                      >
                        Sign in to request a room
                      </Link>
                    ) : bookingForSelected ? (
                      <div className="space-y-2">
                        <div className="border border-line/10 bg-surface-deep p-4 rounded-xl space-y-1">
                          <p className="text-[10px] text-content-muted uppercase tracking-widest font-bold">
                            Your request
                          </p>
                          <p className="text-sm font-bold text-content">
                            {BOOKING_LABEL[bookingForSelected.status] ?? bookingForSelected.status}
                          </p>
                          {bookingForSelected.roomLabel && (
                            <p className="text-[11px] text-content-muted">
                              Room {bookingForSelected.roomLabel}
                            </p>
                          )}
                        </div>

                        {/*
                          The countdown, from `reserved_until` rather than from a
                          number this component made up. It exists only while the
                          booking is 'awaiting_payment', which is exactly when a
                          room is genuinely being held.
                        */}
                        {counting && holdEndsAt != null && (
                          <div className="border border-amber-500/30 bg-amber-500/5 p-4 rounded-xl text-center space-y-1">
                            <p className="text-[10px] text-amber-400 uppercase tracking-widest font-bold">
                              Held for you — pay within
                            </p>
                            <h4 className="text-2xl font-black font-mono text-amber-400 tracking-wider">
                              {formatCountdown(holdEndsAt - nowMs)}
                            </h4>
                          </div>
                        )}
                        {holdEndsAt != null && !counting && (
                          <p className="text-[11px] text-rose-400 text-center">
                            That hold has expired. Ask the landlord to re-open it.
                          </p>
                        )}

                        <div className="grid grid-cols-5 gap-2">
                          <Link
                            href="/user/bookings"
                            className="col-span-3 bg-surface-deep border border-line/10 rounded-xl p-3 flex flex-col justify-center text-content hover:text-lime-400 transition-colors"
                          >
                            <span className="text-[9px] uppercase text-content-muted block">Manage</span>
                            <span className="text-[11px] font-bold">Go to my bookings</span>
                          </Link>

                          <button
                            type="button"
                            onClick={() => setChatOpen(!chatOpen)}
                            className={`col-span-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 border border-line/10 ${
                              chatOpen ? 'bg-lime-400 text-black border-lime-400' : 'bg-surface-deep text-content hover:bg-panel'
                            }`}
                          >
                            <span className="text-base">💬</span>
                            <span>{chatOpen ? 'Hide chat' : 'Chat'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/*
                          PICK THE ROOM, THEN REQUEST IT.
                          "Request this room" sat under no room at all: the
                          booking went in with `room_id` null, so neither the
                          student nor the landlord knew which room had been
                          asked for, and `bookings_one_hold_per_room_idx` had
                          nothing to protect.

                          Only free rooms are listed. `state` comes from the
                          `hostel_room_state` view via the detail fetch - taken
                          and held rooms are not rendered at all rather than
                          shown disabled, because a room somebody else is paying
                          for is not this student's to consider.
                        */}
                        {roomsLoading ? (
                          <p className="text-content-muted text-[11px]">Loading rooms…</p>
                        ) : freeRooms.length > 0 ? (
                          <label className="block space-y-1.5">
                            <span className="text-content-muted text-[10px] font-bold tracking-widest uppercase">
                              Choose a room
                            </span>
                            <select
                              value={selectedRoomId ?? ''}
                              onChange={(e) => setSelectedRoomId(e.target.value || null)}
                              className="border-line/15 bg-surface-deep text-content w-full rounded-xl border px-3 py-3 text-sm font-medium"
                            >
                              <option value="">Select a room…</option>
                              {freeRooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.label}
                                  {r.priceKobo ? ` — ${naira(r.priceKobo)}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => setShowModal(true)}
                          disabled={
                            selectedHostel.status === 'full' ||
                            book.isPending ||
                            (freeRooms.length > 0 && !selectedRoomId)
                          }
                          className="w-full py-3.5 bg-lime-400 hover:bg-lime-500 disabled:bg-surface-deep disabled:text-content-muted text-black font-extrabold rounded-xl text-xs transition-all uppercase tracking-wider shadow-lg active:scale-95 disabled:active:scale-100 disabled:cursor-not-allowed"
                        >
                          {/* A full hostel had a live "Lock Apartment Layout" button
                              over a "SOLD OUT" counter. One of the two was lying. */}
                          {selectedHostel.status === 'full'
                            ? 'No rooms left'
                            : freeRooms.length > 0 && !selectedRoomId
                              ? 'Choose a room first'
                              : 'Request this room'}
                        </button>
                        {/* The modal owns the error while it is open; this catches
                            one that arrives after it closes. */}
                        {bookingError && !showModal && (
                          <p className="text-[11px] text-rose-400">{bookingError}</p>
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowScheduleModal(true)}
                      className="w-full py-3 border border-line/10 text-content hover:text-lime-400 font-bold rounded-xl text-xs hover:bg-surface-deep transition-all active:scale-98"
                    >
                      Book a visit ({naira(selectedHostel.inspectionFeeKobo)}) — optional
                    </button>
                  </div>
                </div>

                {/* Inline Drawer messaging pane block element */}
                {bookingForSelected && chatOpen && (
                  <div className="border border-zinc-800 rounded-2xl bg-zinc-950 p-4 shadow-xl flex flex-col h-72 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-400" />
                        {/* The landlord's name is in `profiles`, own-row-only,
                            so there is nothing to put here yet   see toCard. */}
                        <span className="text-xs font-bold text-white">Listing agent</span>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 p-1 text-xs no-scrollbar">
                      {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                            msg.sender === 'user' ? 'bg-lime-400 text-black font-medium' : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleSendMessage} className="mt-2 flex gap-1.5 pt-2 border-t border-zinc-800/60">
                      <input
                        type="text"
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        placeholder="Ask about deposits, documents..."
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 text-xs outline-none text-white focus:border-lime-500/50"
                      />
                      <button type="submit" className="bg-zinc-100 hover:bg-white text-black px-3 rounded-xl text-xs font-bold transition-all">
                        Send
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* ==================== SCREEN 1: COMPREHENSIVE DIRECTORY LIST VIEW ==================== */
  return (
    <main className="min-h-screen text-current transition-colors duration-300 animate-in fade-in duration-500">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        

        {/* Hero Section */}
        <section className="mb-10">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display tracking-tight font-extrabold text-current leading-tight">
            Find your{' '}
            <span className="block md:inline italic text-lime-400 font-normal">
              perfect hostel.
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm md:text-base text-content-muted">
            Off-campus rooms around Malete, listed by their landlords. Filter by layout to find
            the ones you can actually live in.
          </p>

          {/*
            TWO TILES, BOTH COMPUTED.
            There were three. "Starting Price ₦70,000" was a literal that had
            nothing to do with the listings underneath it - the cheapest room on
            screen was ₦250,000 - and "System Quality 4.6 ★" was an average of a
            reviews table that does not exist. A number nobody can trace is worse
            than an empty space where a number would go.
          */}
          <div className="grid grid-cols-2 gap-3 mt-8 max-w-md">
            <div className="bg-panel border border-line/10 rounded-2xl p-4">
              <p className="text-xs text-content-muted font-medium">Listings</p>
              <h3 className="text-2xl font-bold mt-1 text-content">{totalHostelsCount}</h3>
            </div>
            <div className="bg-panel border border-line/10 rounded-2xl p-4">
              <p className="text-xs text-content-muted font-medium">From</p>
              <h3 className="text-2xl font-bold mt-1 text-content">
                {cheapestKobo == null ? '—' : naira(cheapestKobo)}
              </h3>
            </div>
          </div>
        </section>

        {/*
          THE SEARCH BOX THAT WAS MISSING.

          `query` has always been in the filter - it matches name, area and
          amenities - but nothing ever called `setQuery`, so there was no way to
          type into it and lint had been flagging the setter as unused. The
          filter was written and then never given an input.
        */}
        <div className="relative mb-4">
          <label htmlFor="hostel-search" className="sr-only">
            Search hostels
          </label>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-content-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            id="hostel-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, area or amenity — “Safari”, “Wi-Fi”…"
            className="w-full h-12 rounded-2xl border border-line/10 bg-panel pl-11 pr-11 text-sm text-content outline-none transition-colors placeholder:text-content-muted focus:border-lime-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-content-muted transition-colors hover:text-content"
            >
              ✕
            </button>
          )}
        </div>

        {/* Layout Filter Row Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5 no-scrollbar scroll-smooth">
          {FILTERS.map((filter) => {
            const isSelected = active === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setActive(filter.value)}
                className={`whitespace-nowrap px-5 py-2 rounded-full border text-sm font-medium transition-all duration-200 transform active:scale-95 ${
                  isSelected
                    ? 'bg-zinc-100 text-black border-zinc-100 shadow-sm'
                    : 'bg-panel text-content-muted border-line/10 hover:bg-surface-deep'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-content-muted">
            {hostelsLoading
              ? 'Loading hostels…'
              : `Showing ${visible.length} of ${totalHostelsCount}`}
          </p>
        </div>

        {/* Hostels Directory Cards Block Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* An empty grid because you searched for "penthouse" is not the same
              thing as an empty grid because nobody has listed anything. */}
          {!hostelsLoading && visible.length === 0 && (
            <div className="text-content-muted col-span-full space-y-3 py-10 text-center text-sm">
              {totalHostelsCount === 0 ? (
                <p>No hostels published yet.</p>
              ) : (
                <>
                  <p>
                    Nothing matches{query.trim() ? ` “${query.trim()}”` : ' those filters'}
                    {active !== 'all' ? ` in ${active}` : ''}.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setActive('all');
                    }}
                    className="rounded-full border border-line/10 bg-panel px-4 py-2 text-xs font-semibold text-content transition-colors hover:text-lime-400"
                  >
                    Clear search and filters
                  </button>
                </>
              )}
            </div>
          )}

          {visible.map((hostel) => (
            <div
              key={hostel.slug}
              onClick={() => setSelectedHostel(hostel)}
              className="group text-left cursor-pointer overflow-hidden rounded-3xl border border-line/10 bg-panel transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-line/15 flex flex-col h-full focus:outline-none"
            >
              <div className="h-44 w-full relative overflow-hidden border-b border-line/10">
                <Image
                  src={imageFor(hostel)}
                  alt={hostel.photos[0] ? hostel.name : `${hostel.name} (no photo yet)`}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {/* Gradient so the badges stay legible over the photo */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent"
                />
                {/* Said on the card, not just in the gallery: a student
                    scrolling a grid is comparing pictures, and needs to know
                    when one of them is not of this building. */}
                {!hostel.photos[0] && (
                  <span className="absolute top-4 left-4 z-10 text-[10px] font-semibold bg-black/70 text-zinc-200 border border-zinc-700 px-2 py-0.5 rounded">
                    No photo yet
                  </span>
                )}
                <span className={`absolute top-4 right-4 px-3 py-1 rounded-full border text-xs font-semibold backdrop-blur-xs z-10 shadow-sm ${STATUS_MAP[hostel.status].cls}`}>
                  {STATUS_MAP[hostel.status].label}
                </span>
                <span className="absolute bottom-3 left-4 z-10 text-[10px] uppercase tracking-wider font-mono bg-black/60 text-zinc-300 border border-zinc-800 px-2 py-0.5 rounded">
                  {hostel.type}
                </span>
              </div>

              <div className="p-5 flex flex-col flex-1 justify-between">
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h3 className="font-bold text-lg text-current group-hover:text-lime-400 transition-colors">
                        {hostel.name}
                      </h3>
                      <p className="text-xs text-content-muted mt-1 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {hostel.location}
                      </p>
                    </div>
                    {/* The star rating that was here read "★ 0" on every card,
                        because there is no reviews aggregate. Verification is a
                        fact we do hold, and is the one a student is looking for
                        at this size. */}
                    <VerifiedBadge verified={hostel.isVerified} compact />
                  </div>

                  {/* Room counters matrix */}
                  <div className="mt-3 flex items-center justify-between border border-line/10 rounded-xl p-2 bg-surface-deep text-[11px] font-mono">
                    <span className="text-content-muted">Rooms</span>
                    <span className="text-content font-bold">{hostel.totalRooms} total</span>
                    <span className="text-content-muted">|</span>
                    <span className={`${hostel.roomsLeft === 0 ? 'text-rose-400 font-black' : 'text-lime-400 font-black'}`}>
                      {hostel.roomsLeft === 0 ? 'FULLY BOOKED' : `${hostel.roomsLeft} FREE`}
                    </span>
                  </div>

                  <div className="mt-4">
                    <p className="text-2xl font-black text-current font-mono tracking-tight">
                      {naira(rentQuote(hostel.rentKobo, hostel.feeMode).totalKobo)}
                    </p>
                    <span className="text-[11px] text-content-muted font-medium">
                      per session
                      {hostel.feeMode === 'pass_on' ? ', service fee included' : ''}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 mt-5">
                  {hostel.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-[10px] font-semibold px-2.5 py-0.5 rounded-md bg-surface-deep border border-line/10 text-content-muted">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}