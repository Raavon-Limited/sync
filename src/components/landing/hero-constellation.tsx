/**
 * HeroConstellation - the landing hero.
 *
 * Feature icons float around the screen, dotted lines run from each of them
 * INTO the Sync mark, and Sync sends lines back OUT to the photos and the
 * weekly card. That flow (everything in, one place, out to your life) is the
 * whole pitch, so the lines are measured from the real DOM rather than drawn
 * at fixed coordinates: the tiles and icons move at every breakpoint and a
 * pre-drawn line would point at empty space.
 *
 * LAYOUT
 *   > 1024px: copy left, picture cluster right, weekly card bottom-right. Fits
 *             the viewport under the header.
 *   <= 1024px: cluster first, then the weekly card, then the copy (founder's
 *             call: "the connection come first"). Icons are re-anchored to the
 *             cluster/copy boxes by fraction so they never sit UNDER a photo.
 *
 * WEEKLY CARD
 *   Real rows from the showcase (hostels, the next event, a hot spot), plus one
 *   fixed "This week" card so it is never empty on a young market. No
 *   placeholder names: a slide is either a real listing or the brand card.
 */
'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavIcon } from '@/components/layouts/nav-icon';
import type { Highlight } from '@/app/(marketing)/landing-data';

/* Desktop positions are % of the hero box. `m` (phone) and `t` (tablet) anchor
   to a box: [which box, x fraction, y fraction]. Tuned on the design canvas,
   then on a 390px phone: there the copy column is full width and its text
   runs to the edge, so only one icon (Laundry, beside the short eyebrow) stays
   on the copy box and the rest sit in gaps between the tiles. */
type Anchor = ['cluster' | 'copy', number, number];
const ICONS: { label: string; icon: string; left: string; top: string; m: Anchor; t?: Anchor }[] = [
  { label: 'Hostels', icon: 'hostels', left: '6%', top: '17%', m: ['cluster', 0.11, 0.625], t: ['cluster', 0.17, 0.66] },
  { label: 'Food', icon: 'food', left: '19%', top: '6%', m: ['cluster', 0.15, 0.17], t: ['cluster', 0.14, 0.15] },
  { label: 'Sync Internet', icon: 'wifi', left: '33%', top: '24%', m: ['cluster', 0.9, 0.7], t: ['cluster', 0.32, 0.8] },
  { label: 'Trades', icon: 'workmanship', left: '46%', top: '5%', m: ['cluster', 0.05, 0.975], t: ['cluster', 0.09, 0.95] },
  { label: 'Around you', icon: 'around-you', left: '8%', top: '39%', m: ['cluster', 0.08, 0.04], t: ['copy', 0.9, 0.97] },
  { label: 'Laundry', icon: 'laundry', left: '45%', top: '92%', m: ['copy', 0.9, 0.03] },
  { label: 'Hot spots', icon: 'hot-spots', left: '92%', top: '7%', m: ['cluster', 0.83, 0.33], t: ['cluster', 0.95, 0.31] },
  { label: 'Beauty', icon: 'beauty', left: '96%', top: '41%', m: ['cluster', 0.52, 0.66], t: ['copy', 0.93, 0.5] },
  { label: 'Dispatch', icon: 'truck', left: '33%', top: '4%', m: ['cluster', 0.5, 0.965], t: ['copy', 0.97, 0.25] },
  { label: 'Events', icon: 'events', left: '58%', top: '87%', m: ['cluster', 0.93, 0.97], t: ['cluster', 0.94, 0.9] },
];

/* Squircle tiles. Desktop / tablet / phone boxes as % of the cluster. */
const TILES = [
  { src: '/images/landing/friends.webp', alt: 'Friends huddled together for a selfie', pos: '50% 45%', bg: 'bg-sage',
    d: 'left-[35.16%] top-[4.17%] w-[23.44%] h-[25%]', p: 'max-sm:left-[35%] max-sm:top-[3.57%] max-sm:w-[30%] max-sm:h-[21.43%]' },
  { src: '/images/landing/selfie.webp', alt: 'Student taking a selfie', pos: '50% 25%', bg: 'bg-leaf',
    d: 'left-[5.47%] top-[35.83%] w-[23.44%] h-[25%]', p: 'max-sm:left-[2.5%] max-sm:top-[33.93%] max-sm:w-[30%] max-sm:h-[21.43%]' },
  { src: '/images/landing/event.webp', alt: 'Crowd at a campus event night', pos: '50% 45%', bg: 'bg-moss',
    d: 'left-[64.84%] top-[18%] max-lg:top-[35.83%] w-[23.44%] h-[25%]', p: 'max-sm:left-[67.5%] max-sm:top-[41.07%] max-sm:w-[30%] max-sm:h-[21.43%]' },
  { src: '/images/landing/group.webp', alt: 'Group of students hanging out on the grass', pos: '50% 35%', bg: 'bg-sage',
    d: 'left-[35.16%] max-lg:left-[60%] top-[67.5%] w-[23.44%] h-[25%]', p: 'max-sm:left-[8.75%] max-sm:top-[69.64%] max-sm:w-[30%] max-sm:h-[21.43%]' },
  { src: '/images/landing/hostel.webp', alt: 'Student hostel building', pos: '60% 50%', bg: 'bg-leaf', small: true,
    d: 'left-[81%] max-lg:left-[73.75%] top-[-3%] max-lg:top-[7%] w-[15%] h-[16%]', p: 'max-sm:left-[75.75%] max-sm:top-[9.46%] max-sm:w-[21%] max-sm:h-[15%]' },
  { src: '/images/landing/group.webp', alt: 'Students working together outdoors', pos: '30% 70%', bg: 'bg-sage', small: true,
    d: 'left-[7.03%] top-[71.67%] w-[15.63%] h-[16.67%]', p: 'max-sm:left-[63.75%] max-sm:top-[77.68%] max-sm:w-[22.5%] max-sm:h-[16.07%]' },
];

interface Slide {
  id: string;
  label: string;
  title: string;
  text: string;
  img: string;
  pos?: string;
  href: string;
}

const BRAND_SLIDE: Slide = {
  id: 'week',
  label: 'This week',
  title: 'Your weekly campus roundup',
  text: 'New verified hostels, upcoming events and the spots students loved this week.',
  img: '/images/landing/group.webp',
  pos: '50% 35%',
  href: '/around',
};

type Line = { x1: number; y1: number; x2: number; y2: number };
type Pt = { left: number; top: number };

export function HeroConstellation({
  highlights,
  areaLabel,
}: {
  highlights: Highlight[];
  /** Short name for the CTA, e.g. "KWASU". */
  areaLabel: string;
}) {
  const slides: Slide[] = [
    BRAND_SLIDE,
    ...highlights.slice(0, 5).map((h) => ({
      id: h.id,
      label: h.service,
      title: h.title,
      text: h.meta,
      img: h.image,
      href: h.href,
    })),
  ];

  const root = useRef<HTMLElement>(null);
  const [lines, setLines] = useState<{ inL: Line[]; outL: Line[]; w: number; h: number; hub: Pt | null }>({
    inL: [],
    outL: [],
    w: 0,
    h: 0,
    hub: null,
  });
  // Null on desktop: the icons use their % positions from ICONS.
  const [mpos, setMpos] = useState<(Pt | null)[] | null>(null);

  const measure = useCallback(() => {
    const el = root.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const box = (sel: string) => {
      const n = el.querySelector(sel);
      if (!n) return null;
      const b = n.getBoundingClientRect();
      return { x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height };
    };
    const vw = window.innerWidth;
    if (vw <= 1024) {
      const anchors = { cluster: box('[data-cluster]'), copy: box('[data-copy]') };
      const phone = vw <= 640;
      const next = ICONS.map((ic) => {
        const spec = phone ? ic.m : (ic.t ?? ic.m);
        const a = anchors[spec[0]];
        return a ? { left: Math.round(a.x + a.w * spec[1]), top: Math.round(a.y + a.h * spec[2]) } : null;
      });
      setMpos((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    } else {
      setMpos((prev) => (prev === null ? prev : null));
    }
    const centre = (n: Element) => {
      const b = n.getBoundingClientRect();
      return { x: Math.round(b.left - r.left + b.width / 2), y: Math.round(b.top - r.top + b.height / 2) };
    };
    const hubEl = el.querySelector('[data-hub]');
    if (!hubEl) return;
    const hub = centre(hubEl);
    const inL = Array.from(el.querySelectorAll('[data-icon]')).map((n) => {
      const p = centre(n);
      return { x1: p.x, y1: p.y, x2: hub.x, y2: hub.y };
    });
    const outL = Array.from(el.querySelectorAll('[data-target]')).map((n) => {
      const p = centre(n);
      return { x1: hub.x, y1: hub.y, x2: p.x, y2: p.y };
    });
    const next = { inL, outL, w: el.scrollWidth, h: el.scrollHeight, hub: { left: hub.x, top: hub.y } };
    setLines((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  // Layout effect so the first paint already has lines; a second pass after
  // the icons move on mobile (their positions depend on the first measure).
  useLayoutEffect(() => {
    measure();
  }, [measure, mpos]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    window.addEventListener('resize', measure);
    // Fonts swap in late and shift the copy column.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  /* ── Weekly card rotation ── */
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    // Reduced motion means no autoplay at all; the dots still work.
    if (slides.length < 2 || paused || hovering || reduced) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 4500);
    return () => clearInterval(t);
  }, [slides.length, paused, hovering, reduced]);
  const slide = slides[idx % slides.length];

  return (
    <section
      ref={root}
      className="bg-stone text-forest relative isolate overflow-hidden lg:h-[calc(100svh-4rem)] lg:min-h-[600px]"
    >
      {/* Glow behind the hub */}
      {lines.hub && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -z-10 size-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: lines.hub.left,
            top: lines.hub.top,
            background:
              'radial-gradient(circle, rgb(163 177 138 / 0.55) 0%, rgb(163 177 138 / 0.18) 40%, rgb(163 177 138 / 0) 68%)',
          }}
        />
      )}

      {/* Lines: features into Sync (faint), Sync out to the pictures (strong). */}
      {lines.w > 0 && (
        <svg
          aria-hidden="true"
          width={lines.w}
          height={lines.h}
          viewBox={`0 0 ${lines.w} ${lines.h}`}
          className="text-forest pointer-events-none absolute top-0 left-0 -z-10 overflow-visible"
        >
          <g fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.5} strokeLinecap="round" strokeDasharray="2 9" className="max-lg:[stroke-opacity:0.22]">
            {lines.inL.map((l, i) => (
              <line key={i} className="sync-flow-in" {...l} />
            ))}
          </g>
          <g fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeDasharray="6 10" className="text-leaf">
            {lines.outL.map((l, i) => (
              <line key={i} className="sync-flow" {...l} />
            ))}
          </g>
        </svg>
      )}

      {/* Floating feature icons. Decorative: the same destinations are links
          in the header's Explore menu. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        {ICONS.map((ic, i) => {
          const p = mpos?.[i];
          if (mpos && !p) return null;
          return (
            <div
              key={ic.label}
              data-icon=""
              className="absolute size-[60px] -translate-x-1/2 -translate-y-1/2 opacity-50 max-[880px]:size-[42px]"
              style={p ? { left: p.left, top: p.top } : { left: ic.left, top: ic.top }}
            >
              <div className="sync-float relative size-full" style={{ animationDelay: `${(i % 5) * -1.2}s` }}>
                <div className="bg-stone border-forest/35 text-forest flex size-full items-center justify-center rounded-full border">
                  <NavIcon name={ic.icon} size={22} />
                </div>
                <span className="text-forest absolute top-[68px] left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-wider whitespace-nowrap uppercase max-[880px]:hidden">
                  {ic.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[1400px] flex-col gap-8 px-4 pt-2 pb-7 md:px-8 lg:flex-row lg:items-stretch lg:gap-10 lg:pt-0">
        {/* Copy */}
        <div data-copy="" className="order-2 flex min-w-0 flex-col justify-end gap-5 lg:order-1 lg:flex-1">
          <span className="text-moss flex items-center gap-2.5 font-mono text-xs tracking-wider uppercase">
            <span className="bg-leaf size-2 rounded-full" />
            Connect · Search · Sync
          </span>
          <h1 className="font-display text-forest max-w-[600px] text-[clamp(36px,min(4vw,6.4vh),60px)] leading-[1.02] font-bold tracking-[-0.035em]">
            Everything campus. <span className="text-leaf">One sync.</span>
          </h1>
          <p className="text-moss max-w-[460px] text-[17px] leading-relaxed">
            Hostels, internet, events, food and every service around campus, in one place built for
            students.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/around"
              className="bg-forest text-stone flex min-h-[52px] items-center gap-2.5 rounded-full py-1.5 pr-1.5 pl-5 text-[15px] font-semibold"
            >
              Explore {areaLabel}
              <span className="bg-sunflower text-forest flex size-10 items-center justify-center rounded-full">
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
            <Link
              href="#how"
              className="border-forest text-forest bg-stone/70 flex min-h-[52px] items-center rounded-full border-[1.5px] px-5 text-[15px] font-semibold"
            >
              How it works
            </Link>
          </div>
        </div>

        {/* Picture zone */}
        <div className="relative order-1 flex min-w-0 flex-col items-center gap-5 lg:order-2 lg:flex-[1.3] lg:flex-row lg:items-center lg:justify-start">
          <div
            data-cluster=""
            className="relative mx-auto aspect-[640/600] w-full max-w-[700px] max-sm:aspect-[400/560] lg:mx-0 lg:w-[min(100%,600px,calc((100svh-10rem)*1.0667))]"
          >
            {TILES.map((t, i) => (
              <figure
                key={i}
                data-target=""
                className={cn(
                  'border-paper absolute m-0 overflow-hidden rounded-[24%] border-[3px] transition-transform duration-300 hover:-translate-y-1 hover:-rotate-1 max-[880px]:border-2 motion-reduce:transition-none',
                  t.small ? 'shadow-[0_12px_28px_rgb(52_78_65/0.2)]' : 'shadow-[0_14px_34px_rgb(52_78_65/0.22)]',
                  t.bg,
                  t.d,
                  t.p,
                )}
              >
                <Image
                  src={t.src}
                  alt={t.alt}
                  fill
                  sizes="(max-width: 640px) 30vw, 160px"
                  priority={i < 2}
                  className="object-cover"
                  style={{ objectPosition: t.pos }}
                />
              </figure>
            ))}
            <div
              data-hub=""
              role="img"
              aria-label="Sync"
              className="absolute top-[35.83%] left-[35.16%] flex h-[25%] w-[23.44%] items-center justify-center max-sm:top-[39.29%] max-sm:left-[37.5%] max-sm:h-[17.86%] max-sm:w-[25%]"
            >
              {/* The kit mark in its own colours (forest + sage), spinning. */}
              <svg viewBox="0 0 100 100" aria-hidden="true" className="sync-spin size-[72%] drop-shadow-[0_14px_22px_rgb(52_78_65/0.3)]">
                <circle cx="50" cy="50" r="46" fill="#344E41" />
                <path d="M50 4 A46 46 0 0 1 50 96 A23 23 0 0 1 50 50 A23 23 0 0 0 50 4 Z" fill="#A3B18A" />
              </svg>
            </div>
          </div>

          {/* Weekly card - its own card, fed by Sync. */}
          <div
            className="relative flex w-full max-w-[340px] flex-col gap-2.5 lg:absolute lg:right-0 lg:bottom-0 lg:w-[290px]"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            onFocus={() => setHovering(true)}
            onBlur={() => setHovering(false)}
          >
            <div
              data-target=""
              className="border-paper bg-forest flex flex-col rounded-[22px] border-[3px] p-[7px] shadow-[0_18px_40px_rgb(52_78_65/0.3)]"
            >
              <Link href={slide.href} key={slide.id} className="sync-fade bg-sage relative block h-[150px] overflow-hidden rounded-[15px]">
                <Image src={slide.img} alt="" fill sizes="290px" className="object-cover" style={{ objectPosition: slide.pos ?? '50% 50%' }} />
                <span className="bg-paper text-forest absolute top-2 left-2 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium tracking-wider uppercase">
                  {slide.label}
                </span>
              </Link>
              <div className="flex flex-col gap-1 px-2 pt-2.5 pb-1" aria-live="polite">
                <span className="font-display text-paper text-base leading-tight font-semibold">{slide.title}</span>
                <span className="text-paper/85 text-[12.5px] leading-snug">{slide.text}</span>
              </div>
              {slides.length > 1 && (
                <div className="flex items-center px-0.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setPaused((p) => !p)}
                    aria-label={paused ? 'Play roundup' : 'Pause roundup'}
                    className="border-paper/30 text-paper mr-1 flex size-7 items-center justify-center rounded-full border"
                  >
                    {paused ? <Play className="size-3 fill-current" /> : <Pause className="size-3 fill-current" />}
                  </button>
                  {slides.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setIdx(i)}
                      aria-label={`Show ${s.label}: ${s.title}`}
                      aria-current={i === idx % slides.length}
                      className="flex size-[22px] items-center justify-center"
                    >
                      <span
                        className={cn(
                          'h-1.5 rounded-full transition-all',
                          i === idx % slides.length ? 'bg-sage w-4' : 'bg-paper/40 w-1.5',
                        )}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Link
              href="/around"
              className="bg-paper text-forest flex h-[46px] items-center justify-between rounded-xl pr-1.5 pl-4 text-sm font-semibold shadow-[0_10px_24px_rgb(52_78_65/0.15)]"
            >
              This week on Sync
              <span className="bg-forest text-paper flex size-9 items-center justify-center rounded-[9px]">
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
