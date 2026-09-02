/**
 * ROUTE: /
 * ACCESS: public
 * PURPOSE: Sync marketing landing - Wireframe Variant A (Classic hero +
 *          overview). Hostel-led positioning since hostels are the primary
 *          acquisition driver. The broader 8-module hub lives inside the
 *          authenticated app.
 * BUILT HERE:
 *   1. Hero with verified-count eyebrow, two-line headline with lime
 *      underline on the action word, and a 1-big-image + 3-thumbnail
 *      preview block. (The smart-search row was removed - the landing page
 *      sends people to Around you rather than filtering hostels inline.)
 *   1b. <LandingAboutTeaser> - condensed brand essay linking into /about.
 *   2. "Hostels students love" - featured rail of 3 <ListingCard>s.
 *   3. "How it works" - 3-step explainer.
 *   4. Verification trust band + landlord CTA.
 *
 * DATA: real, from ./landing-data. Cards hide when there is nothing to show
 *       rather than advertising something that does not exist.
 */
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ListingCard } from '@/components/shared/listing-card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { getCurrentUser } from '@/modules/auth/queries';
import { getMyTestimonial } from '@/modules/testimonials/queries';
import { HeroHeadline } from './hero-headline';
import { HeroHighlights } from './hero-highlights';
import { Newsletter } from './newsletter';
import { ActivityTicker } from './activity-ticker';
import { Testimonials } from './testimonials';
import { Comparison } from './comparison';
import { HowItWorks } from './how-it-works';
import { LandingAboutTeaser } from '@/components/landing/landing-about-teaser';

import { getLandingShowcase } from './landing-data';
import { SITE } from '@/config/site';

const FAQS = [
  {
    q: 'Is every hostel really verified?',
    a: 'Yes. Our team runs an ID check on the landlord, reviews business proof, and visits the property in person before it goes live. The photos you see are taken by us.',
  },
  {
    q: 'How does payment work?',
    a: 'Rent and caution sit in Paystack escrow until you confirm move-in. Our 5% verified-listing fee replaces the 10-20% agents normally charge.',
  },
  {
    q: 'Which campuses are live?',
    a: 'We launched at KWASU, Malete - that is our home base for now, covering Safari, Malete Town, and the areas around the gate. UNILORIN, Al-Hikmah, and Ilorin Poly are next on the roadmap.',
  },
  {
    q: 'Is Sync only for hostels?',
    a: 'No. Hostels are where we started, but Around you brings events, food, laundry, beauty, trades, and hot spots into one feed.',
  },
];

// NOTE: this page carried `export const revalidate = 3600` on the branch, to
// cache the public shop window for an hour. It cannot survive the merge: the
// testimonial block reads the signed-in user, and a page that reads cookies is
// rendered dynamically no matter what `revalidate` says - so the directive
// would have been a comment that looked like a cache. If the showcase read
// becomes expensive, cache THAT call (unstable_cache) rather than the page.

export default async function LandingPage() {
  // All three reads are independent, so fire them together. getMyTestimonial
  // returns null for a signed-out visitor, which the form handles.
  const [user, mine, showcase] = await Promise.all([
    getCurrentUser(),
    getMyTestimonial(),
    getLandingShowcase(),
  ]);


  return (
    <>
      {/* ─── Hero (static background image + 2-column content) ───────── */}
      <section className="relative isolate w-full overflow-hidden">
        <Image
          src="/images/background.jpeg"
          alt=""
          fill
          priority
          sizes="100vw"
          aria-hidden="true"
          className="-z-20 object-cover"
        />
        <div aria-hidden="true" className="bg-surface/55 absolute inset-0 -z-10" />
        {/* `min-w-0` on the grid AND its columns is load-bearing on a phone.
            A grid track's automatic minimum is its content's MIN-CONTENT width,
            so one unbreakable child - the pill below, or a nowrap word in the
            headline - widens the whole track past the viewport. Everything then
            lays out in that too-wide box, which is why the headline stopped
            wrapping and the sub-heading ran off the right edge. */}
        {/* Two columns ONLY when there is something for the second one.
            HeroHighlights renders nothing when no listing has a photo yet -
            correct, since a hero card without an image is a grey box - but in a
            fixed `md:grid-cols-2` that left the headline pinned to the left half
            with a void beside it. The showcase is real data now, so "empty" is
            a normal state on a young market and the layout has to hold up in
            it, not just when the database is full. */}
        <div
          className={cn(
            'mx-auto grid min-h-[72vh] w-full max-w-7xl min-w-0 items-center gap-10 px-6 py-16 md:gap-12',
            showcase.highlights.length > 0 && 'md:grid-cols-2',
          )}
        >
          {/* Left - headline */}
          <div className="min-w-0 text-center md:text-left">
            {/* flex-wrap + wrap-break-word: "412 verified hostels · KWASU,
                Malete" is wider than a 375px screen and must be allowed to
                take two lines rather than set the column's width. */}
            <p className="text-ink bg-lime/90 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full px-3 py-1 text-sm font-medium wrap-break-word">
              <span className="bg-lime-deep h-2 w-2 shrink-0 rounded-full" />
              {showcase.verifiedHostelCount} verified hostels · {SITE.launchMarket}
            </p>
            <HeroHeadline />
            <p className="text-foreground text-lead mx-auto mt-5 max-w-lg font-semibold md:mx-0">
              {SITE.summary}
            </p>
          </div>

          {/* Right - cross-service highlight (shuffles per load) */}
          <HeroHighlights pool={showcase.highlights} />
        </div>
      </section>

      {/* ─── Live activity ticker ────────────────────────────────────── */}
      <ActivityTicker />

      {/* ─── About teaser (condensed brand essay → /about) ───────────── */}
      <LandingAboutTeaser />

      {/* ─── Hostels students love ───────────────────────────────────── */}
      <section className="px-6 pt-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div>
              <p className="eyebrow text-accent-fg">Featured · This week</p>
              <h2 className="font-display text-section text-foreground mt-2 capitalize">
                Hostels students love
              </h2>
            </div>
            <Link
              href="/hostels"
              className="text-foreground hover:text-accent-fg inline-flex shrink-0 items-center gap-1 self-end text-xs whitespace-nowrap sm:self-auto sm:text-sm"
            >
              See all {showcase.verifiedHostelCount} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {showcase.hostels.map((h) => (
              <ListingCard
                key={h.slug}
                href={`/hostels/${h.slug}`}
                title={h.name}
                location={h.location}
                image={h.image}
                price={{ amount: h.pricePerSession, unit: '/ session' }}
                /* No `rating` prop: see landing-data. Zero stars is not the
                   same as no reviews. */
                verified={h.verified}
                ribbon={h.ribbon ?? undefined}
                amenities={h.amenities}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Happening around you (preview) ──────────────────────────── */}
      <section className="px-6 pt-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div>
              <p className="eyebrow text-accent-fg">Around you · right now</p>
              <h2 className="font-display text-section text-foreground mt-2 capitalize">
                More than just a room.
              </h2>
            </div>
            <Link
              href="/around"
              className="text-foreground hover:text-accent-fg inline-flex shrink-0 items-center gap-1 self-end text-xs whitespace-nowrap sm:self-auto sm:text-sm"
            >
              Open Around you <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {/* Event. Hidden when nothing is scheduled   an empty slot is
                better than advertising a party that is not happening. */}
            {showcase.event && (
            <Link
              href={`/events/${showcase.event.slug}`}
              className="bg-ink text-cream group flex flex-col justify-between gap-6 rounded-2xl p-6 transition-transform hover:-translate-y-0.5 dark:border dark:border-dotted dark:border-cream/30"
            >
              <span className="bg-lime text-ink inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
                <span className="bg-ink h-1.5 w-1.5 rounded-full" />
                {showcase.event.when}
              </span>
              <div>
                <p className="text-cream/50 font-mono text-[10px] tracking-wider uppercase">
                  Event
                </p>
                {/* The mock split a title from a "performer" to italicise the
                    act. `events` has no performer column, so the name carries
                    itself rather than being cut at an arbitrary word. */}
                <p className="font-display mt-1 text-xl leading-tight">{showcase.event.title}</p>
                <p className="text-cream/70 mt-1 text-xs">{showcase.event.venue}</p>
              </div>
            </Link>
            )}

            {/* Food */}
            {showcase.food && (
            <Link
              href={`/food/${showcase.food.slug}`}
              className="bg-panel shadow-card group flex flex-col justify-between gap-6 rounded-2xl p-6 transition-transform hover:-translate-y-0.5"
            >
              <span className="border-line/15 text-foreground inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs">
                {/* Was "28 min delivery". Nothing computes an ETA, so the
                    card says what is true: it is open. */}
                Taking orders
              </span>
              <div>
                <p className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
                  Food
                </p>
                <p className="font-display text-foreground mt-1 text-xl leading-tight">
                  {showcase.food.name}
                </p>
                <p className="text-content-muted mt-1 text-xs">
                  {showcase.food.rating !== null && `★ ${showcase.food.rating.toFixed(1)} · `}
                  {showcase.food.meta}
                </p>
              </div>
            </Link>
            )}

            {/* Hot spot */}
            {showcase.hotspot && (
            <Link
              href={`/hotspots/${showcase.hotspot.slug}`}
              className="bg-surface-deep group flex flex-col justify-between gap-6 rounded-2xl p-6 transition-transform hover:-translate-y-0.5"
            >
              <span className="bg-lime text-ink inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
                <span className="bg-lime-deep h-1.5 w-1.5 rounded-full" />
                {/* "84 here" needed check-ins, which nothing records. */}
                Trending
              </span>
              <div>
                <p className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
                  Hot spot
                </p>
                <p className="font-display text-foreground mt-1 text-xl leading-tight">
                  {showcase.hotspot.name}
                </p>
                <p className="text-content-muted mt-1 text-xs">{showcase.hotspot.meta}</p>
              </div>
            </Link>
            )}
          </div>
        </div>
      </section>

      {/* ─── How it works (rotates through hostels / around / food / events) ─ */}
      <HowItWorks />

      {/* ─── Old way vs Sync ─────────────────────────────────────────── */}
      <Comparison />

      {/* ─── Testimonials ────────────────────────────────────────────── */}
      <Testimonials signedIn={Boolean(user)} mine={mine} />

      {/* ─── FAQ ─────────────────────────────────────────────────────── */}
      <section className="px-6 pt-12">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1fr_1.2fr] md:gap-16">
          <div>
            <p className="eyebrow text-accent-fg">FAQ</p>
            <h2 className="font-display text-section text-foreground mt-2 capitalize">Good questions.</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-foreground text-base">{f.q}</AccordionTrigger>
                <AccordionContent className="text-content-muted text-justify text-sm">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ─── Verification trust band ─────────────────────────────────── */}
      <section className="px-6 pt-12">
        <div className="mx-auto max-w-7xl">
          <div className="bg-surface-deep flex flex-col items-start gap-4 rounded-2xl p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <ul className="text-foreground flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
              <li className="inline-flex items-center gap-2">
                <BadgeCheck className="text-accent-fg h-4 w-4" /> Every listing verified
              </li>
              <li className="inline-flex items-center gap-2">
                <ShieldCheck className="text-accent-fg h-4 w-4" /> Photos by our team
              </li>
              <li className="inline-flex items-center gap-2">
                <Sparkles className="text-accent-fg h-4 w-4" /> Pay safely with Paystack
              </li>
              <li className="inline-flex items-center gap-2">
                <ChevronDown className="text-accent-fg h-4 w-4 rotate-[-90deg]" /> 24h response avg.
              </li>
            </ul>
            <Button asChild variant="dark" size="md">
              <Link href="/how-it-works">
                How verification works <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Newsletter ──────────────────────────────────────────────── */}
      <Newsletter />

      {/* ─── Earn on Sync CTA (full-bleed, flush under newsletter) ───── */}
      <section className="bg-ink text-cream w-full">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:grid-cols-2 md:gap-16 md:py-20">
          {/* Landlord */}
          <div className="flex flex-col items-start">
            <p className="eyebrow text-lime">Are you a landlord?</p>
            <h2 className="font-display text-section mt-3 capitalize">
              List a property. Get verified students.
            </h2>
            <p className="text-cream/70 mt-3 max-w-md text-sm">
              We verify, photograph, and list your property. You keep what you earn - paid via
              Paystack.
            </p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/signup?role=vendor&category=landlord">
                List a property <ArrowRight />
              </Link>
            </Button>
          </div>
          {/* Vendor */}
          <div className="border-cream/15 flex flex-col items-start md:border-l md:pl-16">
            <p className="eyebrow text-lime">Are you a vendor?</p>
            <h2 className="font-display text-section mt-3 capitalize">
              Sell food, beauty, laundry &amp; more.
            </h2>
            <p className="text-cream/70 mt-3 max-w-md text-sm">
              Reach students around campus. List your menu or services, take orders, and get paid
              via Paystack.
            </p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/signup?role=vendor">
                Start selling <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
