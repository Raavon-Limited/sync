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

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
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
  Send,
  Share2,
  Smile,
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
import { EmojiPicker } from '@/components/shared/emoji-picker';
import { useCampusChoice } from '@/hooks/use-campus-choice';
import { useSession } from '@/providers/session-provider';
import {
  GIST_KINDS,
  useCampusPoll,
  useCreatePoll,
  useDeleteGist,
  useDropGist,
  useGistFeed,
  useGistLive,
  useMyDisplayName,
  usePollResults,
  useReportGist,
  useReportPoll,
  useSetDisplayName,
  useReactToGist,
  REACTIONS,
  useVote,
  votedHere,
  type GistKind,
  type GistPost,
  type PollKind,
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
                  className="border-forest/12 hover:border-forest/30 flex h-full items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors"
                >
                  <span className="bg-stone flex size-8 shrink-0 items-center justify-center rounded-lg">
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

/** What the field asks for, by what is being posted. */
const PLACEHOLDER: Record<GistKind, string> = {
  gist: "What's popping? Type it here...",
  alert: 'Light out? Road blocked? Say it here...',
  deal: 'Share a deal worth knowing...',
  event: "What's on, where and when...",
};

function GistFeed({ campusId, campusLabel, live }: { campusId: string | null; campusLabel: string; live: boolean }) {
  const [filter, setFilter] = useState<'all' | GistKind>('all');
  // First 20; "Show more" reaches the full public window of 50.
  const [limit, setLimit] = useState(20);
  const { data: posts = [], isLoading } = useGistFeed(live ? campusId : null, limit);
  // New posts and reactions from anyone on this campus appear at once.
  useGistLive(live ? campusId : null);
  const shown = useMemo(() => (filter === 'all' ? posts : posts.filter((p) => p.kind === filter)), [posts, filter]);

  return (
    <div className={cn(card, 'flex h-full min-w-0 flex-col gap-3 p-5')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-[19px] font-bold">The gist near you</span>
        <span className="text-moss text-xs">Last 24 hours</span>
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
              title={filter === 'all' ? 'No gist yet today' : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} today`}
              text={`Be the first to put ${campusLabel} on. Light back on your street? A deal worth knowing?`}
            />
          ) : (
            <>
              <ul className="divide-forest/10 flex flex-col divide-y">
                {shown.map((p) => (
                  <GistRow key={p.id} post={p} />
                ))}
              </ul>
              {limit < 50 && posts.length >= limit && (
                <button
                  type="button"
                  onClick={() => setLimit(50)}
                  className="border-forest/20 min-h-10 self-center rounded-full border px-4 text-[13px] font-semibold"
                >
                  Show more
                </button>
              )}
            </>
          )}

          {/* BELOW the posts, like a chat: you read what is there, then add to
              it. mt-auto pins it to the bottom of the card when the feed is
              short, so it never floats in the middle of an empty card. */}
          <div className="mt-auto pt-1">
            <Composer campusId={campusId} />
          </div>
        </>
      )}
    </div>
  );
}

/** Type and post in place. Signed-out visitors are sent to sign in on Post. */
function Composer({ campusId }: { campusId: string | null }) {
  const [kind, setKind] = useState<GistKind>('gist');
  const [body, setBody] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const { isAuthenticated } = useSession();
  const { data: name } = useMyDisplayName();
  const drop = useDropGist(campusId);
  const left = 280 - body.length;
  const ref = useRef<HTMLTextAreaElement>(null);

  // The field grows with what is typed, up to about four lines, then scrolls.
  // A fixed `rows` either clipped a long gist or left a tall empty box.
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  };

  const insert = (e: string, focus = true) => {
    const el = ref.current;
    if (!el) return setBody((b) => (b + e).slice(0, 280));
    const s = el.selectionStart ?? body.length;
    const next = (body.slice(0, s) + e + body.slice(el.selectionEnd ?? s)).slice(0, 280);
    setBody(next);
    requestAnimationFrame(() => {
      if (focus) el.focus();
      // Moving the caret works on an unfocused field too, so the next emoji
      // still lands after this one.
      el.setSelectionRange(s + e.length, s + e.length);
      fit();
    });
  };

  const post = () => {
    if (body.trim().length < 2) return;
    drop.mutate(
      { kind, body: body.trim() },
      {
        onSuccess: () => {
          setBody('');
          setEmojiOpen(false);
          requestAnimationFrame(fit);
        },
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not post that'),
      },
    );
  };

  /*
   * ONE ROW, LIKE A CHAT BAR: + (what you are posting), emoji, the field, send.
   * The four kind chips used to sit in their own row under the field; they
   * live behind + now, and the placeholder and the line underneath say which
   * one is picked, so the choice is never hidden.
   */
  const roundBtn = 'hover:bg-stone flex size-11 shrink-0 items-center justify-center rounded-full transition-colors';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        post();
      }}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-end gap-1">
        <Popover.Root open={kindOpen} onOpenChange={setKindOpen}>
          <Popover.Trigger className={roundBtn} aria-label={`Posting a ${GIST_KINDS[kind].label}. Change`}>
            <Plus className="size-5" aria-hidden="true" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="start"
              sideOffset={8}
              className="bg-panel border-line/10 shadow-pop z-50 flex w-64 flex-col gap-0.5 rounded-2xl border p-1.5"
            >
              {(Object.keys(GIST_KINDS) as GistKind[]).map((k) => {
                const K = KIND[k];
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kind === k}
                    onClick={() => {
                      setKind(k);
                      setKindOpen(false);
                      ref.current?.focus();
                    }}
                    className="hover:bg-surface-deep flex items-center gap-3 rounded-xl px-2.5 py-2 text-left"
                  >
                    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', K.avatar)}>
                      <K.Icon className="size-4" fill="currentColor" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{GIST_KINDS[k].label}</span>
                      <span className="text-content-muted block text-xs">{GIST_KINDS[k].hint}</span>
                    </span>
                    {kind === k && <Check className="size-4 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Popover.Root open={emojiOpen} onOpenChange={setEmojiOpen}>
          <Popover.Trigger className={roundBtn} aria-label="Add emoji">
            <Smile className="size-5" aria-hidden="true" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="start"
              sideOffset={8}
              collisionPadding={8}
              // Back to the field when the picker closes, so typing carries on.
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                ref.current?.focus();
              }}
              className="z-50"
            >
              {/* Stays open across picks, like a chat app. insert(e, false)
                  leaves focus in the picker: moving it to the field would
                  count as focus-outside and close the popover after one. */}
              <EmojiPicker onSelect={(e) => insert(e, false)} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <div className="bg-stone flex min-h-11 min-w-0 flex-1 items-end gap-2 rounded-[22px] px-4 py-2.5">
          <label className="sr-only" htmlFor="gist-input">
            What is happening around you?
          </label>
          <textarea
            id="gist-input"
            ref={ref}
            value={body}
            onChange={(e) => {
              setBody(e.target.value.slice(0, 280));
              fit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                post();
              }
            }}
            rows={1}
            placeholder={PLACEHOLDER[kind]}
            className="placeholder:text-moss/70 block max-h-28 min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-6 outline-none"
          />
          {/* Only when it matters: a counter that always reads "280" is noise. */}
          {left < 40 && (
            <span className={cn('shrink-0 text-xs leading-6', left < 20 ? 'text-coral-deep' : 'text-moss')}>
              {left}
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={drop.isPending || body.trim().length < 2}
          aria-label="Post"
          className="bg-forest text-paper flex size-11 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40"
        >
          <Send className="size-4.5" aria-hidden="true" />
        </button>
      </div>
      <p className="text-moss flex flex-wrap items-center gap-x-1.5 px-3 text-[11.5px]">
        <span>
          <strong className="text-forest">{GIST_KINDS[kind].label}</strong> · {GIST_KINDS[kind].hint}.
        </span>
        {isAuthenticated && (
          <span>
            Posting as <strong className="text-forest">{name ?? 'Anonymous'}</strong>
            {' · '}
            <DisplayNameDialog current={name ?? null} />
          </span>
        )}
      </p>
    </form>
  );
}

function DisplayNameDialog({ current }: { current: string | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? '');
  const save = useSetDisplayName();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(current ?? '');
      }}
    >
      <Dialog.Trigger className="text-leaf font-semibold underline underline-offset-2">
        {current ? 'change' : 'set a display name'}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(20_30_24/0.5)]" />
        <Dialog.Content className="bg-panel text-content fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[440px] flex-col gap-4 rounded-t-3xl p-5 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-3xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-display text-xl font-bold">Your display name</Dialog.Title>
              <Dialog.Description className="text-content-muted mt-1 text-sm">
                Shown on your public gist and polls instead of your real name. Leave it empty to post as
                Anonymous.
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
              save.mutate(value, {
                onSuccess: () => {
                  setOpen(false);
                  toast('Saved');
                },
                onError: (err) => toast(err instanceof Error ? err.message : 'Could not save'),
              });
            }}
          >
            <input
              value={value}
              onChange={(e) => setValue(e.target.value.slice(0, 24))}
              placeholder="e.g. SafariBoy"
              autoComplete="nickname"
              className="border-line/15 bg-surface focus:border-line rounded-xl border px-3.5 py-3 text-[15px]"
            />
            <p className="text-content-muted text-xs">
              2 to 24 letters, numbers, spaces, dots or underscores. Staff can still see which account
              posted, and only share it when the law requires.
            </p>
            <button type="submit" disabled={save.isPending} className="bg-ink text-cream min-h-11 rounded-full text-sm font-semibold">
              {save.isPending ? 'Saving...' : 'Save'}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function GistRow({ post }: { post: GistPost }) {
  const k = KIND[post.kind];
  const react = useReactToGist();
  const report = useReportGist();
  const del = useDeleteGist();
  const ago = formatDistanceToNowStrict(new Date(post.createdAt))
    .replace(/ seconds?/, 's')
    .replace(/ minutes?/, 'm')
    .replace(/ hours?/, 'h');

  return (
    <li className="flex gap-3 py-3.5">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', k.avatar)}>
        <k.Icon className="size-[18px]" fill="currentColor" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[15px] font-bold">{post.authorName}</span>
          <span className="text-moss text-xs">{ago}</span>
          <span className={cn('rounded px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider uppercase', k.chip)}>
            {k.label}
          </span>
        </p>
        <p className="mt-1 text-[15px] leading-snug break-words">{post.body}</p>
        {/* WORD REACTIONS, anyone, signed in or not (20261124120000). One per
            person: tapping another word moves yours, tapping yours takes it
            back. One row that scrolls sideways on a narrow phone, so six
            words never push the post's own actions off screen. */}
        <div
          className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1"
          role="group"
          aria-label="React to this post"
        >
          {REACTIONS.map((r) => {
            const n = post.reactions[r.key] ?? 0;
            const on = post.myReaction === r.key;
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  react.mutate(
                    { postId: post.id, kind: r.key },
                    { onError: (err) => toast(err instanceof Error ? err.message : 'Could not react') },
                  )
                }
                className={cn(
                  'flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-colors',
                  on ? 'bg-forest text-paper border-forest' : 'border-forest/20 hover:bg-stone',
                )}
              >
                {r.label}
                {n > 0 && <span className={on ? 'text-paper/80' : 'text-moss'}>{n}</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex items-center gap-2">
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
              onClick={() => report.mutate(post.id, { onSuccess: () => toast('Thanks. Our team will take a look.') })}
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

/* ── Poll ──────────────────────────────────────────────────────────────── */

function PollCard({ campusId, campusLabel }: { campusId: string | null; campusLabel: string }) {
  const { data: poll } = useCampusPoll(campusId);
  // This browser's record of votes. The poll only arrives after hydration
  // (client query), so reading localStorage here cannot mismatch the server.
  const [justVoted, setVoted] = useState(false);
  const voted = justVoted || (poll ? votedHere(poll.id) : false);
  const { data: results } = usePollResults(poll?.id, voted);
  const vote = useVote(poll);
  const report = useReportPoll();
  const [picked, setPicked] = useState<string[]>([]);
  const [tag, setTag] = useState<boolean | undefined>(undefined);

  if (!poll) {
    return (
      <div className={cn(card, 'flex min-w-0 flex-col gap-3 p-5 lg:col-span-4')}>
        <p className={kicker}>Students are saying</p>
        <p className="font-display text-lg leading-tight font-bold">No poll running at {campusLabel}</p>
        <CreatePollDialog campusId={campusId} label="Start a poll" />
      </div>
    );
  }

  const ranked = poll.kind === 'ranked';
  const multi = poll.kind === 'multi';
  const toggle = (id: string) => {
    if (poll.kind === 'single') return setPicked([id]);
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= poll.maxChoices ? cur : [...cur, id],
    );
  };
  const submit = () =>
    vote.mutate(picked, {
      onSuccess: (r) => {
        setVoted(true);
        setTag(r.inVicinity);
        if (r.already) toast('You have already voted on this poll');
      },
      onError: (err) => toast(err instanceof Error ? err.message : 'Could not save your vote'),
    });

  const total = results ? [...results.score.values()].reduce((a, b) => a + b, 0) : 0;
  const instruction =
    poll.kind === 'single'
      ? 'Pick one'
      : multi
        ? `Pick up to ${poll.maxChoices}`
        : `Tap in order: your top ${poll.maxChoices}, best first`;

  return (
    <div className={cn(card, 'flex min-w-0 flex-col gap-3 p-5 lg:col-span-4')}>
      <div className="flex items-center justify-between gap-2">
        <p className={kicker}>Students are saying</p>
        <span className="bg-stone rounded-full px-2 py-0.5 text-[10.5px] font-semibold">
          {poll.scope === 'local' ? 'Near campus only' : 'Open to all'}
        </span>
      </div>
      <p className="font-display text-lg leading-tight font-bold">{poll.question.replace('KWASU', campusLabel)}</p>
      {!voted && <p className="text-moss -mt-1 text-xs">{instruction}</p>}

      <ul className="flex flex-col gap-2">
        {poll.options.map((o) => {
          const n = results?.score.get(o.id) ?? 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const order = picked.indexOf(o.id);
          const on = order !== -1;
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={voted || vote.isPending}
                aria-pressed={on}
                onClick={() => toggle(o.id)}
                className={cn(
                  'relative flex min-h-11 w-full items-center justify-between gap-2 overflow-hidden rounded-xl border px-3.5 text-left text-sm font-medium',
                  on ? 'border-forest' : 'border-forest/20',
                )}
              >
                {voted && (
                  <span aria-hidden="true" className="bg-sage/45 absolute inset-y-0 left-0" style={{ width: `${pct}%` }} />
                )}
                <span className="relative min-w-0">
                  {o.label}
                  {voted && results && (
                    <span className="text-moss block text-[11px] font-normal">
                      {results.near.get(o.id) ?? 0} near campus · {results.far.get(o.id) ?? 0} from outside
                    </span>
                  )}
                </span>
                {voted ? (
                  <span className="relative shrink-0 text-xs font-semibold">{pct}%</span>
                ) : ranked ? (
                  <span
                    className={cn(
                      'relative flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                      on ? 'bg-forest text-paper border-forest' : 'border-forest/35',
                    )}
                    aria-hidden="true"
                  >
                    {on ? order + 1 : ''}
                  </span>
                ) : (
                  <span
                    className={cn(
                      'relative flex size-[18px] shrink-0 items-center justify-center border-2',
                      multi ? 'rounded-md' : 'rounded-full',
                      on ? 'bg-forest border-forest text-paper' : 'border-forest/35',
                    )}
                    aria-hidden="true"
                  >
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {!voted ? (
        <button
          type="button"
          onClick={submit}
          disabled={picked.length === 0 || vote.isPending}
          className="bg-forest text-paper min-h-11 rounded-full text-sm font-semibold disabled:opacity-40"
        >
          {vote.isPending ? 'Saving your vote...' : 'Vote'}
        </button>
      ) : (
        <p className="text-moss text-xs">
          {results?.ballots ?? 0} vote{results?.ballots === 1 ? '' : 's'} so far
          {ranked && ' · ranked by points'}
          {tag !== undefined && (tag ? ' · yours counted as near campus' : ' · yours counted as from outside')}
        </p>
      )}

      <div className="text-moss flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>by {poll.authorName}</span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => report.mutate(poll.id, { onSuccess: () => toast('Thanks. Our team will take a look.') })}
            className="flex items-center gap-1 font-medium"
          >
            <Flag className="size-3" aria-hidden="true" /> Report
          </button>
          <CreatePollDialog campusId={campusId} label="New poll" compact />
        </span>
      </div>
    </div>
  );
}

function CreatePollDialog({ campusId, label, compact }: { campusId: string | null; label: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [kind, setKind] = useState<PollKind>('single');
  const [maxChoices, setMax] = useState(3);
  const [scope, setScope] = useState<'open' | 'local'>('open');
  const [days, setDays] = useState(3);
  const [options, setOptions] = useState(['', '']);
  const create = useCreatePoll(campusId);
  const filled = options.filter((o) => o.trim()).length;

  const seg = (on: boolean) =>
    cn('min-h-9 flex-1 rounded-full border px-3 text-[13px] font-semibold', on ? 'bg-ink text-cream border-transparent' : 'border-line/20');

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={
          compact
            ? 'text-leaf flex items-center gap-1 font-semibold'
            : 'bg-forest text-paper flex min-h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold'
        }
      >
        <Plus className="size-3.5" aria-hidden="true" /> {label}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(20_30_24/0.5)]" />
        <Dialog.Content className="bg-panel text-content fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[520px] flex-col gap-4 overflow-y-auto rounded-t-3xl p-5 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-3xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-display text-xl font-bold">Start a poll</Dialog.Title>
              <Dialog.Description className="text-content-muted mt-1 text-sm">
                Anyone can vote, no account needed. One vote per person.
              </Dialog.Description>
            </div>
            <Dialog.Close className="bg-surface-deep flex size-10 shrink-0 items-center justify-center rounded-full" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(
                { question: question.trim(), kind, maxChoices: kind === 'single' ? 1 : maxChoices, scope, days, options },
                {
                  onSuccess: () => {
                    setOpen(false);
                    setQuestion('');
                    setOptions(['', '']);
                    toast('Poll is live');
                  },
                  onError: (err) => toast(err instanceof Error ? err.message : 'Could not create the poll'),
                },
              );
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Question</span>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, 160))}
                placeholder="Best hostel near the gate?"
                className="border-line/15 bg-surface rounded-xl border px-3.5 py-3 text-[15px]"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Options</span>
              {options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={o}
                    onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? e.target.value.slice(0, 80) : x)))}
                    placeholder={`Option ${i + 1}`}
                    className="border-line/15 bg-surface min-w-0 flex-1 rounded-xl border px-3.5 py-2.5 text-sm"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions((all) => all.filter((_, j) => j !== i))}
                      aria-label={`Remove option ${i + 1}`}
                      className="bg-surface-deep flex size-10 shrink-0 items-center justify-center rounded-xl"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <button type="button" onClick={() => setOptions((all) => [...all, ''])} className="text-leaf self-start text-sm font-semibold">
                  + Add option
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">How people answer</span>
              <div className="flex gap-1.5">
                <button type="button" className={seg(kind === 'single')} onClick={() => setKind('single')}>One answer</button>
                <button type="button" className={seg(kind === 'multi')} onClick={() => setKind('multi')}>Several</button>
                <button type="button" className={seg(kind === 'ranked')} onClick={() => setKind('ranked')}>Rank them</button>
              </div>
              {kind !== 'single' && (
                <label className="text-content-muted flex items-center gap-2 text-sm">
                  {kind === 'multi' ? 'Most picks per person' : 'Rank the top'}
                  <select
                    value={maxChoices}
                    onChange={(e) => setMax(Number(e.target.value))}
                    className="border-line/15 bg-surface rounded-lg border px-2 py-1"
                  >
                    {Array.from({ length: kind === 'ranked' ? 4 : 9 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Who can vote</span>
              <div className="flex gap-1.5">
                <button type="button" className={seg(scope === 'open')} onClick={() => setScope('open')}>Anyone</button>
                <button type="button" className={seg(scope === 'local')} onClick={() => setScope('local')}>Near campus only</button>
              </div>
              <p className="text-content-muted text-xs">
                {scope === 'open'
                  ? 'Everyone can vote; results show how many voted from near campus and from outside.'
                  : 'Voters share their location once; only people near campus are counted.'}
              </p>
            </div>

            <label className="text-content-muted flex items-center gap-2 text-sm">
              Runs for
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="border-line/15 bg-surface rounded-lg border px-2 py-1">
                {[1, 2, 3, 7, 14].map((d) => (
                  <option key={d} value={d}>
                    {d} day{d > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={create.isPending || question.trim().length < 5 || filled < 2}
              className="bg-sunflower text-forest min-h-12 rounded-full text-[15px] font-bold disabled:opacity-50"
            >
              {create.isPending ? 'Creating...' : 'Create poll'}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
