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
import { STATUS_BADGE } from '@/components/admin/account-queue';

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
  /** One entry per role held, each carrying that role's own decision. */
  credentials: { role: string; label: string; status: string }[];
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
        // Both decisions, so the Pending chip finds a pending landlord even
        // when the same person is a verified student.
        statuses: row.credentials.map((c) => c.status),
        faceUrl: row.selfieUrl,
        suspended: row.suspended,
        searchText: `${row.name} ${row.email} ${row.role} ${row.roleLabel}`,
        /*
         * ONE BADGE PER ROLE, EACH SAYING ITS OWN STATE.
         *
         * This was a single status badge plus "+LANDLORD"   a hat with no state
         * attached   so a verified student who is a pending landlord read as
         * VERIFIED +LANDLORD. The one thing that is not true about them is that
         * they are verified full stop.
         *
         * Rendered only when there is more than one: a single-role account is
         * already answered by the status badge beside the name, and repeating
         * it would put two badges saying the same word on every row.
         */
        flags:
          row.credentials.length > 1 ? (
            <>
              {row.credentials.map((c) => (
                <Badge
                  key={c.role}
                  className={STATUS_BADGE[c.status] ?? 'bg-ink/5 text-content-muted'}
                >
                  {c.label} · {c.status === 'n/a' ? 'staff' : c.status}
                </Badge>
              ))}
            </>
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
