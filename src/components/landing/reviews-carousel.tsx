/**
 * ReviewsCarousel - approved student reviews on the landing page.
 *
 * Only ever rendered with REAL rows (see ReviewsSection). There is no seeded
 * fallback any more: the old one put quotes from students who do not exist on
 * the public home page.
 *
 * A scroll-snap track, so it swipes natively on a phone and needs no carousel
 * library. Arrows and dots drive the same scroll. It advances on its own every
 * 6s, but never under reduced motion, never while hovered or focused, and
 * stops for good once the visitor takes over.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowRight, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TestimonialForm } from '@/components/shared/testimonial-form';
import type { PendingTestimonial, Testimonial } from '@/modules/testimonials/queries';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function ReviewsCarousel({
  reviews,
  signedIn,
  mine,
}: {
  reviews: Testimonial[];
  signedIn: boolean;
  mine: PendingTestimonial | null;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const [touched, setTouched] = useState(false);
  const many = reviews.length > 1;

  const go = useCallback((i: number) => {
    const el = track.current;
    const item = el?.children[i] as HTMLElement | undefined;
    if (!el || !item) return;
    el.scrollTo({ left: item.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  }, []);

  // Which card is in view, from the scroll position: works for swipes too.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const on = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      const x = el.scrollLeft;
      let best = 0;
      kids.forEach((k, i) => {
        if (Math.abs(k.offsetLeft - el.offsetLeft - x) < Math.abs(kids[best].offsetLeft - el.offsetLeft - x)) best = i;
      });
      setActive(best);
    };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    if (!many || held || touched) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      const el = track.current;
      if (!el) return;
      // At the end of the track, wrap to the start.
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      go(atEnd ? 0 : active + 1);
    }, 6000);
    return () => clearInterval(t);
  }, [many, held, touched, active, go]);

  const step = (d: number) => {
    setTouched(true);
    go(Math.max(0, Math.min(reviews.length - 1, active + d)));
  };

  return (
    <section id="reviews" className="bg-stone text-forest px-4 pt-16 pb-[68px] md:px-8 md:pt-20 md:pb-[88px]">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-moss font-mono text-[11.5px] tracking-wider uppercase">Loved by students</span>
            <h2 className="font-display text-[clamp(28px,3.4vw,44px)] leading-[1.05] font-bold tracking-[-0.03em]">
              Don&rsquo;t take our <span className="text-leaf">word for it</span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <ReviewDialog signedIn={signedIn} mine={mine} />
            {many && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  disabled={active === 0}
                  aria-label="Previous review"
                  className="border-forest/25 flex size-11 items-center justify-center rounded-full border disabled:opacity-35"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  disabled={active === reviews.length - 1}
                  aria-label="Next review"
                  className="bg-forest text-paper flex size-11 items-center justify-center rounded-full disabled:opacity-35"
                >
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>

        <ul
          ref={track}
          aria-label="Student reviews"
          onPointerDown={() => setTouched(true)}
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
          className="no-scrollbar -mx-4 grid snap-x snap-mandatory auto-cols-[86%] grid-flow-col gap-3.5 overflow-x-auto scroll-smooth px-4 sm:auto-cols-[calc((100%-14px)/2)] md:mx-0 md:px-0 lg:auto-cols-[calc((100%-28px)/3)]"
        >
          {reviews.map((r, i) => (
            <li
              key={r.id}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${reviews.length}`}
              className="snap-start"
            >
              <figure className="bg-paper flex h-full flex-col gap-5 rounded-[26px] p-6 shadow-[0_14px_36px_rgb(52_78_65/0.1)]">
                <div className="flex gap-0.5" role="img" aria-label={`${r.rating} out of 5`}>
                  {Array.from({ length: 5 }, (_, s) => (
                    <Star
                      key={s}
                      className={cn('size-4', s < r.rating ? 'fill-sunflower text-sunflower' : 'text-forest/20')}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <blockquote className="font-display flex-1 text-lg leading-snug">
                  &ldquo;{r.body}&rdquo;
                </blockquote>
                <figcaption className="border-forest/10 flex items-center gap-3 border-t pt-4">
                  <span className="bg-sage text-forest flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                    {initials(r.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{r.name}</span>
                    {r.detail && <span className="text-moss block truncate text-[13px]">{r.detail}</span>}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>

        {many && (
          <div className="flex justify-center gap-1">
            {reviews.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setTouched(true);
                  go(i);
                }}
                aria-label={`Go to review ${i + 1}`}
                aria-current={i === active}
                className="flex size-6 items-center justify-center"
              >
                <span className={cn('h-1.5 rounded-full transition-all', i === active ? 'bg-forest w-5' : 'bg-forest/25 w-1.5')} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** "Share yours" - the existing moderated review form, in a dialog. */
export function ReviewDialog({
  signedIn,
  mine,
  className,
  label = 'Share yours',
}: {
  signedIn: boolean;
  mine: PendingTestimonial | null;
  className?: string;
  label?: string;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        className={cn('border-forest/25 flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold', className)}
      >
        {label}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(20_30_24/0.5)]" />
        <Dialog.Content className="bg-panel text-content fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[520px] flex-col gap-4 overflow-y-auto rounded-t-3xl p-6 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-3xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-display text-xl font-bold">Been through Sync?</Dialog.Title>
              <Dialog.Description className="text-content-muted mt-1 text-sm">
                Tell the next student what it was actually like.
              </Dialog.Description>
            </div>
            <Dialog.Close className="bg-surface-deep flex size-10 shrink-0 items-center justify-center rounded-full" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <TestimonialForm signedIn={signedIn} existing={mine} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
