/**
 * The vendor verification queue — which businesses, in what order, and how to
 * find one.
 *
 * IT IS THE SAME BROWSER THE LANDLORD LIST USES. Cards with the live photo, a
 * grid/list toggle, filter chips that count, and a click that opens the
 * business on its own page where the documents have room to be compared. See
 * components/admin/account-browser for why that is a page rather than an
 * accordion.
 *
 * PENDING FIRST, AND IT IS THE DEFAULT FILTER
 *   The list used to open on "all", ordered by signup date, so the one business
 *   actually waiting on staff sat wherever it happened to fall among everyone
 *   who had ever registered.
 */
'use client';

import { AccountBrowser } from '@/components/admin/account-browser';
import { type AdminVendor, type AdminDoc } from '@/components/admin/verification-review';

export type { AdminVendor, AdminDoc };

export function VerificationQueue({ vendors }: { vendors: AdminVendor[] }) {
  return (
    <AccountBrowser
      storageKey="sync.admin.vendors.view"
      searchPlaceholder="Search businesses..."
      emptyLabel="No vendors registered yet."
      rows={vendors.map((v) => {
        const approved = v.docs.filter((d) => d.status === 'approved').length;
        return {
          id: v.id,
          href: `/admin/vendors/${v.slug}`,
          name: v.businessName,
          verificationStatus: v.verificationStatus,
          faceUrl: v.selfieUrl,
          searchText: `${v.businessName} ${v.category}`,
          meta: (
            <p className="text-content-muted flex flex-wrap items-center gap-3 text-xs">
              <span>{v.category}</span>
              <span>{v.area ?? 'No area'}</span>
              {/* The one number that says whether opening this is worth it. */}
              <span>
                {v.docs.length === 0
                  ? 'nothing uploaded'
                  : `${approved} of ${v.docs.length} approved`}
              </span>
              {v.verificationStatus === 'pending' && (
                <span className="text-amber-600">Review documents</span>
              )}
            </p>
          ),
        };
      })}
    />
  );
}
