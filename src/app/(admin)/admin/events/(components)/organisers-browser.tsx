/**
 * OrganisersBrowser - the event organiser list.
 *
 * IT RENDERS THROUGH THE SAME BROWSER AS EVERY OTHER ACCOUNT TAB. Cards with
 * the live photo, a grid/list toggle remembered per screen, status chips that
 * count, and a click that opens the person on their own page. This file decides
 * only what an organiser ROW SAYS.
 *
 * It used to be a hand-rolled divide-y list, which made one tab in the Accounts
 * strip look and behave unlike the six beside it - the same mistake the
 * Students tab started with.
 *
 * WHAT AN ORGANISER'S ROW SAYS
 *   How much they have on, and how much of it is still to come. There is no
 *   business name and no property count; what a reviewer needs to tell one from
 *   another is whether they are actually running anything.
 */
'use client';

import { CalendarDays, Ticket } from 'lucide-react';
import { AccountBrowser } from '@/components/admin/account-browser';

export interface OrganiserRow {
  id: string;
  name: string;
  email: string;
  verificationStatus: string;
  /** 'event_manager' | 'creator' — the strip covers both. */
  role: string;
  listed: number;
  upcoming: number;
  suspended: boolean;
  /** Signed link to their live photo, when one has been uploaded. */
  selfieUrl?: string;
}

export function OrganisersBrowser({ rows }: { rows: OrganiserRow[] }) {
  return (
    <AccountBrowser
      storageKey="sync.admin.organisers.view"
      searchPlaceholder="Search organisers…"
      emptyLabel="No event organiser accounts yet."
      rows={rows.map((row) => ({
        id: row.id,
        href: `/admin/events/${row.id}`,
        name: row.name,
        verificationStatus: row.verificationStatus,
        faceUrl: row.selfieUrl,
        suspended: row.suspended,
        searchText: `${row.name} ${row.email}`,
        meta: (
          <p className="text-content-muted flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <Ticket className="size-3" />
              {row.role === 'creator' ? 'Content creator' : 'Event organiser'}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3" />
              {/* The one number that says whether opening this is worth it. */}
              {row.listed === 0
                ? 'nothing listed'
                : `${row.listed} listed · ${row.upcoming} to come`}
            </span>
          </p>
        ),
      }))}
    />
  );
}
