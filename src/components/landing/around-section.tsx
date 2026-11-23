/**
 * AroundSection - "What's popping" on the landing page.
 *
 * A bento of things that are TRUE right now at the launch campus:
 *   - the time of day (Lagos) and the real weather, or no weather at all
 *   - plans that fit the time of day, each linking to a module that exists
 *   - the next real event and a real hot spot, or an honest empty card
 *   - the gist card, which says plainly the feed is coming and how to send
 *     gist today (the Reach out form), instead of fake posts
 *
 * Server-rendered: the page is dynamic already (it reads the session), and
 * every input here is server data.
 */
import Link from 'next/link';
import { ArrowRight, CalendarDays, Megaphone, Moon, Sun } from 'lucide-react';
import { NavIcon } from '@/components/layouts/nav-icon';
import type { CampusWeather, LandingShowcase } from '@/app/(marketing)/landing-data';

type Part = 'morning' | 'afternoon' | 'evening' | 'night';

const PLANS: Record<Part, { label: string; icon: string; href: string }[]> = {
  morning: [
    { label: 'Grab breakfast near you', icon: 'food', href: '/food' },
    { label: 'Find a quiet study spot', icon: 'hot-spots', href: '/hotspots' },
    { label: 'Drop your laundry', icon: 'laundry', href: '/laundry' },
  ],
  afternoon: [
    { label: 'Lunch without the long queue', icon: 'food', href: '/food' },
    { label: 'Fix that faulty socket', icon: 'workmanship', href: '/workmanship' },
    { label: 'See rooms before you visit', icon: 'hostels', href: '/hostels' },
  ],
  evening: [
    { label: 'Catch an event tonight', icon: 'events', href: '/events' },
    { label: 'Chill at a hot spot', icon: 'hot-spots', href: '/hotspots' },
    { label: 'Fresh cut or nails', icon: 'beauty', href: '/beauty' },
  ],
  night: [
    { label: 'Late night food run', icon: 'food', href: '/food' },
    { label: 'Plan tomorrow quietly', icon: 'hot-spots', href: '/hotspots' },
    { label: 'See what is on this week', icon: 'events', href: '/events' },
  ],
};

const GUIDES = [
  { label: 'How verification works', href: '/how-verification-works' },
  { label: 'How Sync works', href: '/how-it-works' },
  { label: 'About Sync', href: '/about' },
];

function lagosPart(): Part {
  // Sync's only market is in Nigeria, so Lagos time is the campus clock.
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }).format(new Date()),
  );
  return h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
}

const card = 'bg-paper rounded-[26px] p-5 shadow-[0_14px_36px_rgb(52_78_65/0.1)]';

export function AroundSection({
  campus,
  showcase,
  weather,
}: {
  campus: string;
  showcase: LandingShowcase;
  weather: CampusWeather | null;
}) {
  const part = lagosPart();
  const greeting =
    part === 'morning' ? 'Good morning' : part === 'afternoon' ? 'Good afternoon' : part === 'evening' ? 'Good evening' : 'Late night';
  const day = part === 'night' ? 'tonight' : `this ${part}`;
  const night = weather ? !weather.isDay : part === 'night' || part === 'evening';

  return (
    <section id="around" className="bg-stone text-forest px-4 pt-16 pb-20 md:px-8 md:pt-[72px] md:pb-[88px]">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            <span className="text-moss flex items-center gap-2 font-mono text-[11.5px] tracking-wider uppercase">
              <span className="live-dot bg-leaf size-2 rounded-full" />
              Around you · Live
            </span>
            <h2 className="font-display text-[clamp(28px,3.4vw,44px)] leading-[1.05] font-bold tracking-[-0.03em]">
              What&rsquo;s popping in <span className="text-leaf">{campus}</span>
            </h2>
          </div>
          <Link
            href="/around"
            className="border-forest/25 flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-semibold"
          >
            Open Around you <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-6 lg:grid-cols-12">
          {/* Context: greeting, weather, plans */}
          <div className={`${card} flex flex-col gap-4 md:col-span-6 lg:col-span-4 lg:row-span-2`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-moss font-mono text-[11px] tracking-wider uppercase">{greeting}</p>
                {weather ? (
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-[34px] leading-none font-bold">{weather.tempC}°C</span>
                    <span className="text-sm font-semibold">{weather.condition}</span>
                  </p>
                ) : (
                  <p className="font-display mt-1 text-xl font-bold">{campus}</p>
                )}
              </div>
              <span className="bg-sage text-forest flex size-11 items-center justify-center rounded-2xl">
                {night ? <Moon className="size-5" aria-hidden="true" /> : <Sun className="size-5" aria-hidden="true" />}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="font-display text-base font-bold">Plans for {day}</p>
              {PLANS[part].map((p) => (
                <Link
                  key={p.label}
                  href={p.href}
                  className="hover:bg-stone/60 flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm font-medium transition-colors"
                >
                  <span className="bg-sage/40 text-forest flex size-8 items-center justify-center rounded-lg">
                    <NavIcon name={p.icon} size={16} solid />
                  </span>
                  <span className="flex-1">{p.label}</span>
                  <ArrowRight className="size-3.5 opacity-60" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>

          {/* The gist */}
          <div className={`${card} flex flex-col justify-between gap-4 md:col-span-6 lg:col-span-8`}>
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <span className="font-display text-[19px] font-bold">The gist near you</span>
              <Link
                href="/?topic=gist#contact"
                className="bg-forest text-paper flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold"
              >
                <Megaphone className="text-sage size-3.5" aria-hidden="true" /> Drop gist
              </Link>
            </div>
            <div className="border-forest/20 rounded-2xl border border-dashed p-5">
              <p className="font-display text-[17px] font-bold">The live gist feed is coming</p>
              <p className="text-moss mt-1 text-sm leading-relaxed">
                Alerts, deals and what students around {campus} are saying, in one feed. Seen something worth
                sharing before then? Send it in and we will put people on.
              </p>
            </div>
          </div>

          {/* Next event */}
          {showcase.event ? (
            <Link
              href={`/events/${showcase.event.slug}`}
              className="bg-forest text-paper flex min-h-44 flex-col justify-between gap-5 rounded-[26px] p-5 transition-transform hover:-translate-y-0.5 md:col-span-3 lg:col-span-4"
            >
              <span className="bg-sage text-forest inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                <CalendarDays className="size-3.5" aria-hidden="true" /> {showcase.event.when}
              </span>
              <span>
                <span className="text-paper/60 block font-mono text-[10px] tracking-wider uppercase">Coming up</span>
                <span className="font-display mt-1 block text-xl leading-tight">{showcase.event.title}</span>
                <span className="text-paper/70 mt-1 block text-xs">{showcase.event.venue}</span>
              </span>
            </Link>
          ) : (
            <Link
              href="/?topic=event#contact"
              className={`${card} flex min-h-44 flex-col justify-between gap-4 md:col-span-3 lg:col-span-4`}
            >
              <span className="text-moss font-mono text-[10px] tracking-wider uppercase">Coming up</span>
              <span>
                <span className="font-display block text-lg font-bold">No events listed yet</span>
                <span className="text-moss mt-1 block text-sm">Hosting something? Get it in front of students.</span>
              </span>
            </Link>
          )}

          {/* Hot spot */}
          {showcase.hotspot ? (
            <Link
              href={`/hotspots/${showcase.hotspot.slug}`}
              className="bg-sage text-forest flex min-h-44 flex-col justify-between gap-5 rounded-[26px] p-5 transition-transform hover:-translate-y-0.5 md:col-span-3 lg:col-span-4"
            >
              <span className="bg-paper inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold">Hot spot</span>
              <span>
                <span className="font-display block text-xl leading-tight">{showcase.hotspot.name}</span>
                <span className="text-forest/75 mt-1 block text-xs">{showcase.hotspot.meta}</span>
              </span>
            </Link>
          ) : (
            <div className={`${card} flex min-h-44 flex-col justify-between gap-4 md:col-span-3 lg:col-span-4`}>
              <span className="text-moss font-mono text-[10px] tracking-wider uppercase">Hot spot</span>
              <span className="font-display text-lg font-bold">Spots are being added</span>
            </div>
          )}

          {/* Guides */}
          <div className={`${card} flex flex-col gap-2 md:col-span-6 lg:col-span-12 lg:flex-row lg:items-center lg:justify-between`}>
            <span className="font-display text-[19px] font-bold">Your {campus} guide</span>
            <div className="flex flex-wrap gap-2">
              {GUIDES.map((g) => (
                <Link
                  key={g.href}
                  href={g.href}
                  className="border-forest/20 flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium"
                >
                  {g.label} <ArrowRight className="size-3" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
