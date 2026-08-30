/**
 * "Add a business account" / "Add a student account", in the account menu.
 *
 * THE GAP THIS FILLS
 *   Signing up again with the same email is refused — auth is keyed on email —
 *   and the form correctly redirects to /login. But there was then no route,
 *   anywhere, from a student account to a vendor one. The database learned how
 *   in `claim_role`; this is the only place in the product that asks it.
 *
 * A BUSINESS ROLE GOES STRAIGHT TO ONBOARDING
 *   Claiming vendor grants the right to set a business up, not a business:
 *   there is no `vendor_profiles` row until onboarding writes one. Landing on
 *   an empty vendor dashboard instead would look like the account was made
 *   wrong. The student direction needs no equivalent — students have no
 *   profile row to create, so holding the role is the whole thing.
 *
 * CONFIRMED FIRST
 *   The one-business-per-account rule means this choice is not freely
 *   reversible: having claimed vendor, you cannot later claim landlord on the
 *   same login. Worth a sentence before, rather than an error afterwards.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, GraduationCap, Loader2 } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { claimRole } from '@/modules/auth/actions';

const BUSINESS_ROLES = ['vendor', 'landlord', 'rider'];

export function AddAccountItem({ roles }: { roles: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<'vendor' | 'student' | null>(null);

  const hasBusiness = roles.some((r) => BUSINESS_ROLES.includes(r));
  const hasStudent = roles.includes('student');

  // Nothing left to add. Staff accounts land here too and are deliberately
  // offered nothing — claim_role refuses staff roles anyway.
  const offer = !hasBusiness ? 'vendor' : !hasStudent ? 'student' : null;
  if (!offer) return null;

  function go(role: 'vendor' | 'student') {
    start(async () => {
      try {
        await claimRole(role);
        // Business roles need a profile before the dashboard means anything.
        router.push(role === 'vendor' ? '/onboarding' : '/me');
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not add that account');
      } finally {
        setConfirm(null);
      }
    });
  }

  return (
    <>
      <DropdownMenuItem
        disabled={pending}
        onSelect={(e) => {
          e.preventDefault();
          setConfirm(offer);
        }}
      >
        {pending ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : offer === 'vendor' ? (
          <Briefcase className="size-4 shrink-0" />
        ) : (
          <GraduationCap className="size-4 shrink-0" />
        )}
        {offer === 'vendor' ? 'Add a business account' : 'Add a student account'}
      </DropdownMenuItem>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={offer === 'vendor' ? 'Add a business account?' : 'Add a student account?'}
        description={
          offer === 'vendor'
            ? 'This keeps your student account and adds a business one to the same login, so you can switch between them. You will be taken through business setup next. One login can hold one business, so this choice cannot be swapped for a landlord account later.'
            : 'This adds a student account to the same login, so you can order and book alongside running your business. You can switch between them at any time.'
        }
        confirmLabel={pending ? 'Adding…' : 'Continue'}
        onConfirm={() => confirm && go(confirm)}
      />
    </>
  );
}
