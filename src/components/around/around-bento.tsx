/**
 * AroundBento - "What's popping" on the landing page AND at the top of /around.
 *
 * One component for both so they cannot drift (the founder's design, Nov 2026):
 *   1. Weather strip: real weather (Open-Meteo, server-fetched, passed in) and
 *      plans for the time of day, each a link to a real section.
 *   2. The gist near you: the public feed (gist_posts), with filters, "Same
 *      here", report, and Drop gist. Words are masked by the database.
 *   3. Students are saying: the campus poll (polls), hidden when there is none.
 *   4. Daily dose: a rotating line of motivation. Static copy, honest as is.
 *   5. Your campus guide: six doors into the sections that answer them.
 *
 * Follows the campus the visitor picked (useCampusChoice). A campus Sync is not
 * live at gets a plain "not here yet" instead of an empty feed.
 *
 * Written in palette colours like the rest of the landing, so the `.landing`
 * dark-mode remap applies; /around wraps it in `.landing` too.
 */
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  ArrowRight,
  Check,
  Flag,
  GraduationCap,
  Map as MapIcon,
  Megaphone,
  Moon,
  Plus,
  Printer,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sun,
  Ticket,
  Trash2,
  UtensilsCrossed,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import { NavIcon } from '@/components/layouts/nav-icon';
import { CampusLocationPicker } from '@/components/layouts/campus-location-picker';
import { DoodleBackdrop } from '@/components/shared/doodle-backdrop';
import { useCampusChoice } from '@/hooks/use-campus-choice';
import {
  useCampusPoll,
  useDeleteGist,
  useDropGist,
  useGistFeed,
  useMyVote,
  usePollResults,
  useReportGist,
  useToggleSameHere,
  useVote,
  type GistKind,
  type GistPost,
} from '@/modules/around/gist-hooks';
import type { CampusWeather } from '@/app/(marketing)/landing-data';

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

const GUIDES: { label: string; href: string; Icon: LucideIcon }[] = [
  { label: 'Getting around', href: '/around#map', Icon: MapIcon },
  { label: 'Eat well on a budget', href: '/food', Icon: UtensilsCrossed },
  { label: 'Safety after dark', href: '/legal/safety', Icon: ShieldCheck },
  { label: 'Printing and photocopy spots', href: '/around#map', Icon: Printer },
  { label: 'Where to hang out', href: '/hotspots', Icon: Ticket },
  { label: 'Freshers: settling in', href: '/hostels', Icon: GraduationCap },
];

const DOSES = [
  'Small progress is still progress. Open that book for twenty minutes.',
  'You do not need a perfect plan. You need the next step.',
  'Drink water, sleep early, read one page. Future you says thanks.',
  'Your CGPA is a number, not your worth. Keep going.',
  'Show up for the 8am. The rest of the day gets easier.',
  'Ask the question in class. Someone else was wondering too.',
];

const KIND: Record<GistKind, { label: string; Icon: LucideIcon; chip: string; avatar: string }> = {
  alert: { label: 'Alert', Icon: Zap, chip: 'bg-forest text-paper', avatar: 'bg-forest text-paper' },
  gist: { label: 'Gist', Icon: Megaphone, chip: 'bg-sage text-forest', avatar: 'bg-sage text-forest' },
  deal: { label: 'Deal', Icon: UtensilsCrossed, chip: 'bg-leaf text-paper', avatar: 'bg-leaf text-paper' },
  event: { label: 'Event', Icon: Ticket, chip: 'bg-cream-deep text-forest', avatar: 'bg-cream-deep text-forest' },
};

const FILTERS: { key: 'all' | GistKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'gist', label: 'Gists' },
  { key: 'alert', label: 'Alerts' },
  { key: 'event', label: 'Events' },
  { key: 'deal', label: 'Deals' },
];

function lagosPart(): Part {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }).format(new Date()),
  );
  return h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
}

const card = 'bg-paper rounded-[26px] shadow-[0_14px_36px_rgb(52_78_65/0.1)]';
const kicker = 'text-moss font-mono text-[11px] tracking-wider uppercase';

export function AroundBento({
  weather,
  headingLevel = 'h2',
}: {
  weather: CampusWeather | null;
  /** h1 on /around, where this is the page title; h2 on the landing. */
  headingLevel?: 'h1' | 'h2';
}) {
  const { campus, live } = useCampusChoice();
  // "KWASU, Malete": the short code plus the town from the campus name.
  const town = campus?.name.split(',')[1]?.trim();
  const campusLabel = campus ? (town ? `${campus.code}, ${town}` : campus.code) : 'KWASU, Malete';
  const campusId = campus?.id ?? null;
  // Computed once per mount; the plans do not need to tick over live.
  const [part] = useState<Part>(lagosPart);
  const greeting =
    part === 'morning' ? 'Good morning' : part === 'afternoon' ? 'Good afternoon' : part === 'evening' ? 'Good evening' : 'Late night';
  const day = part === 'night' ? 'tonight' : `this ${part}`;
  const night = weather ? !weather.isDay : part === 'night' || part === 'evening';
  const H = headingLevel;

  return (
    <section id="around" className="bg-stone text-forest px-4 pt-16 pb-20 md:px-8 md:pt-[72px] md:pb-[88px]">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            <span className="text-moss flex items-center gap-2 font-mono text-[11.5px] tracking-wider uppercase">
              <span className="live-dot bg-leaf size-2 rounded-full" />
              Around you · Live
            </span>
            <H className="font-display text-[clamp(28px,3.4vw,44px)] leading-[1.05] font-bold tracking-[-0.03em]">
              What&rsquo;s popping in <span className="text-leaf">{campusLabel}</span>
            </H>
          </div>
          <CampusLocationPicker />
        </div>

        {/* 1. Weather + plans */}
        <div className="bg-sage flex flex-col gap-3 rounded-[26px] p-3 md:flex-row md:items-center md:p-3.5">
          <div className="flex items-center justify-between gap-4 px-2 md:w-64 md:shrink-0">
            <div>
              <p className={kicker}>{greeting}</p>
              {weather ? (
                <p className="mt-0.5 flex items-baseline gap-2">
                  <span className="font-display text-[34px] leading-none font-bold">{weather.tempC}°C</span>
                  <span className="text-sm font-semibold">{weather.condition}</span>
                </p>
              ) : (
                <p className="font-display mt-0.5 text-2xl font-bold">{campus?.code ?? 'KWASU'}</p>
              )}
              {weather && <p className="text-moss text-xs">{campusLabel}</p>}
            </div>
            {night ? <Moon className="size-8" aria-hidden="true" /> : <Sun className="size-8" aria-hidden="true" />}
          </div>
          <div className="bg-paper flex min-w-0 flex-1 flex-col gap-1 rounded-[20px] p-2 md:flex-row md:items-center md:gap-2">
            <p className={cn(kicker, 'px-2 pt-1 md:shrink-0 md:pt-0')}>Plan for {day}</p>
            {PLANS[part].map((p) => (
              <Link
                key={p.label}
                href={p.href}
                className="hover:bg-stone/60 flex min-h-11 flex-1 items-center gap-3 rounded-xl px-2 text-sm font-medium transition-colors"
              >
                <span className="bg-stone flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <NavIcon name={p.icon} size={16} solid />
                </span>
                <span className="flex-1">{p.label}</span>
                <ArrowRight className="size-3.5 opacity-60" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>

        {/* 2-4. Feed, poll, daily dose */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8 lg:row-span-2">
            <GistFeed campusId={campusId} campusLabel={campusLabel} live={live} />
          </div>
          {live && <PollCard campusId={campusId} campusLabel={campusLabel} />}
          <DailyDose />
        </div>

        {/* 5. Guides */}
        <div className={cn(card, 'flex flex-col gap-3 p-5')}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-display text-[19px] font-bold">Your {campusLabel} guide</span>
            <Link href="/around" className="text-leaf shrink-0 text-[13px] font-semibold whitespace-nowrap">
              All guides
            </Link>
          </div>
          <ul className="no-scrollbar -mx-5 grid auto-cols-[42%] grid-flow-col gap-3 overflow-x-auto px-5 sm:auto-cols-[30%] lg:mx-0 lg:grid-flow-row lg:grid-cols-6 lg:px-0">
            {GUIDES.map((g) => (
              <li key={g.label}>
                <Link
                  href={g.href}
                  className="border-forest/12 hover:border-forest/30 flex h-full min-h-[100px] flex-col justify-between gap-4 rounded-2xl border p-3.5 transition-colors"
                >
                  <span className="bg-stone flex size-9 items-center justify-center rounded-xl">
                    <g.Icon className="size-[18px]" fill="currentColor" fillOpacity={0.15} aria-hidden="true" />
                  </span>
                  <span className="text-sm leading-snug font-semibold">{g.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ── The gist ──────────────────────────────────────────────────────────── */

function GistFeed({ campusId, campusLabel, live }: { campusId: string | null; campusLabel: string; live: boolean }) {
  const [filter, setFilter] = useState<'all' | GistKind>('all');
  const { data: posts = [], isLoading } = useGistFeed(live ? campusId : null);
  const shown = useMemo(() => (filter === 'all' ? posts : posts.filter((p) => p.kind === filter)), [posts, filter]);

  return (
    <div className={cn(card, 'flex h-full min-w-0 flex-col gap-3 p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="font-display text-[19px] font-bold">The gist near you</span>
        {live && <DropGist campusId={campusId} />}
      </div>

      {!live ? (
        <Empty title={`We are not at ${campusLabel} yet`} text="The gist feed opens when Sync launches here. Pick a live campus to see what is happening there." />
      ) : (
        <>
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="tablist" aria-label="Filter the gist">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold',
                  filter === f.key ? 'bg-forest text-paper border-forest' : 'border-forest/20',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <ul className="flex flex-col gap-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="bg-stone/60 h-20 animate-pulse rounded-2xl" />
              ))}
            </ul>
          ) : shown.length === 0 ? (
            <Empty
              title={filter === 'all' ? 'No gist yet' : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} yet`}
              text={`Be the first to put ${campusLabel} on. Light back on your street? A deal worth knowing? Drop it.`}
            />
          ) : (
            <ul className="divide-forest/10 flex flex-col divide-y">
              {shown.map((p) => (
                <GistRow key={p.id} post={p} campusLabel={campusLabel} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function GistRow({ post, campusLabel }: { post: GistPost; campusLabel: string }) {
  const k = KIND[post.kind];
  const same = useToggleSameHere();
  const report = useReportGist();
  const del = useDeleteGist();
  const ago = formatDistanceToNowStrict(new Date(post.createdAt), { addSuffix: false })
    .replace(/ seconds?/, 's')
    .replace(/ minutes?/, 'm')
    .replace(/ hours?/, 'h')
    .replace(/ days?/, 'd');

  return (
    <li className="flex gap-3 py-3.5">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', k.avatar)}>
        <k.Icon className="size-[18px]" fill="currentColor" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[15px] font-bold">{post.authorName}</span>
          <span className="text-moss text-xs">
            {campusLabel} · {ago}
          </span>
          <span className={cn('rounded px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider uppercase', k.chip)}>
            {k.label}
          </span>
        </p>
        <p className="mt-1 text-[15px] leading-snug break-words">{post.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={post.reacted}
            disabled={same.isPending}
            onClick={() => same.mutate({ postId: post.id, on: !post.reacted })}
            className={cn(
              'flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold',
              post.reacted ? 'bg-forest text-paper border-forest' : 'border-forest/20',
            )}
          >
            <Check className="size-3.5" aria-hidden="true" />
            Same here{post.sameHere > 0 && ` · ${post.sameHere}`}
          </button>
          {post.mine ? (
            <button
              type="button"
              onClick={() => del.mutate(post.id, { onSuccess: () => toast('Removed') })}
              className="text-moss flex min-h-8 items-center gap-1.5 rounded-full px-2 text-xs font-medium"
            >
              <Trash2 className="size-3.5" aria-hidden="true" /> Delete
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                report.mutate(
                  { postId: post.id },
                  { onSuccess: () => toast('Thanks. Our team will take a look.') },
                )
              }
              className="text-moss flex min-h-8 items-center gap-1.5 rounded-full px-2 text-xs font-medium"
            >
              <Flag className="size-3.5" aria-hidden="true" /> Report
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function DropGist({ campusId }: { campusId: string | null }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<GistKind>('gist');
  const [body, setBody] = useState('');
  const drop = useDropGist(campusId);
  const left = 280 - body.length;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="bg-forest text-paper flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold">
        <Plus className="text-sunflower size-3.5" strokeWidth={3} aria-hidden="true" /> Drop gist
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(20_30_24/0.5)]" />
        <Dialog.Content className="bg-panel text-content fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[520px] flex-col gap-4 rounded-t-3xl p-5 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-3xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-display text-xl font-bold">Drop gist</Dialog.Title>
              <Dialog.Description className="text-content-muted mt-1 text-sm">
                Everyone on campus can see this for 3 days. Keep it kind and true.
              </Dialog.Description>
            </div>
            <Dialog.Close className="bg-surface-deep flex size-10 shrink-0 items-center justify-center rounded-full" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim().length < 3) return;
              drop.mutate(
                { kind, body: body.trim() },
                {
                  onSuccess: () => {
                    setBody('');
                    setOpen(false);
                    toast('Posted');
                  },
                  onError: (err) => toast(err instanceof Error ? err.message : 'Could not post that'),
                },
              );
            }}
          >
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Type</legend>
              {(Object.keys(KIND) as GistKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    'min-h-9 rounded-full border px-3.5 text-[13px] font-semibold',
                    kind === k ? 'bg-ink text-cream border-transparent' : 'border-line/20',
                  )}
                >
                  {KIND[k].label}
                </button>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">What is happening?</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, 280))}
                rows={4}
                placeholder="What is happening around you?"
                className="border-line/15 bg-surface focus:border-line w-full resize-none rounded-xl border p-3 text-[15px]"
              />
              <span className={cn('self-end text-xs', left < 20 ? 'text-warning' : 'text-content-muted')}>{left}</span>
            </label>
            <p className="text-content-muted text-xs">
              No phone numbers or addresses. Posts that get reported are hidden until our team checks them.
            </p>
            <button
              type="submit"
              disabled={drop.isPending || body.trim().length < 3}
              className="bg-sunflower text-forest min-h-12 rounded-full text-[15px] font-bold disabled:opacity-50"
            >
              {drop.isPending ? 'Posting...' : 'Post'}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ── Poll ──────────────────────────────────────────────────────────────── */

function PollCard({ campusId, campusLabel }: { campusId: string | null; campusLabel: string }) {
  const { data: poll } = useCampusPoll(campusId);
  const { data: myVote } = useMyVote(poll?.id);
  const voted = !!myVote;
  const { data: results } = usePollResults(poll?.id, voted);
  const vote = useVote(poll?.id);
  if (!poll) return null;
  const total = results ? [...results.values()].reduce((a, b) => a + b, 0) : 0;

  return (
    <div className={cn(card, 'flex min-w-0 flex-col gap-3 p-5 lg:col-span-4')}>
      <p className={kicker}>Students are saying</p>
      <p className="font-display text-lg leading-tight font-bold">{poll.question.replace('KWASU', campusLabel)}</p>
      <ul className="flex flex-col gap-2">
        {poll.options.map((o) => {
          const n = results?.get(o.id) ?? 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const mine = myVote === o.id;
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={voted || vote.isPending}
                aria-pressed={mine}
                onClick={() => vote.mutate(o.id)}
                className={cn(
                  'relative flex min-h-11 w-full items-center justify-between overflow-hidden rounded-xl border px-3.5 text-left text-sm font-medium',
                  mine ? 'border-forest' : 'border-forest/20',
                )}
              >
                {voted && (
                  <span aria-hidden="true" className="bg-sage/45 absolute inset-y-0 left-0" style={{ width: `${pct}%` }} />
                )}
                <span className="relative">{o.label}</span>
                {voted ? (
                  <span className="relative text-xs font-semibold">{pct}%</span>
                ) : (
                  <span className="border-forest/35 relative size-[18px] rounded-full border-2" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {voted && <p className="text-moss text-xs">{total} vote{total === 1 ? '' : 's'} so far</p>}
    </div>
  );
}

/* ── Daily dose ────────────────────────────────────────────────────────── */

function DailyDose() {
  // Start on the day's line so everyone sees the same one today.
  const [i, setI] = useState(() => Math.floor(Date.now() / 86_400_000) % DOSES.length);
  const line = DOSES[i];
  return (
    <div className="bg-forest text-paper relative isolate flex min-w-0 flex-col justify-between gap-5 overflow-hidden rounded-[26px] p-5 lg:col-span-4">
      <DoodleBackdrop tile={420} className="text-paper/[0.07]" />
      <div>
        <p className="text-sage font-mono text-[11px] tracking-wider uppercase">Daily dose</p>
        <p key={i} className="font-display sync-fade mt-2 text-[22px] leading-tight font-bold">
          {line}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setI((n) => (n + 1) % DOSES.length)}
          className="bg-sage text-forest flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" /> Another one
        </button>
        <button
          type="button"
          onClick={async () => {
            const text = `${line} - via Sync`;
            try {
              if (navigator.share) await navigator.share({ text });
              else {
                await navigator.clipboard.writeText(text);
                toast('Copied');
              }
            } catch {
              /* share sheet dismissed */
            }
          }}
          className="border-paper/35 flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold"
        >
          <Share2 className="size-3.5" aria-hidden="true" /> Share
        </button>
      </div>
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="border-forest/20 flex flex-1 flex-col justify-center rounded-2xl border border-dashed p-5">
      <p className="font-display text-[17px] font-bold">{title}</p>
      <p className="text-moss mt-1 text-sm leading-relaxed">{text}</p>
    </div>
  );
}
