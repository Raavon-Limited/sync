/**
 * VerifyNowSheet — "Verify Now" as a side panel over the dashboard, not a trip
 * to /onboarding.
 *
 * WHY A PANEL AND NOT THE ROUTE
 *   /onboarding is the FIRST RUN: it opens on a brand new account where there
 *   is no dashboard worth keeping on screen, and a full page is right.
 *
 *   "Verify Now" is a different moment. It is pressed by someone already
 *   standing in their own dashboard, usually because the banner or the badge
 *   told them the numbers behind it are locked. Navigating away replaces the
 *   thing they are trying to unlock with a page that looks like signup all
 *   over again — and if they change their mind there is no back out of it
 *   except the browser button. A panel keeps the dashboard behind the overlay,
 *   so the reason they are filling the form in stays visible, and Escape or
 *   the X puts them back exactly where they were.
 *
 * THE FORM IS THE SAME FORM. This renders <OnboardingWizard>, the same five
 * steps against the same schema and RPCs the route uses. It is a second HOST,
 * never a second copy — the last rebuild of this flow replaced a panel with a
 * route and deleted the panel's form, and the two drifted precisely because
 * there were two of them.
 *
 * CLOSE, THEN NAVIGATE, IN THAT ORDER. `onSubmitted` closes the sheet before
 * routing. A Radix dialog still open across a route change leaves its scroll
 * lock and its aria-hidden on the page behind it, so the dashboard underneath
 * comes back inert and reads as a freeze.
 */
'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { OnboardingWizard } from './onboarding-wizard';
import type { VendorOnboardingInput } from '@/lib/validations';

export interface VerifyNowSheetProps {
  /** Prefill from the signed-in account, same source the route uses. */
  initial: Partial<VendorOnboardingInput>;
  /** Whatever opens it — the badge, or the banner's "Verify Now". */
  children: ReactNode;
}

export function VerifyNowSheet({ initial, children }: VerifyNowSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* asChild: the trigger IS the caller's element. Wrapping the badge or
          the banner link in a <button> would nest a button inside a link and
          put a second focus stop on one control. */}
      <SheetTrigger asChild>{children}</SheetTrigger>

      {/* Wider than the kit's default `sm:max-w-sm`. Five steps of labelled
          inputs, an address autocomplete and a document list do not fit a
          384px column without every field wrapping. Full bleed on a phone is
          the variant's own behaviour and is left alone.

          overflow-y-auto because the panel is the scroll container here: the
          page behind it is locked while it is open, so a form taller than the
          viewport has nowhere else to go. */}
      <SheetContent
        side="right"
        className="flex flex-col gap-0 overflow-y-auto sm:max-w-xl md:w-[42rem]"
      >
        <SheetHeader>
          <SheetTitle>Verify your business</SheetTitle>
          <SheetDescription>
            A few steps to get verified — then the rest of your dashboard unlocks.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <OnboardingWizard
            initial={initial}
            layout="panel"
            onSubmitted={(dest) => {
              setOpen(false);
              // Pushed rather than only refreshed: picking the landlord
              // category on a vendor dashboard changes which dashboard this
              // account belongs to, and staying put would leave them on one
              // the proxy now gates them out of.
              router.push(dest);
              router.refresh();
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
