'use client';

import { useMemo, useState, useEffect, Suspense } from 'react';
import { BookViewingDialog } from '@/components/hostels/book-viewing-dialog';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, KeyRound, MessageCircle, X } from 'lucide-react';
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
  awaiting_payment: 'Accepted, pay to confirm',
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
        className={`border-lime/40 bg-lime/15 text-accent-fg rounded-full border font-semibold whitespace-nowrap ${
          compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-0.5 text-xs'
        }`}
      >
        <Check className="inline size-3.5" aria-hidden="true" /> Visited by an agent
      </span>
    );
  }
  return (
    <span
      className={`border-line/20 bg-surface-deep text-content-muted rounded-full border font-semibold whitespace-nowrap ${
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
      <div className="border-line/10 border-b pb-6">
        <div className="border-line/10 bg-panel text-content-muted flex h-48 flex-col items-center justify-center gap-1 rounded-2xl border text-center">
          <p className="text-content text-sm font-semibold">No photos yet</p>
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
    <div className="border-line/10 grid grid-cols-1 gap-2 border-b p-0 pb-6 md:grid-cols-4">
      <div
        className={`border-line/10 group relative h-64 overflow-hidden rounded-2xl border ${
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
        <div className="hidden grid-cols-2 content-start gap-2 md:col-span-2 md:grid">
          {side.map((url, i) => {
            const isLast = i === side.length - 1 && hidden > 0;
            return (
              <div
                key={url}
                className={`relative h-31 overflow-hidden rounded-2xl border ${
                  isLast ? 'border-lime/40' : 'border-line/10'
                }`}
              >
                <Image
                  src={url}
                  alt={`${hostel.name}, photo ${i + 2}`}
                  fill
                  sizes="25vw"
                  className="object-cover"
                />
                {isLast && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                    <span className="text-accent-fg text-sm font-bold">+{hidden} more</span>
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
    cls: 'bg-lime/15 border-lime/40 text-accent-fg',
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
  useScrollLock(showModal);

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
    setShowScheduleModal(false);
    setShowModal(false);
    setBookingError(null);
    // The viewing form's own fields are reset by the dialog unmounting with the
    // listing, so there is nothing left to clear here.
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

  // handleScheduleSubmit IS GONE, AND IT IS WORTH SAYING WHAT IT DID.
  //
  // It called preventDefault, set a spinner, waited 1000ms on a setTimeout,
  // closed the modal and popped an alert() reading "Inspection request sent...
  // An agent will call to confirm a time." No row was inserted into
  // hostel_inspections and no fee was charged, so no agent could ever see it -
  // `open_inspection_board` lists inspections that are 'scheduled' with no
  // agent yet, and only payment sets 'scheduled'. Every student who filled that
  // form was told to expect a call that nothing had asked anybody to make.
  //
  // BookViewingDialog does the two real steps in order: insert the row, then
  // charge the fee that puts it on the board.

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

        const matchesFilter = active === 'all' ? true : hostel.type === active;

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
      <main className="animate-in fade-in relative min-h-screen text-current transition-colors duration-300 duration-500">
        {/*
          THE REQUEST, CONFIRMED BEFORE IT IS SENT.

          What this replaces claimed the room "has been locked exclusively for
          your profile account token" and started a 24-hour countdown against
          nothing: no booking row was created anywhere on this screen. The
          sequence the database actually implements is request -> the landlord
          accepts -> the hold begins, and this now says that and then does it.
        */}
        {showModal && (
          <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md duration-200">
            <div className="animate-in zoom-in-95 w-full max-w-md space-y-5 rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-center shadow-2xl duration-300 md:p-8">
              <div className="border-lime/40 bg-lime/15 text-accent-fg mx-auto flex h-12 w-12 items-center justify-center rounded-full border text-xl">
                <KeyRound className="size-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xl font-black tracking-tight text-white">
                  Request a room at {selectedHostel.name}?
                </h3>
                <ol className="mt-3 list-inside list-decimal space-y-1.5 text-left text-xs leading-relaxed text-zinc-400">
                  <li>The landlord sees your request and picks you a room.</li>
                  <li>
                    When they accept, that room is held for you for 24 hours and the countdown
                    starts here.
                  </li>
                  <li>You pay within the 24 hours to confirm it.</li>
                </ol>
                <p className="border-lime/30 bg-lime/10 text-accent-fg mt-4 rounded-xl border p-3 text-xs font-semibold">
                  Nothing is charged now, and nothing is charged until you choose to pay.
                </p>
              </div>

              {bookingError && (
                <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-left text-xs text-rose-400">
                  {bookingError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={book.isPending}
                  className="flex-1 rounded-xl border border-zinc-800 py-3 text-xs font-bold text-zinc-300 transition-all hover:text-white disabled:opacity-50"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={requestRoom}
                  disabled={book.isPending}
                  className="bg-sunflower text-forest hover:bg-sunflower/85 disabled:bg-surface-deep disabled:text-content-muted flex-2 rounded-xl py-3 text-xs font-extrabold tracking-wider uppercase transition-all"
                >
                  {book.isPending ? 'Sending…' : 'Send request'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== BOOK A VIEWING ====================
            The hand-rolled modal that used to live here is replaced by the
            shared dialog, which is the same one /user/bookings opens. One
            booking path means the fee, the copy and the payment step cannot
            drift between the two places a student can start a visit from. */}
        <BookViewingDialog
          open={showScheduleModal}
          onOpenChange={setShowScheduleModal}
          hostelId={selectedHostel.id}
          hostelName={selectedHostel.name}
          feeKobo={selectedHostel.inspectionFeeKobo}
        />

        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
          {/* Top Navigation Bar */}
          <div className="border-line/10 mb-6 flex items-center justify-between border-b pb-4">
            <button
              type="button"
              onClick={() => setSelectedHostel(null)}
              className="group text-content-muted hover:text-accent-fg flex items-center gap-2 text-sm font-semibold transition-colors"
            >
              <svg
                className="h-5 w-5 transform transition-transform group-hover:-translate-x-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to hostels
            </button>
            <ThemeToggle />
          </div>

          {/* Core Content Shell */}
          <div className="overflow-hidden rounded-3xl bg-transparent">
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
            <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-12">
              {/* Left Column Structural Details */}
              <div className="space-y-8 lg:col-span-7">
                <div>
                  <div className="mb-4 flex flex-wrap gap-2">
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
                    <span
                      className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${STATUS_MAP[selectedHostel.status].cls}`}
                    >
                      {STATUS_MAP[selectedHostel.status].label}
                    </span>
                    <span className="border-line/10 bg-panel text-content-muted rounded-full border px-3 py-0.5 font-mono text-xs">
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
                  <div className="text-content-muted mt-3 flex flex-wrap items-center gap-3 text-sm">
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
                  <div className="border-line/10 border-t border-dashed pt-6">
                    <h3 className="text-content-muted mb-2 text-xs font-bold tracking-widest uppercase">
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
                    <p className="text-content-muted text-sm leading-relaxed whitespace-pre-line">
                      {selectedHostel.description}
                    </p>
                  </div>
                )}

                {/* The amenities the landlord actually ticked. */}
                <div>
                  <h3 className="text-content-muted mb-3 text-xs font-bold tracking-widest uppercase">
                    What this place has
                  </h3>
                  {selectedHostel.tags.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {selectedHostel.tags.map((facility) => (
                        <div
                          key={facility}
                          className="border-line/10 bg-panel flex items-center gap-2 rounded-xl border p-2.5 text-xs"
                        >
                          <Check className="text-accent-fg size-3.5 shrink-0" aria-hidden="true" />
                          <span className="text-content font-medium">{facility}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-content-muted text-sm">
                      The landlord has not listed any amenities yet. Ask them before you book.
                    </p>
                  )}
                </div>

                {selectedHostel.houseRules.length > 0 && (
                  <div>
                    <h3 className="text-content-muted mb-3 text-xs font-bold tracking-widest uppercase">
                      House rules
                    </h3>
                    <ul className="text-content-muted space-y-1.5 text-sm">
                      {selectedHostel.houseRules.map((rule) => (
                        <li key={rule} className="flex gap-2">
                          <span aria-hidden="true" className="text-content-muted">
                            –
                          </span>
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="border-line/10 border-t border-dashed pt-6">
                  <h3 className="text-content-muted mb-3 text-xs font-bold tracking-widest uppercase">
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
              <div className="space-y-4 lg:col-span-5">
                <div className="border-line/10 bg-panel relative overflow-hidden rounded-2xl border p-6 shadow-xl">
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
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <p className="text-content-muted text-[10px] font-bold tracking-wider uppercase">
                        Rent per session
                      </p>
                      <h2 className="mt-1 font-mono text-4xl font-black text-current">
                        {naira(quote.rentKobo)}
                      </h2>
                    </div>
                    <span className="border-lime/30 bg-lime/15 text-accent-fg rounded-md border px-2.5 py-1 text-xs font-semibold">
                      Per session
                    </span>
                  </div>

                  <div className="border-line/10 text-content-muted mb-4 space-y-2 border-b border-dashed pb-4 text-xs">
                    <div className="flex justify-between">
                      <span>Rent, one academic session</span>
                      <span className="text-content font-mono">{naira(quote.rentKobo)}</span>
                    </div>
                    {quote.feeMode === 'pass_on' ? (
                      <div className="flex justify-between">
                        <span>Sync service fee (2.5%)</span>
                        <span className="text-content font-mono">+ {naira(quote.feeKobo)}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between">
                        <span>Sync service fee</span>
                        <span className="text-content-muted font-mono">Included</span>
                      </div>
                    )}
                  </div>

                  <div className="mb-2 flex items-center justify-between text-sm font-bold text-current">
                    <span>Total to pay</span>
                    <span className="text-accent-fg font-mono text-xl">
                      {naira(quote.totalKobo)}
                    </span>
                  </div>

                  {/*
                    Said here, next to the total, because "is there anything
                    else?" is the question this card exists to answer. The
                    inspection fee is real and is a genuine cost - it is simply
                    not part of this number unless the student chooses a visit.
                  */}
                  <p className="text-content-muted mb-6 text-[11px] leading-relaxed">
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
                        className="bg-sunflower text-forest hover:bg-sunflower/85 flex w-full items-center justify-center rounded-xl py-3.5 text-xs font-extrabold tracking-wider uppercase shadow-lg transition-all active:scale-95"
                      >
                        Sign in to request a room
                      </Link>
                    ) : bookingForSelected ? (
                      <div className="space-y-2">
                        <div className="border-line/10 bg-surface-deep space-y-1 rounded-xl border p-4">
                          <p className="text-content-muted text-[10px] font-bold tracking-widest uppercase">
                            Your request
                          </p>
                          <p className="text-content text-sm font-bold">
                            {BOOKING_LABEL[bookingForSelected.status] ?? bookingForSelected.status}
                          </p>
                          {bookingForSelected.roomLabel && (
                            <p className="text-content-muted text-[11px]">
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
                          <div className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-center">
                            <p className="text-[10px] font-bold tracking-widest text-amber-400 uppercase">
                              Held for you, pay within
                            </p>
                            <h4 className="font-mono text-2xl font-black tracking-wider text-amber-400">
                              {formatCountdown(holdEndsAt - nowMs)}
                            </h4>
                          </div>
                        )}
                        {holdEndsAt != null && !counting && (
                          <p className="text-center text-[11px] text-rose-400">
                            That hold has expired. Ask the landlord to re-open it.
                          </p>
                        )}

                        <div className="grid grid-cols-5 gap-2">
                          <Link
                            href="/user/bookings"
                            className="bg-surface-deep border-line/10 text-content hover:text-accent-fg col-span-3 flex flex-col justify-center rounded-xl border p-3 transition-colors"
                          >
                            <span className="text-content-muted block text-[9px] uppercase">
                              Manage
                            </span>
                            <span className="text-[11px] font-bold">Go to my bookings</span>
                          </Link>

                          {/*
                            THE REAL INBOX, not a panel on this page.

                            This used to toggle an inline pane seeded with
                            "Hello! I am the manager for this listing" and a
                            canned reply on a 1.2s timer. Nobody was on the
                            other end. A student could type a question about
                            deposits, watch it be answered, and never reach
                            the landlord at all.

                            `conversations` already supports a booking thread
                            (kind='booking'), and the Inbox is the one place
                            messaging lives. Sending them there is the honest
                            version of this button.
                          */}
                          <Link
                            href="/user/messages"
                            className="border-line/10 bg-surface-deep text-content hover:bg-panel col-span-2 flex flex-col items-center justify-center gap-1 rounded-xl border text-xs font-bold transition-all"
                          >
                            <MessageCircle className="size-4" aria-hidden="true" />
                            <span>Message the landlord</span>
                          </Link>
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
                                  {r.priceKobo ? `  ${naira(r.priceKobo)}` : ''}
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
                          className="disabled:bg-surface-deep disabled:text-content-muted bg-sunflower text-forest hover:bg-sunflower/85 w-full rounded-xl py-3.5 text-xs font-extrabold tracking-wider uppercase shadow-lg transition-all active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100"
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
                      className="border-line/10 text-content hover:bg-surface-deep hover:text-accent-fg w-full rounded-xl border py-3 text-xs font-bold transition-all active:scale-98"
                    >
                      Book a visit ({naira(selectedHostel.inspectionFeeKobo)}) is optional
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* OTHER LISTINGS SIT BELOW THE DETAIL, not above it.
              A strip of rival hostels between the back button and the one you
              actually opened pushed the content down and invited you to leave
              before reading any of it. Suggestions belong after the thing they
              are alternatives to.

              The empty case is still hidden: a row headed "Other hostels" with
              nothing in it is a control with no controls. */}
        {remainingHostels.length > 0 && (
          <div className="border-line/10 bg-panel mt-8 flex flex-col justify-between gap-4 rounded-2xl border p-4 md:flex-row md:items-center">
            <div className="space-y-1">
              <span className="text-content-muted text-[10px] font-bold tracking-wider uppercase">
                Other hostels
              </span>
              <div className="text-content-muted text-xs">
                {remainingHostels.length} more{' '}
                {remainingHostels.length === 1 ? 'listing' : 'listings'} in Malete.
              </div>
            </div>

            <div className="no-scrollbar flex items-center gap-2 overflow-x-auto py-1">
              {remainingHostels.map((hostel) => (
                <button
                  key={hostel.slug}
                  onClick={() => setSelectedHostel(hostel)}
                  type="button"
                  className="border-line/10 hover:border-line/25 bg-surface-deep text-content hover:text-accent-fg rounded-xl border px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all"
                >
                  {hostel.name} · {hostel.roomsLeft === 0 ? 'full' : `${hostel.roomsLeft} free`}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    );
  }

  /* ==================== SCREEN 1: COMPREHENSIVE DIRECTORY LIST VIEW ==================== */
  return (
    <main className="animate-in fade-in min-h-screen text-current transition-colors duration-300 duration-500">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        {/* Hero Section */}
        <section className="mb-10">
          <h1 className="font-display text-4xl leading-tight font-extrabold tracking-tight text-current md:text-5xl lg:text-6xl">
            Find your{' '}
            <span className="text-accent-fg block font-normal italic md:inline">
              perfect hostel.
            </span>
          </h1>
          <p className="text-content-muted mt-4 max-w-2xl text-sm md:text-base">
            Off-campus rooms around Malete, listed by their landlords. Filter by layout to find the
            ones you can actually live in.
          </p>

          {/*
            TWO TILES, BOTH COMPUTED.
            There were three. "Starting Price ₦70,000" was a literal that had
            nothing to do with the listings underneath it - the cheapest room on
            screen was ₦250,000 - and "System Quality 4.6 ★" was an average of a
            reviews table that does not exist. A number nobody can trace is worse
            than an empty space where a number would go.
          */}
          <div className="mt-8 grid max-w-md grid-cols-2 gap-3">
            <div className="bg-panel border-line/10 rounded-2xl border p-4">
              <p className="text-content-muted text-xs font-medium">Listings</p>
              <h3 className="text-content mt-1 text-2xl font-bold">{totalHostelsCount}</h3>
            </div>
            <div className="bg-panel border-line/10 rounded-2xl border p-4">
              <p className="text-content-muted text-xs font-medium">From</p>
              <h3 className="text-content mt-1 text-2xl font-bold">
                {cheapestKobo == null ? '-' : naira(cheapestKobo)}
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
            className="text-content-muted pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
            />
          </svg>
          <input
            id="hostel-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, area or amenity: “Safari”, “Wi-Fi”…"
            className="border-line/10 bg-panel text-content placeholder:text-content-muted focus:border-lime h-12 w-full rounded-2xl border pr-11 pl-11 text-sm transition-colors outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-content-muted hover:text-content absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1.5 transition-colors"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Layout Filter Row Pills */}
        <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto scroll-smooth pb-2">
          {FILTERS.map((filter) => {
            const isSelected = active === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setActive(filter.value)}
                className={`transform rounded-full border px-5 py-2 text-sm font-medium whitespace-nowrap transition-all duration-200 active:scale-95 ${
                  isSelected
                    ? 'border-zinc-100 bg-zinc-100 text-black shadow-sm'
                    : 'bg-panel text-content-muted border-line/10 hover:bg-surface-deep'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div className="mb-4">
          <p className="text-content-muted text-xs font-bold tracking-wider uppercase">
            {hostelsLoading
              ? 'Loading hostels…'
              : `Showing ${visible.length} of ${totalHostelsCount}`}
          </p>
        </div>

        {/* Hostels Directory Cards Block Grid Layout */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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
                    className="border-line/10 bg-panel text-content hover:text-accent-fg rounded-full border px-4 py-2 text-xs font-semibold transition-colors"
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
              className="group border-line/10 bg-panel hover:border-line/15 flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl border text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl focus:outline-none"
            >
              <div className="border-line/10 relative h-44 w-full overflow-hidden border-b">
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
                  <span className="absolute top-4 left-4 z-10 rounded border border-zinc-700 bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                    No photo yet
                  </span>
                )}
                <span
                  className={`absolute top-4 right-4 z-10 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur-xs ${STATUS_MAP[hostel.status].cls}`}
                >
                  {STATUS_MAP[hostel.status].label}
                </span>
                <span className="absolute bottom-3 left-4 z-10 rounded border border-zinc-800 bg-black/60 px-2 py-0.5 font-mono text-[10px] tracking-wider text-zinc-300 uppercase">
                  {hostel.type}
                </span>
              </div>

              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="group-hover:text-accent-fg text-lg font-bold text-current transition-colors">
                        {hostel.name}
                      </h3>
                      <p className="text-content-muted mt-1 flex items-center gap-1 text-xs">
                        <svg
                          className="h-3.5 w-3.5 opacity-60"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
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
                  <div className="border-line/10 bg-surface-deep mt-3 flex items-center justify-between rounded-xl border p-2 font-mono text-[11px]">
                    <span className="text-content-muted">Rooms</span>
                    <span className="text-content font-bold">{hostel.totalRooms} total</span>
                    <span className="text-content-muted">|</span>
                    <span
                      className={`${hostel.roomsLeft === 0 ? 'font-black text-rose-400' : 'text-accent-fg font-black'}`}
                    >
                      {hostel.roomsLeft === 0 ? 'FULLY BOOKED' : `${hostel.roomsLeft} FREE`}
                    </span>
                  </div>

                  <div className="mt-4">
                    <p className="font-mono text-2xl font-black tracking-tight text-current">
                      {naira(rentQuote(hostel.rentKobo, hostel.feeMode).totalKobo)}
                    </p>
                    <span className="text-content-muted text-[11px] font-medium">
                      per session
                      {hostel.feeMode === 'pass_on' ? ', service fee included' : ''}
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-1">
                  {hostel.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="bg-surface-deep border-line/10 text-content-muted rounded-md border px-2.5 py-0.5 text-[10px] font-semibold"
                    >
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
