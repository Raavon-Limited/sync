/**
 * LandlordsBrowser — the landlord list.
 *
 * THE DESIGN THAT STARTED HERE NOW LIVES IN components/admin/account-browser.
 *   Cards with the live photo, a grid/list toggle remembered per screen, and a
 *   click that opens the account on its own page. Vendors and riders were
 *   rendering three different shapes of the same question; they now render
 *   through the same component, and this file is what it was always doing —
 *   deciding what a landlord row SAYS.
 */
'use client';

import { Home, ShieldCheck } from 'lucide-react';
import { AccountBrowser } from '@/components/admin/account-browser';

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

export function LandlordsBrowser({ rows }: { rows: LandlordRow[] }) {
  return (
    <AccountBrowser
      storageKey="sync.admin.landlords.view"
      searchPlaceholder="Search landlords…"
      emptyLabel="No landlords registered yet."
      rows={rows.map((row) => ({
        id: row.id,
        href: `/admin/landlord/${row.slug}`,
        name: row.businessName,
        verificationStatus: row.verificationStatus,
        faceUrl: row.selfieUrl,
        searchText: `${row.businessName} ${row.area ?? ''}`,
        meta: (
          <p className="text-content-muted flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <Home className="size-3" />
              {row.hostels} hostel{row.hostels === 1 ? '' : 's'}
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3" />
              {/* Hostel verification is separate from landlord verification: a
                  verified landlord can still list a property nobody has
                  visited. */}
              {row.verifiedHostels} verified
            </span>
            <span>{row.area ?? 'No area'}</span>
            {row.verificationStatus === 'pending' && (
              <span className="text-amber-600">Review documents</span>
            )}
          </p>
        ),
      }))}
    />
  );
}
