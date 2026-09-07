/**
 * The account view of one hostel, split into what is claimed and what was found.
 *
 * WHY IT IS SPLIT
 *   The page was one column: the listing's facts, then its rooms, then its
 *   bookings, then the agent's visit at the very bottom. So the two things a
 *   reviewer is actually comparing   the landlord's photographs and the agent's
 *   were about two screens apart, and the comparison was done from memory.
 *   That is the same mistake the verification side panel had, fixed the same
 *   way, so the two screens keep behaving alike.
 *
 * A CLIENT ISLAND AROUND SERVER-RENDERED CHILDREN
 *   Radix tabs need state, and everything inside them is server-rendered   the
 *   listing facts, the room tiles, the booking rows all come from the page's own
 *   queries. Passing them as ReactNode props keeps the data fetching on the
 *   server and puts only the tab strip in the browser.
 *
 * FINDINGS FIRST WHEN THERE ARE ANY. A reviewer opening a hostel that has been
 * visited is nearly always there for the visit; one that has not been visited
 * has nothing to show on that tab.
 */
'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';

export function HostelDetailTabs({
  listing,
  findings,
  occupancy,
  hasFindings,
  photoCount,
}: {
  listing: ReactNode;
  findings: ReactNode;
  occupancy: ReactNode;
  hasFindings: boolean;
  photoCount: number;
}) {
  return (
    <Tabs defaultValue={hasFindings ? 'findings' : 'listing'} className="flex flex-col gap-4">
      <TabsList>
        <TabsTrigger value="listing">The listing</TabsTrigger>
        <TabsTrigger value="findings">
          Agent&rsquo;s findings{photoCount > 0 ? ` (${photoCount})` : ''}
        </TabsTrigger>
        <TabsTrigger value="occupancy">Rooms &amp; bookings</TabsTrigger>
      </TabsList>

      <TabsContent value="listing">{listing}</TabsContent>
      <TabsContent value="findings">{findings}</TabsContent>
      <TabsContent value="occupancy" className="flex flex-col gap-6">
        {occupancy}
      </TabsContent>
    </Tabs>
  );
}
