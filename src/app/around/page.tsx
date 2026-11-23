/**
 * ROUTE: /around
 * ACCESS: public (the "home hub of the full Sync app" per the hi-fi guide)
 * PURPOSE: Personalised feed surfacing what matters around the student's
 *          hostel right now - events, food, laundry, hotspots, hostel
 *          board posts, MTN sponsored slot, and a hostel-resume nudge.
 * BUILT HERE (per section 02 Around you · Home Hub of the hi-fi PDF):
 *   - AroundBento at the top (Nov 2026 redesign, shared with the landing):
 *     weather and plans, the public gist feed, the campus poll, daily dose,
 *     guides. It replaced the date pill, greeting hero, quick stats and the
 *     segmented search.
 *   - The map (#map), kept.
 *   - 3-column mosaic: Featured event / food + sponsored / laundry + hotspots
 *   - Bottom: hostel board + resume booking
 * DATA: real, from ./around-data. The hostel-board card is gone: there is no
 *       posts table of any kind behind it, and inventing one to fill a card
 *       would make a small social network the biggest feature on this page.
 *       Map pins come from listMapPins() instead, because the map is Google
 *       (server-fed pins) rather than the Leaflet map this page once used.
 * COPY:  the "radius" wording is <Scope*>, not literals - it has to say
 *        "near you" on a GPS fix and name the area when one is picked.
 */
import Link from 'next/link';
import { ArrowRight, ChevronDown, Flame, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AroundMap } from '@/components/shared/around-map';
import { getAroundData, type AroundData } from './around-data';
import { listMapPins } from '@/modules/around/server-queries';
import { getCurrentUser } from '@/modules/auth/queries';
import { formatNaira } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { FeaturedEventCarousel, FoodCarousel } from './featured-carousels';
import { ScopeSuffix } from './location-scope';
import { CampusPulse } from './(components)/campus-pulse';
import { AroundBento } from '@/components/around/around-bento';
import { getCampusWeather } from '@/app/(marketing)/landing-data';
import { CAMPUS_POINT } from '@/lib/constants/areas';

export const metadata = {
  title: 'Around you',
  description: 'Events, food, laundry, hotspots - everything around your hostel, in one place.',
};

export default async function AroundPage() {
  // getAroundData needs the user id, so that one read is sequential; the map
  // pins do not, so they go in parallel rather than adding a third round trip.
  const user = await getCurrentUser();
  const [data, mapPins, weather] = await Promise.all([
    getAroundData(user?.id),
    listMapPins(),
    getCampusWeather(CAMPUS_POINT.lat, CAMPUS_POINT.lng),
  ]);


  return (
    <>
      {/* The same "What's popping" bento as the landing (weather, plans, the
          gist feed, the campus poll, daily dose, guides), so the two never
          drift. `.landing` applies the palette's dark-mode remap. */}
      <div className="landing">
        <AroundBento weather={weather} headingLevel="h1" />
      </div>
      <main className="mx-auto flex max-w-7xl flex-col px-6 pt-8 pb-12">
      {/* ─── Map - full width at the top ────────────────────────────── */}
      <section id="map" aria-labelledby="around-map-heading" className="w-full scroll-mt-20">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-content-muted">On the map</p>
            <h2 id="around-map-heading" className="font-display text-section text-foreground mt-1">
              Everything <ScopeSuffix />
            </h2>
          </div>
          <p className="text-content-muted text-xs">Tap a pin · distances</p>
        </div>
        {/* Full-bleed on mobile: -mx-6 cancels the page gutter so the map runs
            edge to edge, while the heading above keeps its alignment. */}
        <AroundMap className="-mx-6 md:mx-0" pins={mapPins} />
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
          and what people are actually buying.

          SIGNED-IN ONLY, and not by accident. /around is public, but the
          `campus_pulse` RPC revokes execute from `anon` on purpose: its own
          migration explains that aggregates still identify people on a campus
          this small, which is why it suppresses trends below a cohort
          threshold and buckets busyness instead of counting it. Restricting it
          to signed-in students is part of that reasoning, not an oversight -
          so this is gated here rather than "fixed" by widening the grant.

          Rendered unconditionally, it called an RPC it could never be allowed
          to run and printed the raw Postgres denial onto a public page. */}
      <div className="mt-10">
        {user ? (
          <CampusPulse />
        ) : (
          <Link
            href="/login?next=/around"
            className="border-line/10 hover:border-accent-fg/40 text-content-muted flex flex-col gap-1 rounded-xl border border-dashed p-6 text-sm transition-colors"
          >
            <span className="text-foreground font-medium">See what&rsquo;s happening across campus</span>
            <span>
              Which areas are busy, what just opened, what people are ordering. Sign in to
              view it.
            </span>
          </Link>
        )}
      </div>
      </main>
    </>
  );
}

/* ──────────────────── Subcomponents ──────────────────────────────── */




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
            have   service_requests carries a single scheduled_for, not slots. */}
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
        <Flame aria-hidden="true" className="size-3.5 text-orange-500" />
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
