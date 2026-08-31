/**
 * The verification queue — every business awaiting a decision, vendors and
 * landlords alike.
 *
 * THE CARD ITSELF LIVES IN components/admin/verification-review, because the
 * landlord page renders the same review. This file is the LIST: which
 * businesses, in what order, and how to find one.
 *
 * PENDING FIRST, AND IT IS THE DEFAULT FILTER
 *   The list used to open on "all", ordered by signup date, so the one business
 *   actually waiting on staff sat wherever it happened to fall among everyone
 *   who had ever registered. A queue whose first screen is not the work is not
 *   a queue. It now opens on pending — falling back to "all" when there is no
 *   pending work, so the page is never an empty state that looks broken — and
 *   every filter chip carries its own count.
 */
'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui';
import {
  VerificationReview,
  type AdminVendor,
  type AdminDoc,
} from '@/components/admin/verification-review';

export type { AdminVendor, AdminDoc };

const FILTERS = ['pending', 'unverified', 'verified', 'rejected', 'all'] as const;

export function VerificationQueue({ vendors }: { vendors: AdminVendor[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: vendors.length };
    for (const v of vendors) c[v.verificationStatus] = (c[v.verificationStatus] ?? 0) + 1;
    return c;
  }, [vendors]);

  // Land on the work when there is work. `useState` initialiser, not an effect:
  // the right tab on first paint, with no flash of the wrong list.
  const [filter, setFilter] = useState<string>(() => (counts.pending ? 'pending' : 'all'));
  const [search, setSearch] = useState('');

  const visible = vendors.filter((v) => {
    if (filter !== 'all' && v.verificationStatus !== filter) return false;
    if (search && !v.businessName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search businesses..."
          className="max-w-xs"
        />
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
              filter === f
                ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
                : 'border-line/10 text-content-muted hover:text-content'
            }`}
          >
            {f}
            {counts[f] ? <span className="ml-1.5 opacity-60">{counts[f]}</span> : null}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          {filter === 'pending' ? 'Nothing waiting on you.' : 'No businesses match.'}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {visible.map((v) => (
          <VerificationReview key={v.id} vendor={v} />
        ))}
      </div>
    </div>
  );
}
