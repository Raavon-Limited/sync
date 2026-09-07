/**
 * "List an event" as a side panel, not a trip to /organiser/events/new.
 *
 * WHY A PANEL AND NOT THE ROUTE
 *   Same reasoning as VerifyNowSheet. The button is pressed by somebody already
 *   standing in their own dashboard, usually looking at the list they are about
 *   to add to. Navigating away replaces that context with a form, and changing
 *   your mind means the browser back button.
 *
 *   The panel keeps the dashboard behind the overlay, and Escape or the X puts
 *   them back exactly where they were with nothing lost but the typing.
 *
 * THE ROUTE STILL EXISTS, AND IT SHOULD. /organiser/events/new is a real URL
 * somebody can be sent, bookmark, or land on from an empty state. This is a
 * second HOST for the same <EventForm>, never a second copy — the form, its
 * schema and its actions are shared, so the two cannot drift.
 *
 * IT IS NOT RENDERED AT ALL WHEN UNVERIFIED. The caller decides: an organiser
 * who cannot list anything is shown the verification panel instead, rather than
 * a sheet that opens onto a refusal.
 */
'use client';

import { useState, type ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { EventForm } from './event-form';

export function ListEventSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>List an event</SheetTitle>
          <SheetDescription>
            It appears on /events as soon as you save. Ticket tiers come after, on the event&rsquo;s
            own page.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          {/* Closing on success is the form's job through the router push it
              already does; the sheet closes with the navigation. */}
          <EventForm onDone={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
