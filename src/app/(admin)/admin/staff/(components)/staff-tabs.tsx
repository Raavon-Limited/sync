/**
 * The two halves of /admin/staff, as tabs.
 *
 * WHY A CLIENT WRAPPER AROUND SERVER-RENDERED PANELS
 *   Switching tabs is a client concern; reading the roster is not. Both panels
 *   are rendered on the server and handed in as `children`, so this component
 *   holds the selected tab and nothing else — it never fetches, and the data in
 *   each panel is the same server render it would have been on one page.
 *
 *   It also means a server action's `revalidatePath('/admin/staff')` refreshes
 *   both panels without knocking you back to the first tab: the client
 *   component stays mounted across the re-render, so its state survives.
 *   Assigning a role from the Roles tab and being returned to the People tab
 *   would be the obvious way to get this wrong.
 *
 * THE COUNTS ARE ON THE TABS ON PURPOSE. An outstanding invitation is the one
 * thing on this screen that somebody is waiting on, and tabs hide half the page
 * by design — so the number that means "act on me" has to be visible from the
 * tab you are not on.
 */
'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export function StaffTabs({
  people,
  roles,
  peopleCount,
  pendingCount,
  roleCount,
}: {
  people: React.ReactNode;
  roles: React.ReactNode;
  peopleCount: number;
  /** Invitations nobody has accepted. Shown as a pill when there are any. */
  pendingCount: number;
  roleCount: number;
}) {
  const [tab, setTab] = useState('people');

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
      <TabsList className="self-start">
        <TabsTrigger value="people">
          Who runs Sync
          <Count value={peopleCount} active={tab === 'people'} />
          {pendingCount > 0 && (
            <span
              className="bg-lime/15 text-lime-deep ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-medium"
              title={`${pendingCount} invitation${pendingCount === 1 ? '' : 's'} not yet accepted`}
            >
              {pendingCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="roles">
          Roles &amp; access
          <Count value={roleCount} active={tab === 'roles'} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="people">{people}</TabsContent>
      <TabsContent value="roles">{roles}</TabsContent>
    </Tabs>
  );
}

/** A plain count beside a tab label — quieter than the pending-invite pill,
 *  which is the only number here that asks for anything. */
function Count({ value, active }: { value: number; active: boolean }) {
  return (
    <span className={cn('ml-1.5 text-xs', active ? 'text-content-muted' : 'text-content-muted/70')}>
      {value}
    </span>
  );
}
