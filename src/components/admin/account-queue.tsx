/**
 * The parts every verification queue is made of: a filter bar, and a card that
 * opens to reveal the folder.
 *
 * WHY THE DOCUMENTS ARE BEHIND A CLICK NOW
 *   Every queue used to render every folder expanded   four signed image
 *   requests per account, on first paint, for accounts the reviewer was only
 *   scrolling past. With a handful of businesses that was merely wasteful; the
 *   real cost is that the screen stopped being scannable, because one pending
 *   submission looked exactly as heavy as twenty verified ones nobody needs to
 *   look at again.
 *
 *   A collapsed card carries what the scan needs   the face, the name, the
 *   state   and opening one is the moment the reviewer has actually chosen it.
 *   The signed URLs are fetched by <VerificationReview> on mount, so a card
 *   that is never opened never requests anybody's passport.
 *
 * WHY THE FILTER BAR IS SHARED
 *   Vendors, landlords and riders are three different tables and one identical
 *   question: who is waiting on me. Three copies of these chips had already
 *   started to differ   the vendor queue counted, the landlord list did not
 *   filter at all   so it is one component with the counts computed from
 *   whatever it is given.
 */
'use client';

/* eslint-disable @next/next/no-img-element -- a signed, expiring url on a
   private bucket. next/image would proxy and cache the identity photo, and the
   cached copy would outlive the signature. */

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import { Badge, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

export const STATUS_BADGE: Record<string, string> = {
  verified: 'bg-emerald-500/10 text-emerald-600',
  pending: 'bg-amber-500/10 text-amber-600',
  rejected: 'bg-rose-500/10 text-rose-600',
  unverified: 'bg-ink/5 text-content-muted',
};

/**
 * The four verification states. 'all' is not in the list: it is prepended by
 * QueueFilterBar, because it is not a state   it is the absence of a filter.
 */
export const STATUS_FILTERS = ['pending', 'unverified', 'verified', 'rejected'] as const;

export function chipClass(active: boolean) {
  return cn(
    'cursor-pointer rounded-full border px-3 py-1 text-xs capitalize transition-colors',
    active
      ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
      : 'border-line/10 text-content-muted hover:text-content',
  );
}

/**
 * Counts per status, plus `all`. Extra flags (suspended, blocked) are counted by
 * the caller, because only the caller knows what its rows carry.
 */
/**
 * ONE ROW CAN BE IN TWO STATES AT ONCE.
 *
 * A person who is a verified student and a pending landlord holds two separate
 * decisions, and a queue that files them under one of the two is wrong about
 * the other: filter by Pending and the landlord waiting on you does not appear,
 * because the row was filed as verified.
 *
 * `statuses` is that person's set. Rows without it   every other queue, which
 * lists one kind of account and therefore one decision   fall back to the
 * single status and count exactly as before. Deduplicated, so somebody verified
 * twice counts once towards Verified rather than twice.
 */
export function statusesOf<T extends { verificationStatus: string; statuses?: string[] }>(
  row: T,
): string[] {
  return row.statuses && row.statuses.length > 0
    ? [...new Set(row.statuses)]
    : [row.verificationStatus];
}

export function useStatusCounts<T extends { verificationStatus: string; statuses?: string[] }>(
  rows: T[],
) {
  return useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) for (const s of statusesOf(r)) c[s] = (c[s] ?? 0) + 1;
    return c;
  }, [rows]);
}

/**
 * Land on the work when there is work, else on everything.
 *
 * A `useState` initialiser rather than an effect: the right tab on first paint,
 * with no flash of the wrong list. A queue whose first screen is not the thing
 * waiting on you is not a queue.
 */
export function useQueueFilter(counts: Record<string, number>) {
  return useState<string>(() => (counts.pending ? 'pending' : 'all'));
}

export function QueueFilterBar({
  filter,
  onFilter,
  search,
  onSearch,
  counts,
  placeholder,
  /** Extra chips beyond the four statuses   'suspended', 'blocked'. */
  extra = [],
}: {
  filter: string;
  onFilter: (f: string) => void;
  search: string;
  onSearch: (s: string) => void;
  counts: Record<string, number>;
  placeholder: string;
  extra?: readonly string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={placeholder}
        className="max-w-xs"
      />
      {/* 'ALL' FIRST. It used to trail the row, which put the way BACK from a
          filter at the end of a line that grows every time a state is added  
          and on a narrow window it was the chip that wrapped. Reading order is
          now the same as the mental one: everything, then the narrowings of it.

          It is still not the default: useQueueFilter opens on 'pending' when
          anything is pending, because a queue exists to be worked through. */}
      {['all', ...STATUS_FILTERS, ...extra].map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onFilter(f)}
          className={chipClass(filter === f)}
        >
          {f}
          {counts[f] ? <span className="ml-1.5 opacity-60">{counts[f]}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Face({ url, className }: { url?: string; className?: string }) {
  return (
    <span
      className={cn(
        'border-line/10 bg-ink/30 flex shrink-0 items-center justify-center overflow-hidden',
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        // Not "no photo" as an error   somebody who has not submitted yet
        // legitimately has none.
        <UserRound className="text-content-muted size-6" aria-hidden="true" />
      )}
    </span>
  );
}

/**
 * A queue card: face, name, state and one line of context, opening onto
 * whatever the caller puts inside it.
 *
 * The whole header is the toggle, so the click target is the card rather than a
 * chevron somebody has to aim at. `children` is only mounted while open   that
 * is what keeps the signed-URL requests inside <VerificationReview> from firing
 * for every account on the page.
 */
export function AccountCard({
  name,
  status,
  faceUrl,
  meta,
  flags,
  children,
  defaultOpen = false,
}: {
  name: string;
  status: string;
  faceUrl?: string;
  meta: ReactNode;
  /** Badges after the status one   fraud block, suspension. */
  flags?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-line/10 bg-panel hover:border-line/25 flex flex-col rounded-xl border transition-colors">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex cursor-pointer items-start gap-3 p-4 text-left"
      >
        <Face url={faceUrl} className="size-14 rounded-xl border" />
        <div className="min-w-0 flex-1">
          <p className="text-content flex flex-wrap items-center gap-2 font-medium">
            <span className="truncate">{name}</span>
            <Badge className={STATUS_BADGE[status] ?? STATUS_BADGE.unverified}>{status}</Badge>
            {flags}
          </p>
          {meta}
        </div>
        <ChevronDown
          className={cn(
            'text-content-muted size-4 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && <div className="border-line/10 border-t p-4">{children}</div>}
    </div>
  );
}
