/**
 * The account queue   who is waiting, in what order, and how to find one.
 *
 * IT IS THE SAME BROWSER THE LANDLORD LIST USES. Cards with the live photo, a
 * grid/list toggle, filter chips that count, and a click that opens the account
 * on its own page where the documents have room to be compared. See
 * components/admin/account-browser for why that is a page rather than an
 * accordion.
 *
 * IT IS NOT A VENDOR LIST ANY MORE
 *   The "All" tab shows every kind of account   businesses, landlords, riders,
 *   fleets, students, organisers   because that is what the word means, and
 *   because the previous answer ("every vendor_profiles row that is not a
 *   landlord") left a platform whose only business was a landlord looking
 *   empty. The per-trade tabs narrow the same list to one category.
 *
 * PENDING FIRST, AND IT IS THE DEFAULT FILTER
 *   The list used to open on "all", ordered by signup date, so the one account
 *   actually waiting on staff sat wherever it happened to fall among everyone
 *   who had ever registered.
 */
'use client';

import { AccountBrowser } from '@/components/admin/account-browser';
import { Badge } from '@/components/ui';
import { ACCOUNT_LABEL } from '@/modules/admin/account-types';
import type { AccountRecord } from '@/modules/admin/account-types';

export interface QueueEntry extends AccountRecord {
  /** Signed link to their live photo, when one has been uploaded. */
  selfieUrl?: string;
  docsTotal: number;
  docsApproved: number;
}

export function VerificationQueue({ rows }: { rows: QueueEntry[] }) {
  return (
    <AccountBrowser
      storageKey="sync.admin.vendors.view"
      searchPlaceholder="Search accounts..."
      emptyLabel="Nobody has registered yet."
      extraFilters={['suspended']}
      rows={rows.map((r) => {
        // The kind is a label on the right edge, not a word in the meta line:
        // on a list holding six of them "Raavon, pending" does not say what
        // decision is being asked for, and a role that moves with the length of
        // the name before it cannot be scanned down a column.
        const kind = ACCOUNT_LABEL[r.kind];
        const bits: string[] = [];
        // Dropped when it only repeats the kind   a landlord whose category is
        // 'landlord' says it once.
        if (r.detail && r.detail.toLowerCase() !== kind.toLowerCase()) bits.push(r.detail);
        if (r.area) bits.push(r.area);
        // The one number that says whether opening this is worth it.
        bits.push(
          r.docsTotal === 0 ? 'nothing uploaded' : `${r.docsApproved} of ${r.docsTotal} approved`,
        );

        return {
          // Two rows CAN share a person   somebody who lets a room and is also
          // a student is two decisions   so the key carries the kind.
          id: `${r.kind}-${r.id}`,
          href: r.href,
          name: r.name,
          verificationStatus: r.status,
          faceUrl: r.selfieUrl,
          suspended: r.suspended,
          searchText: `${r.name} ${r.detail} ${kind}`,
          tag: (
            <span className="border-line/15 text-content-muted shrink-0 rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap">
              {kind}
            </span>
          ),
          // The only thing a row asks for, in the same corner on every card.
          action:
            r.status === 'pending' ? (
              <span className="text-xs font-medium text-amber-600">Review documents</span>
            ) : null,
          flags: (
            <>
              {r.blocked && <Badge className="bg-rose-500/10 text-rose-600">fraud</Badge>}
              {r.suspended && <Badge className="bg-coral/10 text-coral">suspended</Badge>}
            </>
          ),
          meta: (
            <p className="text-content-muted flex flex-wrap items-center gap-3 text-xs">
              {bits.map((bit) => (
                <span key={bit}>{bit}</span>
              ))}
            </p>
          ),
        };
      })}
    />
  );
}
