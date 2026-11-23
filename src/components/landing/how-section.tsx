/**
 * HowSection - "How Sync works", with a students / vendors switch.
 *
 * The header's "How it works" link lands here (#how). The vendor side
 * replaces the old landlord/vendor CTA band at the bottom of the page: same
 * job, said once, next to the steps it describes.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Check, MapPin, Search, Star, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = {
  students: [
    { title: 'Set your area', text: 'Turn on location or pick your campus area. Sync shows you what is close.', Icon: MapPin },
    { title: 'Find what you need', text: 'Hostels, food, laundry, events and more. Filter till it fits your budget.', Icon: Search },
    { title: 'Connect with verified vendors', text: 'Look for the Verified badge, given only after Sync checks a vendor. Enquire or visit with confidence.', Icon: BadgeCheck },
    { title: 'Pay and stay in sync', text: 'Pay through Sync where it is offered, stay updated till it is done, then rate it.', Icon: Check },
  ],
  vendors: [
    { title: 'Create your profile', text: 'Tell us what you offer, your prices and where you operate.', Icon: Store },
    { title: 'Get verified', text: 'We confirm your details so students trust you from day one.', Icon: BadgeCheck },
    { title: 'Get discovered', text: 'Show up in search, the weekly roundup and the Around you feed.', Icon: Star },
    { title: 'Get booked and paid', text: 'Handle requests, talk to students and build repeat customers.', Icon: Check },
  ],
} as const;

type Mode = keyof typeof STEPS;

export function HowSection() {
  const [mode, setMode] = useState<Mode>('students');
  const students = mode === 'students';

  return (
    <section id="how" className="bg-paper text-forest scroll-mt-16 px-4 pt-16 pb-[68px] md:px-8 md:pt-20 md:pb-[88px]">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-moss font-mono text-[11.5px] tracking-wider uppercase">How Sync works</span>
            <h2 className="font-display text-[clamp(28px,3.4vw,44px)] leading-[1.05] font-bold tracking-[-0.03em]">
              {students ? 'Four steps to a sorted campus life' : 'Sell to students in four steps'}
            </h2>
          </div>
          <div role="tablist" aria-label="Who is this for" className="border-forest/20 flex rounded-full border p-1">
            {(
              [
                ['students', 'For students'],
                ['vendors', 'For vendors'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={mode === k}
                onClick={() => setMode(k)}
                className={cn(
                  'min-h-10 rounded-full px-4 text-sm font-semibold transition-colors',
                  mode === k ? 'bg-forest text-paper' : '',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ol className="relative grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-y-7 lg:grid-cols-4">
          {/* Dashed rail behind the step numbers: across on desktop, down on a phone. */}
          <span aria-hidden="true" className="border-forest/45 absolute top-7 right-[12%] left-[12%] hidden border-t-2 border-dashed lg:block" />
          <span aria-hidden="true" className="border-forest/45 absolute top-7 bottom-7 left-[27px] border-l-2 border-dashed sm:hidden" />
          {STEPS[mode].map((s, i) => (
            <li key={s.title} className="sync-fade relative flex items-start gap-4 sm:flex-col sm:items-center sm:text-center">
              <span className="bg-forest text-paper relative flex size-14 shrink-0 items-center justify-center rounded-full">
                <s.Icon className="size-5" aria-hidden="true" />
                <span className="bg-sage text-forest absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full text-xs font-bold">
                  {i + 1}
                </span>
              </span>
              <span className="flex flex-col gap-1.5">
                <span className="font-display text-lg leading-tight font-bold">{s.title}</span>
                <span className="text-moss max-w-[260px] text-sm leading-relaxed">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={students ? '/around' : '/for-vendors'}
            className="bg-forest text-paper flex min-h-[52px] items-center gap-2.5 rounded-full py-1.5 pr-1.5 pl-5 text-[15px] font-semibold"
          >
            {students ? 'Start exploring' : 'Become a vendor'}
            <span className="bg-sunflower text-forest flex size-10 items-center justify-center rounded-full">
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMode(students ? 'vendors' : 'students')}
            className="min-h-11 px-3 text-sm font-semibold underline underline-offset-4"
          >
            {students ? 'I run a business' : 'I am a student'}
          </button>
        </div>
      </div>
    </section>
  );
}
