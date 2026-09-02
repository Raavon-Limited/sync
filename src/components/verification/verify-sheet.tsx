/**
 * "Get verified" as a side panel, for the roles that verify through profiles.
 *
 * WHY A PANEL AND NOT /me/verify
 *   Same reasoning as VerifyNowSheet, which does this for businesses: the
 *   button is pressed by somebody standing in their own dashboard, usually
 *   because a banner told them something is locked. Navigating away replaces
 *   the thing they are trying to unlock, and backing out means the browser
 *   button. The panel keeps the dashboard behind the overlay and Escape puts
 *   them back.
 *
 * NOT THE SAME SHEET AS VerifyNowSheet, and it should not be
 *   That one hosts the VENDOR onboarding wizard — business name, what you
 *   sell, an address. Pointing a student or an organiser at it would ask them
 *   for a trade. Same idea, different form, so it is a second host rather than
 *   a prop that makes the other one mean two things.
 *
 * THE ROUTE STILL EXISTS. /me/verify is a real URL — the reminder email will
 * want it, and somebody who lands there directly should get a working page.
 * This is a second HOST for the same <VerifyForm>, never a second copy.
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
import { VerifyForm, type StudentIdentityFields } from '@/app/me/verify/(components)/verify-form';
import { requirementsFor, type VerificationRole } from '@/modules/verification/requirements';

export function VerifySheet({
  role,
  status,
  identity,
  children,
}: {
  role: VerificationRole;
  status: string;
  identity?: StudentIdentityFields | null;
  /** The trigger — a button, usually. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const asked = requirementsFor(role).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Get verified</SheetTitle>
          <SheetDescription>
            {asked} {asked === 1 ? 'document' : 'documents'}, reviewed by a person. Your files are
            stored privately and are only ever opened by a reviewer.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          <VerifyForm role={role} status={status} identity={identity} inSheet />
        </div>
      </SheetContent>
    </Sheet>
  );
}
