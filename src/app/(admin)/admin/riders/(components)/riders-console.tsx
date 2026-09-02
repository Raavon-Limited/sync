/**
 * The riders list.
 *
 * SAME BROWSER AS VENDORS AND LANDLORDS. Cards with the live photo, a grid/list
 * toggle, counting filter chips, and a click that opens the rider on their own
 * page. The decisions   verify, reject, suspend   live there, because they need
 * the documents next to them.
 *
 * TWO FACTS ARE ON THE COLLAPSED CARD ON PURPOSE
 *   Whether they are carrying something, and whether they are suspended. Both
 *   change what you do next before you have opened anybody: a rider holding
 *   somebody's food is not one to suspend without reading the rest first.
 */
'use client';

import { Bike, Building2, CircleDot } from 'lucide-react';
import { Badge } from '@/components/ui';
import { AccountBrowser } from '@/components/admin/account-browser';
import type { AdminDoc } from '@/components/admin/verification-review';

export interface AdminRider {
  id: string;
  name: string;
  phone: string | null;
  vehicleType: string;
  plateNumber: string | null;
  verificationStatus: string;
  blocked: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  companyName: string | null;
  isOnline: boolean;
  ratingAvg: number;
  delivered: number;
  active: number;
  earnedKobo: number;
  createdAt: string;
  docs: AdminDoc[];
  selfieUrl?: string;
}

export function RidersConsole({ riders }: { riders: AdminRider[] }) {
  return (
    <AccountBrowser
      storageKey="sync.admin.riders.view"
      searchPlaceholder="Search name, plate or fleet…"
      emptyLabel="No riders have signed up yet."
      // Suspension is orthogonal to verification, so it is its own chip rather
      // than a value the status filter could ever return.
      extraFilters={['suspended']}
      rows={riders.map((r) => ({
        id: r.id,
        href: `/admin/riders/${r.id}`,
        name: r.name,
        verificationStatus: r.verificationStatus,
        faceUrl: r.selfieUrl,
        suspended: r.suspendedAt != null,
        searchText: `${r.name} ${r.plateNumber ?? ''} ${r.companyName ?? ''}`,
        flags: (
          <>
            {r.blocked && <Badge className="bg-rose-500/10 text-rose-600">fraud</Badge>}
            {r.suspendedAt && <Badge className="bg-coral/10 text-coral">suspended</Badge>}
            {r.isOnline && !r.suspendedAt && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CircleDot className="size-3" aria-hidden="true" />
                online
              </span>
            )}
          </>
        ),
        meta: (
          <p className="text-content-muted flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <Bike className="size-3" aria-hidden="true" />
              {r.vehicleType}
              {r.plateNumber ? ` · ${r.plateNumber}` : ''}
            </span>
            <span className="flex items-center gap-1">
              <Building2 className="size-3" aria-hidden="true" />
              {r.companyName ?? 'Independent'}
            </span>
            <span>{r.delivered} delivered</span>
            {r.active > 0 && <span className="text-amber-600">{r.active} in flight</span>}
            {r.verificationStatus === 'pending' && (
              <span className="text-amber-600">Review documents</span>
            )}
          </p>
        ),
      }))}
    />
  );
}
