/**
 * The vendor verification queue — which businesses, in what order, and how to
 * find one.
 *
 * THE CARD ITSELF LIVES IN components/admin/verification-review, because the
 * landlord and rider screens render the same review. This file is the LIST.
 *
 * PENDING FIRST, AND IT IS THE DEFAULT FILTER
 *   The list used to open on "all", ordered by signup date, so the one business
 *   actually waiting on staff sat wherever it happened to fall among everyone
 *   who had ever registered. It now opens on pending — falling back to "all"
 *   when there is no pending work, so the page is never an empty state that
 *   looks broken — and every filter chip carries its own count.
 *
 * FOLDERS ARE BEHIND A CLICK
 *   Every business used to arrive with its documents already open, which meant
 *   four signed-image requests per business on first paint and a page where a
 *   verified account nobody needs to look at again was exactly as tall as the
 *   one waiting on a decision. See components/admin/account-queue.
 */
'use client';

import { useState } from 'react';
import {
  AccountCard,
  QueueFilterBar,
  useQueueFilter,
  useStatusCounts,
} from '@/components/admin/account-queue';
import {
  VerificationReview,
  type AdminVendor,
  type AdminDoc,
} from '@/components/admin/verification-review';

export type { AdminVendor, AdminDoc };

export function VerificationQueue({ vendors }: { vendors: AdminVendor[] }) {
  const counts = useStatusCounts(vendors);
  const [filter, setFilter] = useQueueFilter(counts);
  const [search, setSearch] = useState('');

  const visible = vendors.filter((v) => {
    if (filter !== 'all' && v.verificationStatus !== filter) return false;
    if (search && !v.businessName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <QueueFilterBar
        filter={filter}
        onFilter={setFilter}
        search={search}
        onSearch={setSearch}
        counts={counts}
        placeholder="Search businesses..."
      />

      {visible.length === 0 && (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          {filter === 'pending' ? 'Nothing waiting on you.' : 'No businesses match.'}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {visible.map((v) => (
          <AccountCard
            key={v.id}
            name={v.businessName}
            status={v.verificationStatus}
            faceUrl={v.selfieUrl}
            meta={
              <p className="text-content-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span>{v.category}</span>
                <span>·</span>
                <span>{v.area ?? 'No area'}</span>
                <span>·</span>
                <span>
                  joined{' '}
                  {new Date(v.createdAt).toLocaleDateString('en-NG', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                <span>·</span>
                {/* The one number that says whether opening this is worth it. */}
                <span>
                  {v.docs.length === 0
                    ? 'nothing uploaded yet'
                    : `${v.docs.filter((d) => d.status === 'approved').length} of ${v.docs.length} approved`}
                </span>
              </p>
            }
          >
            <VerificationReview vendor={v} showHeader={false} />
          </AccountCard>
        ))}
      </div>
    </div>
  );
}
