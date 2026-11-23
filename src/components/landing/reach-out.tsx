/**
 * ReachOut - "Talk to us" on the landing page (#contact).
 *
 * The header's Spill the gist and Careers items link here with ?topic=..., so
 * the right topic is already picked when the form scrolls into view.
 *
 * NO BACKEND, ON PURPOSE AND SAID OUT LOUD
 *   There is no contact table or mail endpoint yet. Rather than show a
 *   "message sent" that went nowhere (the newsletter band this page used to
 *   carry did exactly that), Send opens the visitor's email app with the
 *   message written out to SITE.support.email. It is a real, working route
 *   today, and the button says what it does.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, AtSign, LifeBuoy, Mail, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SITE } from '@/config/site';
import { CONTACT_TOPICS, type ContactTopic } from '@/config/marketing-nav';
import type { PendingTestimonial } from '@/modules/testimonials/queries';
import { ReviewDialog } from './reviews-carousel';

const LABEL: Record<ContactTopic, string> = {
  general: 'General',
  vendor: 'Vendor',
  gist: 'Campus gist',
  spotlight: 'Spotlight',
  event: 'Promote an event',
  feature: 'Feature on Sync',
  careers: 'Careers',
  issue: 'Report an issue',
};

const isTopic = (x: string | null): x is ContactTopic => !!x && (CONTACT_TOPICS as readonly string[]).includes(x);

export function ReachOut({ signedIn, mine }: { signedIn: boolean; mine: PendingTestimonial | null }) {
  const [topic, setTopic] = useState<ContactTopic>('general');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  // Read on mount and on hash changes: a header link to /?topic=gist#contact
  // while already on / only changes the URL, it does not remount the page.
  useEffect(() => {
    const read = () => {
      const t = new URLSearchParams(window.location.search).get('topic');
      if (isTopic(t)) setTopic(t);
    };
    read();
    window.addEventListener('hashchange', read);
    window.addEventListener('popstate', read);
    return () => {
      window.removeEventListener('hashchange', read);
      window.removeEventListener('popstate', read);
    };
  }, []);

  const href = `mailto:${SITE.support.email}?subject=${encodeURIComponent(
    `[${LABEL[topic]}] ${name || 'Hello Sync'}`,
  )}&body=${encodeURIComponent(msg)}`;

  const field = 'border-forest/20 focus:border-forest/50 w-full rounded-xl border bg-transparent px-3.5 py-3 text-[15px]';

  return (
    <section id="contact" className="bg-cream-deep text-forest scroll-mt-16 px-4 pt-16 pb-[68px] md:px-8 md:pt-20 md:pb-[88px]">
      <div className="mx-auto grid max-w-[1280px] gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="text-moss font-mono text-[11.5px] tracking-wider uppercase">Reach out</span>
            <h2 className="font-display text-[clamp(28px,3.4vw,44px)] leading-[1.05] font-bold tracking-[-0.03em]">
              Talk to us. <span className="text-leaf">We are listening.</span>
            </h2>
            <p className="text-moss max-w-[420px] leading-relaxed">
              Questions, a vendor issue, a partnership idea or just a vibe check. Pick a channel or drop a message.
            </p>
          </div>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            <Channel Icon={Mail} label="Email" value={SITE.support.email} href={`mailto:${SITE.support.email}`} />
            <Channel Icon={LifeBuoy} label="Help" value={SITE.support.help} href={`mailto:${SITE.support.help}`} />
            <Channel Icon={Store} label="Vendor support" value="Listings, orders and verification" href="/for-vendors" />
            <Channel Icon={AtSign} label="Socials" value="@syncng on X and Instagram" href={SITE.socials.instagram} external />
          </ul>
          {/* The one place a review can be written when none is published yet. */}
          <div className="bg-paper flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <span className="text-sm">
              <span className="block font-bold">Been through Sync?</span>
              <span className="text-moss">Tell the next student what it was like.</span>
            </span>
            <ReviewDialog signedIn={signedIn} mine={mine} label="Leave a review" />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = href;
          }}
          className="bg-paper flex flex-col gap-4 rounded-[26px] p-5 shadow-[0_14px_36px_rgb(52_78_65/0.1)] md:p-7"
        >
          <span className="font-display text-xl font-bold">Send us a message</span>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="text-moss mb-2 font-mono text-[11px] tracking-wider uppercase">Topic</legend>
            {CONTACT_TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={topic === t}
                onClick={() => setTopic(t)}
                className={cn(
                  'min-h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
                  topic === t
                    ? 'bg-forest text-paper border-forest'
                    : 'border-forest/25',
                )}
              >
                {LABEL[t]}
              </button>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Message</span>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} required className={cn(field, 'resize-y')} />
          </label>
          <button
            type="submit"
            className="bg-sunflower text-forest flex min-h-12 items-center justify-center gap-2 rounded-full text-[15px] font-bold"
          >
            Open in my email app <ArrowRight className="size-4" aria-hidden="true" />
          </button>
          <p className="text-moss text-xs">
            This writes the email for you, addressed to {SITE.support.email}. Nothing is sent until you press send there.
          </p>
        </form>
      </div>
    </section>
  );
}

function Channel({
  Icon,
  label,
  value,
  href,
  external,
}: {
  Icon: typeof Mail;
  label: string;
  value: string;
  href: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <span className="bg-sage/45 text-forest flex size-10 shrink-0 items-center justify-center rounded-xl">
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className="text-moss block truncate text-[13px]">{value}</span>
      </span>
    </>
  );
  const cls = 'bg-paper flex items-center gap-3 rounded-2xl p-3.5';
  return (
    <li>
      {href.startsWith('/') ? (
        <Link href={href} className={cls}>
          {inner}
        </Link>
      ) : (
        <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {inner}
        </a>
      )}
    </li>
  );
}
