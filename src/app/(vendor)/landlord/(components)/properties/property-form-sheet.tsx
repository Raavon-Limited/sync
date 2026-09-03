/**
 * Adding or editing a property, in a sheet beside the list.
 *
 * WHY A SHEET AND NOT A PAGE
 *   Both "Add a property" buttons pointed at /landlord/properties/new, a route
 *   that has never existed   so the primary action on the properties screen,
 *   and the only control in its empty state, was a 404. It could have been
 *   built as a page; a sheet is the better answer for the same reason the
 *   details view is one: the list is the context. A landlord adding their
 *   second hostel is looking at their first while they do it, and coming back
 *   to a list that has scrolled to the top is a small loss every time.
 *
 * THE FORM IS UNCHANGED, and deliberately so   PropertyForm is the same
 * component the page version renders. `embedded` drops the page chrome (its own
 * heading, the back link, the Cancel that navigates) because a sheet supplies
 * all three, and `onDone` closes this instead of pushing a route.
 */
'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui';
import { PropertyForm } from './property-form';
import type { Property } from '../landlord-types';

export function PropertyFormSheet({
  property,
  /** The button that opens it. Defaults to the standard "Add a property". */
  trigger,
}: {
  property?: Property;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(property);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="size-4" /> Add a property
          </Button>
        )}
      </SheetTrigger>

      {/* Wider than the details sheet: this one holds a two-column form's worth
          of fields, and at sm:max-w-xl the address and price inputs end up
          narrower than the text they hold. */}
      {/* THE PANEL DOES NOT SCROLL   the form inside it does.
          That is what lets the form pin its own footer to the bottom of the
          panel: with `overflow-y-auto` here the whole column scrolls as one and
          the Save button goes with it, which is the thing this was built to
          stop. `overflow-hidden` also keeps a second scrollbar from appearing
          around the first. */}
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-2xl"
      >
        <SheetHeader className="pr-8 pb-5">
          <SheetTitle>{isEdit ? 'Edit property' : 'Add a property'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update the details students see, and what a reviewer checks against.'
              : 'Add the details students search on. A Sync agent visits before it can be booked.'}
          </SheetDescription>
        </SheetHeader>

        <PropertyForm property={property} embedded onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
