/**
 * AccountsBrowser - everybody, whatever they are.
 *
 * THE ROLE IS THE THING THE OTHER TABS DO NOT SHOW
 *   Every other tab in the strip is already filtered to one kind of account, so
 *   naming the role on the card would be repeating the tab header. This one is
 *   not filtered, so the role is the first thing a row has to say - it is what
 *   turns a list of names into a list you can scan.
 *
 * VERIFICATION HERE IS THE ROLE'S OWN VERIFICATION
 *   Resolved by the page from whichever table is the authority for that role -
 *   vendor_profiles, rider_profiles, student_profiles, or profiles. A single
 *   column read straight off `profiles` would report the business decision for
 *   somebody who is both a student and a vendor, which is the bug the separate
 *   tables exist to prevent.
 */
'use client';

import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui';
import { AccountBrowser } from '@/components/admin/account-browser';

export interface AccountRow {
  id: string;
  name: string;
  email: string;
  /** The role being worn, in the platform's own vocabulary. */
  role: string;
  /** Human label for it. */
  roleLabel: string;
  /** Every hat held, when that is more than one. */
  alsoRoles: string[];
  verificationStatus: string;
  href: string;
  suspended: boolean;
  selfieUrl?: string;
}

export function AccountsBrowser({ rows }: { rows: AccountRow[] }) {
  return (
    <AccountBrowser
      storageKey="sync.admin.accounts.view"
      searchPlaceholder="Search anyone by name, email or role…"
      emptyLabel="No accounts yet."
      rows={rows.map((row) => ({
        id: row.id,
        href: row.href,
        name: row.name,
        verificationStatus: row.verificationStatus,
        faceUrl: row.selfieUrl,
        suspended: row.suspended,
        searchText: `${row.name} ${row.email} ${row.role} ${row.roleLabel}`,
        // A second hat is worth a badge: it is the case where one decision on
        // this screen says nothing about the other one.
        flags:
          row.alsoRoles.length > 0 ? (
            <Badge className="bg-ink/5 text-content-muted">+{row.alsoRoles.join(', +')}</Badge>
          ) : undefined,
        meta: (
          <p className="text-content-muted flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3" />
              {row.roleLabel}
            </span>
            <span>{row.email}</span>
          </p>
        ),
      }))}
    />
  );
}
