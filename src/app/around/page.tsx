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
 * DATA: real, from ./around-data. The hostel-board card is gone: there is no
 *       posts table of any kind behind it, and inventing one to fill a card
 *       would make a small social network the biggest feature on this page.
 * DEV-ONLY 5s delay below so the BrandLoader stays on screen.
 */
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowRight, ChevronDown, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AroundMap } from '@/components/shared/around-map';
import { SITE } from '@/config/site';
import { getAroundData, type AroundData } from './around-data';
import { getCurrentUser, getFirstName } from '@/modules/auth/queries';
import { formatNaira } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { FeaturedEventCarousel, FoodCarousel } from './featured-carousels';
import { CampusPulse } from './(components)/campus-pulse';

export const metadata = {
  title: 'Around you',
  description: 'Events, food, laundry, hotspots - everything around your hostel, in one place.',
};

// DEV ONLY - artificial delay so the BrandLoader stays visible.
const DEV_LOADER_DELAY_MS = 5000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function AroundPage() {
  if (process.env.NODE_ENV !== 'production') await sleep(DEV_LOADER_DELAY_MS);

  // Personalise only when signed in; signed-out visitors see a generic greeting.
  const user = await getCurrentUser();
  const firstName = getFirstName(user);
  const data = await getAroundData(user?.id);

  const today = new Date();
  // The campus was a hardcoded string on a mock user. It is the same campus
  // for everyone using this build, so it lives in site config rather than
  // pretending to be personal data.
  const dateLine = `${format(today, 'EEE').toUpperCase()} · ${format(today, 'MMM d').toUpperCase()} · ${SITE.launchMarket.toUpperCase()}`;

  return (
    <main className="mx-auto flex max-w-7xl flex-col px-6 pt-8 pb-12">
      {/* ─── Eyebrow row ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-content-muted font-mono text-[11px] tracking-wider">{dateLine}</p>
        <span className="bg-lime text-ink inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
          <span className="bg-lime-deep h-1.5 w-1.5 rounded-full" />
          {data.verifiedSpots} verified spots near you
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
              your radius
            </span>
            .
          </h1>
          <p className="text-content-muted text-lead mt-4 max-w-2xl">
            Tonight&rsquo;s events, food near your hostel, who&rsquo;s free for braids, the plumber
            4 minutes away. Everything Sync, in one place.
          </p>
        </div>
        <QuickStats stats={data.quickStats} />
      </header>

      {/* ─── Smart search row ───────────────────────────────────────── */}
      <SmartSearch />

      {/* ─── Map - full width at the top ────────────────────────────── */}
      <section aria-labelledby="around-map-heading" className="mt-8 w-full">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-content-muted">On the map</p>
            <h2 id="around-map-heading" className="font-display text-section text-foreground mt-1">
              Everything within your radius
            </h2>
          </div>
          <p className="text-content-muted text-xs">Tap a pin · distances</p>
        </div>
        <AroundMap />
      </section>

      {/* ─── Feed - below the map ───────────────────────────────────── */}
      <div className="mt-10 grid items-start gap-5 sm:grid-cols-2">
        <FeaturedEventCarousel />
        <FoodCarousel />
        {data.laundry && <LaundryCard laundry={data.laundry} />}
        {/* No live banner means no advert. An empty ad slot is honest; a
            hardcoded one is an advert nobody sold. */}
        {data.sponsored && <SponsoredCard sponsored={data.sponsored} />}
        {data.hotspots.length > 0 && <HotspotsCard hotspots={data.hotspots} />}
        {/* HostelBoardCard removed - see the header note. */}
        {data.resumeBooking && <ResumeBookingCard booking={data.resumeBooking} />}
      </div>

      {/* The rest of this page is about the student's own radius. This is the
          other locations: where else on campus is busy, what is open there,
          and what people are actually buying. Real data, unlike its
          neighbours above. */}
      <div className="mt-10">
        <CampusPulse />
      </div>
    </main>
  );
}

/* ──────────────────── Subcomponents ──────────────────────────────── */

function QuickStats({ stats }: { stats: AroundData['quickStats'] }) {
  return (
    <aside aria-label="Quick stats" className="flex flex-col gap-3">
      <p className="eyebrow text-content-muted">Quick stats</p>
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="border-line/5 bg-panel/70 flex flex-col text-center gap-1.5 rounded-xl border p-4"
          >
            <p
              className={cn(
                'font-display text-[28px] leading-none tracking-tight whitespace-nowrap',
                s.accent ? 'text-accent-fg' : 'text-foreground',
              )}
            >
              {s.value}
            </p>
            <p className="text-content-muted text-[11px] leading-tight">{s.label}</p>
          </div>
        ))}
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
      <SearchCell label="Module" name="module" defaultValue="All" />
      <SearchCell label="Budget" name="budget" defaultValue="₦ Any" />
      <SearchCell label="When" name="when" defaultValue="Now" />
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

function LaundryCard({
  laundry,
  className,
}: {
  laundry: NonNullable<AroundData['laundry']>;
  className?: string;
}) {
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
          Drop a bag,
          <br />
          get it back{' '}
          <span className="text-accent-fg italic">clean.</span>
        </h3>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className="bg-panel text-foreground rounded-full px-3 py-1 text-xs">
            from {formatNaira(laundry.perPieceNaira)} / piece
          </span>
          <span className="bg-panel text-foreground rounded-full px-3 py-1 text-xs">
            {laundry.vendorName}
          </span>
        </div>
      </div>
      <div className="flex items-end justify-between">
        {/* "Next slot 4pm" needed a booking calendar, which laundry does not
            have — service_requests carries a single scheduled_for, not slots. */}
        <p className="text-content-muted text-xs">Cheapest listed price</p>
        <Button asChild size="sm">
          <Link href={`/laundry/${laundry.slug}`}>
            Schedule <ArrowRight />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function SponsoredCard({
  sponsored,
  className,
}: {
  sponsored: NonNullable<AroundData['sponsored']>;
  className?: string;
}) {
  return (
    <article className={cn('bg-ink text-cream flex flex-col gap-4 rounded-2xl p-5', className)}>
      <header className="flex items-center justify-between">
        <span className="text-cream/50 font-mono text-[10px] tracking-wider uppercase">
          Sponsored
        </span>
        <span className="bg-surface text-foreground rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider">
          {sponsored.brand}
        </span>
      </header>
      {/* The old headline was split on the literal string "Saturday." to
          italicise it. A banner staff write cannot be styled by guessing at
          its wording, so the title carries the emphasis and the subtitle is
          plain. */}
      <h3 className="font-display text-lime text-[22px] leading-tight font-semibold tracking-[-0.02em] italic">
        {sponsored.brand}
      </h3>
      <p className="text-cream/70 text-xs">{sponsored.body}</p>
      <Button asChild variant="primary" size="sm" className="mt-auto self-start">
        <Link href={sponsored.ctaHref}>
          {sponsored.ctaLabel} <ArrowRight />
        </Link>
      </Button>
    </article>
  );
}

function HotspotsCard({
  hotspots,
  className,
}: {
  hotspots: AroundData['hotspots'];
  className?: string;
}) {
  return (
    <article className={cn('bg-panel shadow-card flex flex-col gap-3 rounded-2xl p-5', className)}>
      <header className="flex items-center justify-between">
        <p className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
          Hot spots · {hotspots.length} trending
        </p>
        <span aria-hidden="true" className="text-[14px]">
          🔥
        </span>
      </header>
      <ul className="divide-line/5 -mx-1 divide-y">
        {hotspots.map((h) => (
          <li key={h.slug}>
            <Link
              href={`/hotspots/${h.slug}`}
              className="hover:bg-ink/[0.02] flex items-center justify-between gap-3 rounded-md px-1 py-3"
            >
              <div className="min-w-0">
                <p className="text-foreground truncate text-sm font-medium">{h.name}</p>
                <p className="text-content-muted truncate text-xs">{h.meta}</p>
              </div>
              {/* "84 here now" needed check-ins, and nothing records them.
                  Removed rather than replaced with a plausible number. */}
              <ArrowRight className="text-content-muted size-3.5 shrink-0" />
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
  booking: NonNullable<AroundData['resumeBooking']>;
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
          <p className="text-foreground truncate text-sm font-medium">
            {booking.hostelName}
          </p>
          <p className="text-content-muted text-xs">
            {booking.roomsLeft} rooms left · {formatNaira(booking.priceNaira)}/session
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
