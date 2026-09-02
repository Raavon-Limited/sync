/**
 * The store switcher   the sidebar control the whole multi-branch feature hangs
 * off. Picks which branch the vendor is currently working; every branch-scoped
 * screen reads it from `useActiveStorefront()`.
 *
 * It renders as a plain label, not a control, when there is only one branch to
 * choose from. A dropdown that cannot change anything is noise, and most
 * vendors will have exactly one location for a long time.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronsUpDown, Store, Plus, ShieldCheck } from 'lucide-react';
import { useActiveStorefront } from '@/modules/storefronts/active-storefront';
import { cn } from '@/lib/utils';

export function StoreSwitcher() {
  const { active, storefronts, setActive, isLoading, hasChoice, isOwner } = useActiveStorefront();
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return <div className="bg-ink/5 h-14 w-full animate-pulse rounded-xl" />;
  }

  // No branches at all: a vendor whose storefront row is missing, or a manager
  // whose only access was revoked. Say so rather than rendering an empty box.
  if (!active) {
    return (
      <div className="border-line/10 text-content-muted rounded-xl border border-dashed px-3 py-3 text-xs">
        No store assigned yet.
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => hasChoice && setOpen((v) => !v)}
        aria-haspopup={hasChoice ? 'listbox' : undefined}
        aria-expanded={hasChoice ? open : undefined}
        className={cn(
          'border-line/10 bg-surface-deep flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left',
          hasChoice && 'hover:border-line/25 transition-colors',
          !hasChoice && 'cursor-default',
        )}
      >
        <span className="bg-lime/15 text-lime-deep flex size-8 shrink-0 items-center justify-center rounded-lg">
          <Store className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-content block truncate text-sm font-medium">{active.name}</span>
          <span className="text-content-muted flex items-center gap-1 text-[11px]">
            {active.area ?? 'No area set'}
            {/* A manager should never be unsure which hat they are wearing. */}
            {!isOwner && (
              <>
                <span aria-hidden>·</span>
                <ShieldCheck className="size-3" />
                Manager
              </>
            )}
          </span>
        </span>
        {hasChoice && <ChevronsUpDown className="text-content-muted size-4 shrink-0" />}
      </button>

      {open && hasChoice && (
        <>
          {/* Click-away. Sits under the menu, over everything else. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <ul
            role="listbox"
            className="border-line/10 bg-panel absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-xl border shadow-lg"
          >
            {storefronts.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={s.id === active.id}
                  onClick={() => {
                    setActive(s.id);
                    setOpen(false);
                  }}
                  className="hover:bg-ink/5 flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                >
                  <Check
                    className={cn('size-4 shrink-0', s.id === active.id ? 'text-lime-deep' : 'opacity-0')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-content block truncate">{s.name}</span>
                    <span className="text-content-muted text-[11px]">
                      {s.area ?? 'No area'}
                      {s.isPrimary && ' · Primary'}
                      {s.capacity === 'staff' && ' · Manager'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {/* Owners only: staff cannot create branches, so do not offer it. */}
            {isOwner && (
              <li className="border-line/10 border-t">
                <Link
                  href="/vendor/stores"
                  onClick={() => setOpen(false)}
                  className="text-content-muted hover:bg-ink/5 flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                >
                  <Plus className="size-4" />
                  Manage stores
                </Link>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
