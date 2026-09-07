/**
 * Testimonials - social-proof rail of student quotes with avatars + ratings.
 *
 * Now reads APPROVED rows from public.testimonials. Nothing here has been
 * seen by the public until a superadmin approved it - see the moderation
 * queue at /admin/reviews.
 *
 * SEEDED falls back in when there are no approved rows yet, so a fresh
 * database does not ship a landing page with an empty trust section. Once
 * real reviews exist they replace it entirely.
 */
import { Star } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Reveal, Stagger, StaggerItem } from './reveal';
import { TestimonialForm } from '@/components/shared/testimonial-form';
import {
  listApprovedTestimonials,
  type PendingTestimonial,
} from '@/modules/testimonials/queries';

interface TestimonialsProps {
  signedIn: boolean;
  /** The viewer's own submission, so the form can show its state. */
  mine: PendingTestimonial | null;
}

const SEEDED = [
  {
    quote:
      'Booked my room from my phone without a single agent. Paid into escrow, moved in, money released. That easy.',
    name: 'Aisha O.',
    detail: '300L · KWASU',
    rating: 5,
  },
  {
    quote:
      'I found a verified self-contain 6 minutes from class and saved the 20% an agent wanted. Wild.',
    name: 'Tunde A.',
    detail: '200L · KWASU',
    rating: 5,
  },
  {
    quote:
      "Around you is my home screen now - got Fresher's Night tickets and ordered food the same night.",
    name: 'Zainab M.',
    detail: '100L · KWASU',
    rating: 5,
  },
];

export async function Testimonials({ signedIn, mine }: TestimonialsProps) {
  const approved = await listApprovedTestimonials(3);
  const items = approved.length
    ? approved.map((t) => ({
        quote: t.body,
        name: t.name,
        detail: t.detail ?? '',
        rating: t.rating,
      }))
    : SEEDED;

  return (
    <section className="px-6 pt-12">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <p className="eyebrow text-accent-fg">Loved by students</p>
          <h2 className="font-display text-section text-foreground mt-2 capitalize">Don&rsquo;t take our word for it.</h2>
        </Reveal>
        <Stagger className="mt-10 grid gap-5 md:grid-cols-3">
          {items.map((t) => (
            <StaggerItem key={t.name}>
              <figure className="bg-panel shadow-card flex h-full flex-col gap-4 rounded-2xl p-6">
                <div className="flex items-center justify-between gap-3">
                  <figcaption className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>
                        {t.name
                          .split(' ')
                          .map((p) => p[0])
                          .join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-foreground text-sm font-medium">{t.name}</p>
                      <p className="text-content-muted text-xs">{t.detail}</p>
                    </div>
                  </figcaption>
                  <div
                    aria-label={`${t.rating} out of 5`}
                    className="flex shrink-0 gap-0.5"
                  >
                    {Array.from({ length: t.rating }).map((_, s) => (
                      <Star key={s} className="fill-lime text-lime h-4 w-4" strokeWidth={1.5} />
                    ))}
                  </div>
                </div>
                <blockquote className="text-foreground flex-1 text-[15px] leading-relaxed">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
              </figure>
            </StaggerItem>
          ))}
        </Stagger>

        {/* Leave your own. Sits directly under the wall of quotes rather than
            on a separate page - the moment someone is convinced by these is
            the moment they might add one. */}
        <Reveal delay={0.24}>
          <div className="border-line/10 bg-surface-deep mt-10 rounded-2xl border p-6 md:p-8">
            <h3 className="font-display text-card text-foreground">Been through Sync?</h3>
            <p className="text-content-muted mt-1 mb-5 text-sm">
              Tell the next student what it was actually like.
            </p>
            <TestimonialForm signedIn={signedIn} existing={mine} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
