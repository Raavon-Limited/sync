/**
 * ROUTE: /around
 * ACCESS: public (the "home hub of the full Sync app" per the hi-fi guide)
 * PURPOSE: Personalised feed surfacing what matters around the student's
 *          hostel right now - events, food, laundry, hotspots, hostel
 *          board posts, MTN sponsored slot, and a hostel-resume nudge.
 * BUILT HERE (per section 02 Around you · Home Hub of the hi-fi PDF):
 *   - Eyebrow date + verified-spots pill
 *   - Personalised hero "Hi Aisha - today in your radius."
 *   - QUICK STATS block (3 rooms left / 240 going / 28 min)
 *   - Full-width segmented search (SEARCH / MODULE / BUDGET / WHEN)
 *   - 3-column mosaic: Featured event / food + sponsored / laundry + hotspots
 *   - Bottom: hostel board + resume booking
 * DATA: real Supabase queries. Numbers that have no rows behind them yet render
 *       as an explicit ZERO rather than a mock value - see QuickStats. A
 *       fabricated "240 students going" on a public feed is a claim we can't
 *       back, and it survives into production looking exactly like real data.
 */
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowRight, ChevronDown, Plus, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AroundMap } from '@/components/shared/around-map';
import {
  HOSTEL_BOARD,
  HOTSPOTS_TRENDING,
  LAUNDRY_PROMO,
  MOCK_USER,
  SPONSORED_SLOT,
} from '@/mock/around';
import { getCurrentUser, getFirstName } from '@/modules/auth/queries';
import { countVerifiedHostels } from '@/modules/hostels/server-queries';
import { countGoingTonight } from '@/modules/events/server-queries';
import {
  countRoomsAvailable,
  getResumeBooking,
  listMapPins,
  type ResumeBooking,
} from '@/modules/around/server-queries';
import { ScopeBlurb, ScopeHeadline, ScopeSuffix } from './location-scope';
import { formatKobo, formatNaira } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { FeaturedEventCarousel, FoodCarousel } from './featured-carousels';

export const metadata = {
  title: 'Around you',
  description: 'Events, food, laundry, hotspots - everything around your hostel, in one place.',
};

export default async function AroundPage() {
  // Personalise only when signed in; signed-out visitors see a generic greeting.
  // Every read is independent, so fire them together rather than in series.
  const [user, verifiedSpots, mapPins, roomsAvailable, goingTonight, resume] = await Promise.all([
    getCurrentUser(),
    countVerifiedHostels(),
    listMapPins(),
    countRoomsAvailable(),
    countGoingTonight(),
    getResumeBooking(),
  ]);
  const firstName = getFirstName(user);

  const today = new Date();
  const dateLine = `${format(today, 'EEE').toUpperCase()} · ${format(today, 'MMM d').toUpperCase()} · ${MOCK_USER.campus.toUpperCase()}`;

  return (
    <main className="mx-auto flex max-w-7xl flex-col px-6 pt-8 pb-12">
      {/* ─── Eyebrow row ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-content-muted font-mono text-[11px] tracking-wider">{dateLine}</p>
        <span className="bg-lime text-ink inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
          <span className="bg-lime-deep h-1.5 w-1.5 rounded-full" />
          {verifiedSpots} verified spots <ScopeSuffix />
        </span>
      </div>

      {/* ─── Hero + Quick stats ─────────────────────────────────────── */}
      <header className="mt-6 grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-end">
        <div>
          <h1 className="font-display text-[44px] leading-[0.98] font-bold tracking-[-0.035em] md:text-[64px] md:leading-[0.96] md:tracking-[-0.04em]">
            {firstName ? (
              <>
                Hi <span className="text-accent-fg italic">{firstName}</span>
                <span className="text-foreground"> - today</span>
              </>
            ) : (
              <span className="text-foreground">Today</span>
            )}
            <br />
            in{' '}
            <span className="bg-lime text-ink box-decoration-clone px-1.5 leading-[1.1]">
              <ScopeHeadline />
            </span>
            .
          </h1>
          <p className="text-content-muted text-lead mt-4 max-w-2xl">
            <ScopeBlurb />
          </p>
        </div>
        <QuickStats roomsAvailable={roomsAvailable} goingTonight={goingTonight} />
      </header>

      {/* ─── Smart search row ───────────────────────────────────────── */}
      <SmartSearch />

      {/* ─── Map - full width at the top ────────────────────────────── */}
      <section aria-labelledby="around-map-heading" className="mt-8 w-full">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-content-muted">On the map</p>
            <h2 id="around-map-heading" className="font-display text-section text-foreground mt-1">
              Everything <ScopeSuffix />
            </h2>
          </div>
          <p className="text-content-muted text-xs">Tap a pin · distances</p>
        </div>
        <AroundMap pins={mapPins} />
      </section>

      {/* ─── Feed - below the map ───────────────────────────────────── */}
      <div className="mt-10 grid items-start gap-5 sm:grid-cols-2">
        <FeaturedEventCarousel />
        <FoodCarousel />
        <LaundryCard />
        <SponsoredCard />
        <HotspotsCard />
        <HostelBoardCard />
        {/* Only for someone who actually has an unfinished booking. This used to
            render a fixed mock hostel for everyone, including signed-out
            visitors who had never booked anything. */}
        {resume && <ResumeBookingCard booking={resume} />}
      </div>
    </main>
  );
}

/* ──────────────────── Subcomponents ──────────────────────────────── */

/**
 * The three headline numbers, all derived from real rows.
 *
 * A stat with nothing behind it shows 0 and dims, rather than borrowing a
 * plausible-looking mock figure. Delivery time has no source at all yet - there
 * is no orders-timing table - so it is explicitly marked pending instead of
 * being invented.
 */
function QuickStats({
  roomsAvailable,
  goingTonight,
}: {
  roomsAvailable: number;
  goingTonight: number;
}) {
  const stats = [
    { value: roomsAvailable, label: 'rooms available', accent: roomsAvailable > 0 },
    { value: goingTonight, label: 'students going tonight' },
    // No delivery-time data exists yet. Shown as a dash, not a number.
    { value: null, label: 'avg delivery time' },
  ];

  return (
    <aside aria-label="Quick stats" className="flex flex-col gap-3">
      <p className="eyebrow text-content-muted">Quick stats</p>
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => {
          const empty = s.value === null || s.value === 0;
          return (
            <div
              key={s.label}
              className={cn(
                'border-line/5 bg-panel/70 flex flex-col gap-1.5 rounded-xl border p-4 text-center',
                empty && 'opacity-60',
              )}
            >
              <p
                className={cn(
                  'font-display text-[28px] leading-none tracking-tight whitespace-nowrap',
                  s.accent ? 'text-accent-fg' : 'text-foreground',
                )}
              >
                {s.value ?? '—'}
              </p>
              <p className="text-content-muted text-[11px] leading-tight">{s.label}</p>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function SmartSearch() {
  return (
    <form
      action="/search"
      method="get"
      className="border-line/10 bg-panel mt-8 grid overflow-hidden rounded-2xl border md:grid-cols-[2fr_1fr_1fr_1fr_auto]"
    >
      <SearchCell
        label="Search hostels, food, events…"
        name="q"
        placeholder="Try 'jollof, fast wifi, no wahala'"
      />
      {/* Field names must match what /search reads off the URL. They used to be
          `module` and `when`, which that page has no concept of, so those two
          cells were submitted and then silently discarded. */}
      <SearchCell label="Area" name="area" placeholder="Any area" />
      <SearchCell label="Budget" name="budget" placeholder="₦ Any" />
      <SearchCell label="Room type" name="roomType" placeholder="Any" />
      <div className="bg-surface-deep/50 flex items-center p-2 md:bg-transparent">
        <Button type="submit" size="md" className="w-full md:w-auto">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </div>
    </form>
  );
}

function SearchCell({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const id = `as-${name}`;
  return (
    <label
      htmlFor={id}
      className="border-line/5 focus-within:bg-surface/40 flex cursor-text flex-col gap-1 border-r px-4 py-3 transition-colors last:border-r-0"
    >
      <span className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
        {label}
      </span>
      <input
        id={id}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="text-foreground placeholder:text-content-muted bg-transparent text-sm font-medium outline-none"
      />
    </label>
  );
}

function LaundryCard({ className }: { className?: string }) {
  return (
    <article
      className={cn(
        'bg-surface-deep flex flex-col justify-between gap-5 rounded-2xl p-5',
        className,
      )}
    >
      <div>
        <p className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
          Laundry · Pickup today
        </p>
        <h3 className="font-display text-foreground mt-3 text-[22px] leading-tight font-semibold tracking-[-0.02em]">
          {LAUNDRY_PROMO.headlineParts.lead}
          <br />
          {LAUNDRY_PROMO.headlineParts.tail}{' '}
          <span className="text-accent-fg italic">{LAUNDRY_PROMO.headlineParts.accent}</span>
        </h3>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className="bg-panel text-foreground rounded-full px-3 py-1 text-xs">
            {formatNaira(LAUNDRY_PROMO.perPiecePrice)} / piece
          </span>
          <span className="bg-panel text-foreground rounded-full px-3 py-1 text-xs">
            {LAUNDRY_PROMO.pickupLine}
          </span>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-content-muted text-xs">Next slot · {LAUNDRY_PROMO.nextSlot}</p>
        <Button asChild size="sm">
          <Link href="/laundry">
            Schedule <ArrowRight />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function SponsoredCard({ className }: { className?: string }) {
  return (
    <article className={cn('bg-ink text-cream flex flex-col gap-4 rounded-2xl p-5', className)}>
      <header className="flex items-center justify-between">
        <span className="text-cream/50 font-mono text-[10px] tracking-wider uppercase">
          Sponsored
        </span>
        <span className="bg-surface text-foreground rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider">
          {SPONSORED_SLOT.brand}
        </span>
      </header>
      <h3 className="font-display text-[22px] leading-tight font-semibold tracking-[-0.02em]">
        <span className="text-lime italic">{SPONSORED_SLOT.headlineLead}</span>
        <br />
        {SPONSORED_SLOT.headlineTail.split(/(Saturday\.)/).map((part, i) =>
          part === 'Saturday.' ? (
            <span key={i} className="text-lime italic">
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </h3>
      <p className="text-cream/70 text-xs">{SPONSORED_SLOT.body}</p>
      <Button asChild variant="primary" size="sm" className="mt-auto self-start">
        <Link href={SPONSORED_SLOT.ctaHref}>
          {SPONSORED_SLOT.ctaLabel} <ArrowRight />
        </Link>
      </Button>
    </article>
  );
}

function HotspotsCard({ className }: { className?: string }) {
  return (
    <article className={cn('bg-panel shadow-card flex flex-col gap-3 rounded-2xl p-5', className)}>
      <header className="flex items-center justify-between">
        <p className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
          Hot spots · {HOTSPOTS_TRENDING.length} trending
        </p>
        <span aria-hidden="true" className="text-[14px]">
          🔥
        </span>
      </header>
      <ul className="divide-line/5 -mx-1 divide-y">
        {HOTSPOTS_TRENDING.map((h) => (
          <li key={h.slug}>
            <Link
              href={`/hotspots/${h.slug}`}
              className="hover:bg-ink/[0.02] flex items-center justify-between gap-3 rounded-md px-1 py-3"
            >
              <div className="min-w-0">
                <p className="text-foreground truncate text-sm font-medium">{h.name}</p>
                <p className="text-content-muted truncate text-xs">{h.meta}</p>
              </div>
              <span className="bg-lime text-ink inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                <span className="bg-lime-deep h-1 w-1 rounded-full" />
                {h.hereCount} here
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

function HostelBoardCard({ className }: { className?: string }) {
  return (
    <article className={cn('bg-panel shadow-card flex flex-col gap-3 rounded-2xl p-5', className)}>
      <header className="flex items-center justify-between">
        <p className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
          Hostel board · {HOSTEL_BOARD.hostel}
        </p>
        <button
          type="button"
          aria-label="New post"
          className="text-content-muted hover:text-foreground hover:bg-ink/5 inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </header>
      <ul className="divide-line/5 -mx-1 divide-y">
        {HOSTEL_BOARD.posts.map((p) => (
          <li key={p.id}>
            <Link
              href="/me/messages"
              className="hover:bg-ink/[0.02] flex items-center justify-between gap-3 rounded-md px-1 py-3"
            >
              <p className="text-foreground truncate text-sm">{p.title}</p>
              <p className="text-content-muted shrink-0 text-xs">
                {p.author} · {p.age}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

function ResumeBookingCard({
  booking,
  className,
}: {
  booking: ResumeBooking;
  className?: string;
}) {
  return (
    <article
      className={cn(
        'border-line/10 bg-panel flex flex-col gap-4 rounded-2xl border border-dashed p-5',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="bg-lime text-ink inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium">
          <ChevronDown className="h-3 w-3 -rotate-90" />
          Resume
        </span>
        <span className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
          Hostels
        </span>
      </div>
      <h3 className="font-display text-card text-foreground">
        Still searching for a <span className="text-accent-fg italic">hostel?</span>
      </h3>
      <div className="border-line/5 flex items-center gap-3 rounded-xl border p-3">
        <div className="h-12 w-12 shrink-0 rounded-lg bg-gradient-to-br from-[#caa17a] via-[#a07a52] to-[#5e4530]" />
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-medium">{booking.hostelName}</p>
          <p className="text-content-muted text-xs">
            {booking.roomsLeft} rooms left
            {booking.pricePerSessionKobo != null && (
              // Prices are stored in KOBO; formatKobo does the divide. The old
              // mock held naira, which is why formatNaira was correct there and
              // would be a 100x overstatement here.
              <> · {formatKobo(booking.pricePerSessionKobo)}/session</>
            )}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/hostels/${booking.hostelSlug}`}>
            <Users className="hidden h-3.5 w-3.5 sm:inline" />
            Resume
          </Link>
        </Button>
      </div>
    </article>
  );
}
