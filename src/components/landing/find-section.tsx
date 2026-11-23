/**
 * FindSection - "What are you looking for?" on the landing page.
 *
 * Tabs first, then a compact search bar, then five real cards for the tab.
 *
 * ORDER
 *   Featured rows first (a flag the row carries - see RailCard.featured), then
 *   the rest in an order seeded per browser. Two students on two phones see the
 *   five cards in different orders, so the same vendor is not always first,
 *   but one student sees a stable order across visits. The server renders the
 *   database order; the shuffle applies after hydration from a stored seed.
 *
 * HONEST STATES
 *   - Campus not live: says so, offers the live campus. No cards from KWASU
 *     dressed up as somewhere else.
 *   - Live but empty tab: says nothing is listed yet and points vendors to
 *     /for-vendors, instead of placeholder cards.
 *   - Dispatch: not built, labelled coming soon.
 *
 * SEARCH
 *   Hostels go to /search (the one page that understands budget and room
 *   type). Every other tab opens its module with the text as ?q=.
 */
'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, ArrowRight, Check, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DoodleBackdrop } from '@/components/shared/doodle-backdrop';
import { NavIcon } from '@/components/layouts/nav-icon';
import { useCampusChoice } from '@/hooks/use-campus-choice';
import { useLocationScope } from '@/providers/location-provider';
import type { LandingRails, RailCard, RailKey } from '@/app/(marketing)/landing-data';

type TabKey = RailKey | 'dispatch';

interface Tab {
  key: TabKey;
  label: string;
  short: string;
  icon: string;
  ask: string;
  placeholder: string;
  /** Only hostels have filters a results page understands today. Values are
   *  the free text /search's Budget and Room type fields already take. */
  filters?: { name: string; label: string; options: [string, string][] }[];
}

const TABS: Tab[] = [
  {
    key: 'hostels', label: 'Hostels', short: 'hostels', icon: 'hostels', ask: 'Looking for',
    placeholder: 'Self-contain, single room, shared apartment...',
    filters: [
      { name: 'budget', label: 'Budget', options: [['', 'Any budget'], ['Under ₦150k', 'Under ₦150k'], ['₦150k–₦300k', '₦150k to ₦300k'], ['₦300k+', '₦300k and up']] },
      { name: 'roomType', label: 'Room type', options: [['', 'Any type'], ['Single room', 'Single room'], ['Self-contain', 'Self-contain'], ['Shared room', 'Shared room'], ['Flat', 'Flat']] },
    ],
  },
  { key: 'food', label: 'Food', short: 'food', icon: 'food', ask: 'Craving', placeholder: 'Jollof, amala, shawarma, small chops...' },
  { key: 'events', label: 'Events', short: 'events', icon: 'events', ask: 'Find', placeholder: 'Parties, concerts, faculty week, hackathons...' },
  { key: 'hotspots', label: 'Hot spots', short: 'hot spots', icon: 'hot-spots', ask: 'Where to', placeholder: 'Lounges, chill spots, study spots...' },
  { key: 'workmanship', label: 'Artisans', short: 'artisans', icon: 'workmanship', ask: 'Book a', placeholder: 'Plumber, electrician, tailor, carpenter...' },
  { key: 'dispatch', label: 'Dispatch', short: 'dispatch riders', icon: 'truck', ask: 'Send', placeholder: 'Package, food pickup, errand, moving...' },
  { key: 'laundry', label: 'Laundry', short: 'laundry', icon: 'laundry', ask: 'Need', placeholder: 'Wash and fold, dry clean, ironing...' },
  { key: 'beauty', label: 'Beauty', short: 'beauty', icon: 'beauty', ask: 'Book', placeholder: 'Barber, braids, nails, lashes, makeup...' },
];

/* ── Per-browser seed ── */
const SEED_KEY = 'sync:seed';
const noop = () => () => {};
function readSeed(): number {
  try {
    let s = window.localStorage.getItem(SEED_KEY);
    if (!s) {
      s = String(Math.floor(Math.random() * 2 ** 31));
      window.localStorage.setItem(SEED_KEY, s);
    }
    return Number(s) || 1;
  } catch {
    return 1;
  }
}
/** Deterministic shuffle (mulberry32) so a seed always gives the same order. */
function seeded<T>(arr: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function FindSection({ rails }: { rails: LandingRails }) {
  const router = useRouter();
  const [tabKey, setTabKey] = useState<TabKey>('hostels');
  const [q, setQ] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState(false);
  const { campus, campuses, live, setCampus } = useCampusChoice();
  const loc = useLocationScope();
  // 0 on the server and first client render: database order, no mismatch.
  const seed = useSyncExternalStore(noop, readSeed, () => 0);

  const tab = TABS.find((t) => t.key === tabKey)!;
  const cards = useMemo(() => {
    if (tab.key === 'dispatch') return [];
    const all = rails[tab.key];
    const featured = all.filter((c) => c.featured);
    const rest = all.filter((c) => !c.featured);
    return [...featured, ...(seed ? seeded(rest, seed + tab.key.length) : rest)];
  }, [rails, tab.key, seed]);

  const pick = (k: TabKey) => {
    setTabKey(k);
    setQ('');
    setVals({});
  };

  const go = (e?: React.FormEvent) => {
    e?.preventDefault();
    setSheet(false);
    if (tab.key === 'dispatch') return;
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (loc.area) p.set('area', loc.area);
    for (const [k, v] of Object.entries(vals)) if (v) p.set(k, v);
    const qs = p.toString();
    router.push(tab.key === 'hostels' ? `/search${qs ? `?${qs}` : ''}` : `/${tab.key}${qs ? `?${qs}` : ''}`);
  };

  const filterCount = Object.values(vals).filter(Boolean).length;
  const liveCampus = campuses.find((c) => c.isServiced);
  const fieldCls = 'border-forest/20 text-forest mt-0.5 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-sm font-medium focus:border-forest/45';
  const kickerCls = 'text-moss font-mono text-[11px] tracking-wider uppercase';

  const filterFields = (big?: boolean) =>
    tab.filters?.map((f) => (
      <label key={f.name} className={cn('flex min-w-0 flex-col px-1.5', big && 'py-1')}>
        <span className={kickerCls}>{f.label}</span>
        <select
          value={vals[f.name] ?? ''}
          onChange={(e) => setVals((v) => ({ ...v, [f.name]: e.target.value }))}
          className={cn(fieldCls, big && 'py-2 text-[15px]')}
        >
          {f.options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
    ));

  return (
    <section id="search" className="bg-forest text-paper relative isolate overflow-hidden px-4 pt-14 pb-16 md:px-8 md:pt-16 md:pb-20">
      <DoodleBackdrop tile={520} className="text-paper/[0.07]" />
      <div className="relative mx-auto flex max-w-[1280px] flex-col gap-5">
        <h2 className="sr-only">Search Sync</h2>

        <div role="tablist" aria-label="What are you looking for" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          {TABS.map((t) => {
            const on = t.key === tab.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => pick(t.key)}
                className={cn(
                  'flex min-h-[46px] shrink-0 items-center gap-2 rounded-full border py-2 pr-4 pl-2.5 text-sm font-semibold whitespace-nowrap transition-colors',
                  on ? 'bg-paper text-forest border-paper' : 'border-paper/25 text-paper hover:border-paper/60',
                )}
              >
                <span className={cn('flex size-[30px] items-center justify-center rounded-full', on ? 'bg-sunflower text-forest' : 'bg-paper/12 text-paper')}>
                  <NavIcon name={t.icon} size={16} />
                </span>
                {t.label}
                {t.key === 'dispatch' && <span className="font-mono text-[9px] tracking-wider uppercase opacity-70">Soon</span>}
              </button>
            );
          })}
        </div>

        {/* Compact bar: query, where, (desktop) filters, search. Below lg the
            filters move into a sheet behind one button. */}
        <form
          role="tabpanel"
          aria-label={`${tab.label} search`}
          onSubmit={go}
          className="bg-paper text-forest flex flex-wrap items-center gap-1.5 rounded-[18px] p-2 shadow-[0_20px_50px_rgb(0_0_0/0.22)] sm:flex-nowrap"
        >
          <label className="flex min-w-0 flex-[1_1_100%] flex-col px-1.5 sm:flex-[2_1_0]">
            <span className={kickerCls}>{tab.ask}</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab.placeholder}
              disabled={tab.key === 'dispatch'}
              className={cn(fieldCls, 'appearance-none placeholder:text-forest/45')}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col px-1.5">
            <span className={kickerCls}>Where</span>
            <select
              value={loc.area ?? ''}
              onChange={(e) => loc.setArea(e.target.value || null)}
              className={fieldCls}
            >
              <option value="">All of {campus?.code ?? 'campus'}</option>
              {loc.areas.map((a) => (
                <option key={a.slug} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="hidden min-w-0 flex-1 gap-1.5 lg:flex">{filterFields()}</div>
          {tab.filters && (
            <button
              type="button"
              onClick={() => setSheet(true)}
              aria-label="More filters"
              className="bg-stone/60 text-forest relative flex size-10 shrink-0 items-center justify-center rounded-full lg:hidden"
            >
              <SlidersHorizontal className="size-[18px]" aria-hidden="true" />
              {filterCount > 0 && (
                <span className="bg-sunflower text-forest ring-forest absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ring-2">
                  {filterCount}
                </span>
              )}
            </button>
          )}
          <button
            type="submit"
            disabled={tab.key === 'dispatch'}
            className="bg-sunflower text-forest mr-1 flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold disabled:opacity-50 max-md:w-10 max-md:px-0"
          >
            <Search className="size-4" aria-hidden="true" />
            <span className="max-md:sr-only">Search {tab.short}</span>
          </button>
        </form>

        {/* Filter sheet, mobile and tablet. */}
        <Dialog.Root open={sheet} onOpenChange={setSheet}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(20_30_24/0.5)]" />
            <Dialog.Content className="bg-paper text-forest fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[520px] flex-col gap-3 rounded-t-3xl p-5 pb-6 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-3xl">
              <span aria-hidden="true" className="bg-forest/25 h-1 w-10 self-center rounded-full" />
              <div className="flex items-center justify-between">
                <Dialog.Title className="font-display text-xl font-bold">{tab.label} filters</Dialog.Title>
                <Dialog.Close className="bg-stone/60 flex size-10 items-center justify-center rounded-full" aria-label="Close">
                  <X className="size-4" />
                </Dialog.Close>
              </div>
              <Dialog.Description className="sr-only">Narrow the {tab.short} you see.</Dialog.Description>
              {filterFields(true)}
              <div className="flex gap-2.5 pt-1">
                <button type="button" onClick={() => setVals({})} className="border-forest min-h-12 flex-1 rounded-2xl border-[1.5px] text-sm font-semibold">
                  Reset
                </button>
                <button type="button" onClick={() => go()} className="bg-forest text-paper min-h-12 flex-[2] rounded-2xl text-sm font-semibold">
                  Show {tab.short}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {!live && campus ? (
          <div role="status" className="border-sunflower/45 bg-sunflower/12 flex flex-wrap items-center justify-between gap-3.5 rounded-[22px] border p-5">
            <div className="flex max-w-[640px] items-start gap-3">
              <span className="bg-sunflower text-forest flex size-10 shrink-0 items-center justify-center rounded-xl">
                <AlertTriangle className="size-[18px]" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1">
                <span className="font-display text-lg font-bold">We are not at {campus.code} yet</span>
                <span className="text-paper/85 text-sm leading-normal">
                  Sync is live at {liveCampus?.code ?? 'KWASU'} for now. We are coming here soon, so nothing is listed yet.
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/?topic=general#contact" className="bg-sunflower text-forest flex min-h-11 items-center rounded-full px-4 text-sm font-bold">
                Tell us to come
              </Link>
              {liveCampus && (
                <button type="button" onClick={() => setCampus(liveCampus.id)} className="border-paper/35 flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold">
                  Explore {liveCampus.code}
                </button>
              )}
            </div>
          </div>
        ) : tab.key === 'dispatch' ? (
          <Empty title="Dispatch is coming" text="Pickups, errands and moves with riders near campus. We are getting it ready." />
        ) : cards.length === 0 ? (
          <Empty
            title={`No ${tab.short} listed yet`}
            text={`We only show ${tab.short} Sync has checked. Run one near campus?`}
            cta={{ href: '/for-vendors', label: 'Become a vendor' }}
          />
        ) : (
          <>
            <ul className="no-scrollbar -mx-4 grid snap-x snap-mandatory auto-cols-[76%] grid-flow-col gap-3.5 overflow-x-auto px-4 pt-1.5 pb-2.5 sm:auto-cols-[minmax(240px,40%)] md:mx-0 md:px-0 xl:grid-flow-row xl:grid-cols-5 xl:overflow-visible">
              {cards.map((c) => (
                <li key={c.id} className="snap-start">
                  <Card c={c} />
                </li>
              ))}
            </ul>
            <Link
              href={tab.key === 'hostels' ? '/hostels' : `/${tab.key}`}
              className="border-paper/30 flex min-h-11 items-center gap-2 self-center rounded-full border px-5 text-sm font-semibold"
            >
              See all {tab.short} <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

function Card({ c }: { c: RailCard }) {
  return (
    <Link
      href={c.href}
      className="bg-paper text-forest flex h-full flex-col overflow-hidden rounded-[22px] shadow-[0_18px_40px_rgb(0_0_0/0.18)] transition-transform duration-200 hover:-translate-y-1 motion-reduce:transition-none"
    >
      <div className="bg-sage relative aspect-[3/4] shrink-0 overflow-hidden">
        {c.image ? (
          <Image src={c.image} alt="" fill sizes="(max-width: 640px) 76vw, 260px" className="object-cover" />
        ) : (
          // No photo on the row: a quiet tile, not a stock image.
          <span className="text-forest/50 absolute inset-0 flex items-center justify-center">
            <MapPin className="size-10" aria-hidden="true" />
          </span>
        )}
        {c.featured && (
          <span className="bg-sunflower text-forest absolute top-2.5 left-2.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider uppercase">
            Featured
          </span>
        )}
        {c.verified && (
          <span role="img" aria-label="Verified by Sync" title="Verified by Sync" className="bg-forest text-sage absolute top-2.5 right-2.5 flex size-[26px] items-center justify-center rounded-full">
            <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3.5 pt-3 pb-3.5">
        <span className="font-display text-base leading-tight font-semibold">{c.name}</span>
        {c.place && (
          <span className="text-moss flex items-center gap-1 text-[13px]">
            <MapPin className="text-leaf size-3" aria-hidden="true" />
            {c.place}
          </span>
        )}
        {c.meta && <span className="mt-auto pt-1.5 text-[13.5px] font-semibold">{c.meta}</span>}
      </div>
    </Link>
  );
}

function Empty({ title, text, cta }: { title: string; text: string; cta?: { href: string; label: string } }) {
  return (
    <div className="bg-paper/[0.06] border-paper/15 flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-dashed p-6">
      <div className="flex flex-col gap-1">
        <span className="font-display text-lg font-bold">{title}</span>
        <span className="text-paper/80 text-sm">{text}</span>
      </div>
      {cta && (
        <Link href={cta.href} className="bg-sunflower text-forest flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold">
          {cta.label} <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
