/**
 * The queue browser: filter chips, a card grid, a list toggle, and a click that
 * goes somewhere.
 *
 * THIS IS THE LANDLORD LIST, GENERALISED
 *   /admin/landlord got cards with faces and a grid/list toggle; vendors and
 *   riders got stacked accordions. Three screens answering one question   who is
 *   waiting on me   in three shapes, which is both harder to use and three
 *   places to change. The design here is the landlord one, unchanged; the other
 *   two now render through it.
 *
 * WHY CARDS AND WHY THE FACE
 *   A name and a badge is not how a reviewer recognises a submission they
 *   half-remember, and gives no signal about whether the folder is worth
 *   opening. The live photo is the one image every folder has and the same image
 *   the review screen holds against the ID, so the card carries it.
 *
 * THE TOGGLE IS NOT DECORATION
 *   Cards suit a handful of pending accounts, which is the normal case and
 *   therefore the default. The list suits a long tail   twenty verified vendors
 *   you are scrolling for one name   where a grid of faces reads slower than a
 *   column of text. Neither is wrong, so the choice is the reviewer's and it is
 *   remembered per screen, in localStorage, which can throw (private windows,
 *   blocked site data). Every access is guarded and the default survives.
 *
 * CLICKING GOES TO A PAGE, IT DOES NOT EXPAND
 *   The documents are the reason to open one of these, and they need room: a
 *   live photo beside a government ID, at a size you can actually judge. That is
 *   a page, not a panel wedged into a grid cell.
 */
/* eslint-disable @next/next/no-img-element -- a signed, expiring url on a
   private bucket. next/image would proxy and cache the identity photo, and the
   cached copy would outlive the signature. */
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, LayoutGrid, List, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { QueueFilterBar, STATUS_BADGE, useQueueFilter, useStatusCounts } from './account-queue';

export interface BrowserRow {
  id: string;
  /** Where clicking the card goes. */
  href: string;
  name: string;
  verificationStatus: string;
  /** Signed link to their live photo, when one has been uploaded. */
  faceUrl?: string;
  /** One line under the name. Rendered in both grid and list. */
  meta: ReactNode;
  /** Badges after the status one   fraud block, suspension. */
  flags?: ReactNode;
  /** Matched against the search box, lowercased by the caller's own rules. */
  searchText: string;
  /** Counts towards the `suspended` chip when the caller asks for one. */
  suspended?: boolean;
}

type View = 'grid' | 'list';

function Face({ url, className }: { url?: string; className?: string }) {
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

export function AccountBrowser({
  rows,
  storageKey,
  searchPlaceholder,
  emptyLabel,
  extraFilters = [],
}: {
  rows: BrowserRow[];
  /** Per-screen, so a reviewer's choice on vendors does not move landlords. */
  storageKey: string;
  searchPlaceholder: string;
  /** What to say when there is nobody at all   different from "nothing matches". */
  emptyLabel: string;
  extraFilters?: readonly string[];
}) {
  const [view, setView] = useState<View>('grid');
  const statusCounts = useStatusCounts(rows);
  const counts = { ...statusCounts };
  for (const r of rows) if (r.suspended) counts.suspended = (counts.suspended ?? 0) + 1;

  const [filter, setFilter] = useQueueFilter(counts);
  const [search, setSearch] = useState('');

  // Read after mount, not during render: the server has no localStorage, and
  // seeding state from it directly would hydrate a grid over a list.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      // The directive has to sit on the line immediately above the statement  
      // a disable-next-line followed by further comment lines silences the
      // comment, not the code.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === 'grid' || saved === 'list') setView(saved);
    } catch {
      // Blocked site data. The default stands.
    }
  }, [storageKey]);

  function choose(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Not being able to remember the choice must not stop making it.
    }
  }

  const visible = rows.filter((r) => {
    if (filter === 'suspended') {
      if (!r.suspended) return false;
    } else if (filter !== 'all' && r.verificationStatus !== filter) {
      return false;
    }
    if (search && !r.searchText.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (rows.length === 0) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <QueueFilterBar
        filter={filter}
        onFilter={setFilter}
        search={search}
        onSearch={setSearch}
        counts={counts}
        placeholder={searchPlaceholder}
        extra={extraFilters}
      />

      <div className="flex items-center justify-end gap-1">
        {(
          [
            ['grid', LayoutGrid, 'Card view'],
            ['list', List, 'List view'],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={view === value}
            onClick={() => choose(value)}
            className={cn(
              'inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border transition-colors',
              view === value
                ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
                : 'border-line/10 text-content-muted hover:text-content',
            )}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>

      {/* Filtered to nothing, which is different from having nobody   that case
          returned above with its own wording. */}
      {visible.length === 0 && (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          {filter === 'pending' ? 'Nothing waiting on you.' : 'Nothing matches those filters.'}
        </p>
      )}

      {view === 'grid' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((row) => (
            <Link
              key={row.id}
              href={row.href}
              className="border-line/10 bg-panel hover:border-line/25 flex flex-col gap-3 rounded-xl border p-4 transition-colors"
            >
              <div className="flex items-start gap-3">
                <Face url={row.faceUrl} className="size-14 rounded-xl border" />
                <div className="min-w-0 flex-1">
                  <p className="text-content truncate font-medium">{row.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge
                      className={STATUS_BADGE[row.verificationStatus] ?? STATUS_BADGE.unverified}
                    >
                      {row.verificationStatus}
                    </Badge>
                    {row.flags}
                  </p>
                </div>
              </div>
              {row.meta}
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((row) => (
            <Link
              key={row.id}
              href={row.href}
              className="border-line/10 bg-panel hover:border-line/25 flex items-center gap-3 rounded-xl border p-4 transition-colors"
            >
              <Face url={row.faceUrl} className="size-10 rounded-lg border" />
              <div className="min-w-0 flex-1">
                <p className="text-content flex flex-wrap items-center gap-2 font-medium">
                  <span className="truncate">{row.name}</span>
                  <Badge
                    className={STATUS_BADGE[row.verificationStatus] ?? STATUS_BADGE.unverified}
                  >
                    {row.verificationStatus}
                  </Badge>
                  {row.flags}
                </p>
                {row.meta}
              </div>
              <ChevronRight className="text-content-muted size-4 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
