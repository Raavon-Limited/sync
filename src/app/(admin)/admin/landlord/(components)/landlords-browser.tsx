/**
 * LandlordsBrowser — the landlord list, as cards by default.
 *
 * WHY CARDS AND WHY THE FACE
 *   The list existed to answer "who is waiting on me", and it answered it with
 *   a name and a badge. A name is not how a reviewer recognises a submission
 *   they half-remember, and it gave no signal at all about whether the folder
 *   was worth opening. The live photo is the one image in every folder, it is
 *   the same image the review screen compares against the ID, and putting it
 *   on the card means the queue is scannable by sight.
 *
 * THE TOGGLE IS NOT DECORATION
 *   Cards are right for a handful of pending landlords, which is the normal
 *   case and therefore the default. The list is right for a long tail — twenty
 *   verified landlords you are scrolling for one name — where a grid of faces
 *   is slower to read than a column of text. Neither ordering is wrong, so the
 *   choice is the reviewer's and it is remembered.
 *
 *   Remembered in localStorage, which can throw (private windows, blocked site
 *   data) — every access is guarded and the default survives a failure.
 */
/* eslint-disable @next/next/no-img-element -- a signed, expiring url on a
   private bucket. next/image would proxy and cache the identity photo, and the
   cached copy would outlive the signature. */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Home, LayoutGrid, List, ShieldCheck, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui';
import { QueueFilterBar, useQueueFilter, useStatusCounts } from '@/components/admin/account-queue';
import { cn } from '@/lib/utils';

export interface LandlordRow {
  id: string;
  slug: string;
  businessName: string;
  area: string | null;
  verificationStatus: string;
  hostels: number;
  verifiedHostels: number;
  /** Signed link to their live photo, when one has been uploaded. */
  selfieUrl?: string;
}

const BADGE: Record<string, string> = {
  verified: 'bg-emerald-500/10 text-emerald-600',
  pending: 'bg-amber-500/10 text-amber-600',
  rejected: 'bg-rose-500/10 text-rose-600',
  unverified: 'bg-ink/5 text-content-muted',
};

const STORAGE_KEY = 'sync.admin.landlords.view';
type View = 'grid' | 'list';

function Face({ row, className }: { row: LandlordRow; className?: string }) {
  return (
    <span
      className={cn(
        'border-line/10 bg-ink/30 flex shrink-0 items-center justify-center overflow-hidden',
        className,
      )}
    >
      {row.selfieUrl ? (
        <img src={row.selfieUrl} alt="" className="size-full object-cover" />
      ) : (
        // Not "no photo" as an error — an unverified landlord who has not
        // submitted yet legitimately has none.
        <UserRound className="text-content-muted size-6" aria-hidden="true" />
      )}
    </span>
  );
}

function Meta({ row }: { row: LandlordRow }) {
  return (
    <p className="text-content-muted flex flex-wrap items-center gap-3 text-xs">
      <span className="flex items-center gap-1">
        <Home className="size-3" />
        {row.hostels} hostel{row.hostels === 1 ? '' : 's'}
      </span>
      <span className="flex items-center gap-1">
        <ShieldCheck className="size-3" />
        {/* Hostel verification is separate from landlord verification: a
            verified landlord can still list a property nobody has visited. */}
        {row.verifiedHostels} verified
      </span>
      <span>{row.area ?? 'No area'}</span>
      {row.verificationStatus === 'pending' && (
        <span className="text-amber-600">Review documents</span>
      )}
    </p>
  );
}

export function LandlordsBrowser({ rows }: { rows: LandlordRow[] }) {
  const [view, setView] = useState<View>('grid');
  // The same chips as the vendor and rider queues. This list had none, so the
  // one landlord waiting on a decision had to be found by reading every badge —
  // which is exactly the scan the ordering above already tries to spare you.
  const counts = useStatusCounts(rows);
  const [filter, setFilter] = useQueueFilter(counts);
  const [search, setSearch] = useState('');

  const visible = rows.filter((r) => {
    if (filter !== 'all' && r.verificationStatus !== filter) return false;
    if (search && !r.businessName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Read after mount, not during render: the server has no localStorage, and
  // seeding state from it directly would hydrate a grid over a list.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // Reading a browser-only store AFTER mount is the SSR-safe way to do
      // this: the server has no localStorage, so seeding state from it during
      // render would hydrate one view and then swap to the other. The cost is
      // one extra render, on mount, once.
      //
      // The directive has to sit on the line immediately above the statement —
      // a `disable-next-line` followed by further comment lines silences the
      // comment, not the code.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === 'grid' || saved === 'list') setView(saved);
    } catch {
      // Blocked site data. The default stands.
    }
  }, []);

  function choose(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice must not stop making it.
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
        No landlords registered yet.
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
        placeholder="Search landlords…"
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

      {/* Filtered to nothing, which is different from having no landlords —
          that case returned above with its own wording. */}
      {visible.length === 0 && (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          {filter === 'pending' ? 'Nothing waiting on you.' : 'No landlords match.'}
        </p>
      )}

      {view === 'grid' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((row) => (
            <Link
              key={row.id}
              href={`/admin/landlord/${row.slug}`}
              className="border-line/10 bg-panel hover:border-line/25 flex flex-col gap-3 rounded-xl border p-4 transition-colors"
            >
              <div className="flex items-start gap-3">
                <Face row={row} className="size-14 rounded-xl border" />
                <div className="min-w-0 flex-1">
                  <p className="text-content truncate font-medium">{row.businessName}</p>
                  <Badge className={cn('mt-1', BADGE[row.verificationStatus] ?? BADGE.unverified)}>
                    {row.verificationStatus}
                  </Badge>
                </div>
              </div>
              <Meta row={row} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((row) => (
            <Link
              key={row.id}
              href={`/admin/landlord/${row.slug}`}
              className="border-line/10 bg-panel hover:border-line/25 flex items-center gap-3 rounded-xl border p-4 transition-colors"
            >
              <Face row={row} className="size-10 rounded-lg border" />
              <div className="min-w-0 flex-1">
                <p className="text-content flex items-center gap-2 font-medium">
                  <span className="truncate">{row.businessName}</span>
                  <Badge className={BADGE[row.verificationStatus] ?? BADGE.unverified}>
                    {row.verificationStatus}
                  </Badge>
                </p>
                <Meta row={row} />
              </div>
              <ChevronRight className="text-content-muted size-4 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
