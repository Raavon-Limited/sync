/**
 * The wall between an unverified account and the working app.
 *
 * WHAT "GATED" MEANS HERE
 *   The dashboard still renders. The shell, the nav, the headings and the
 *   shape of every panel are all there - what is missing is data and the
 *   ability to act. Someone waiting on review should be able to see what they
 *   are waiting FOR, which a redirect to a holding page cannot show them.
 *
 * WHY NOT A ROUTE GUARD
 *   Bouncing every unverified account out of /vendor would be less code and
 *   worse: the proxy already gates on role, and adding a second gate on status
 *   means a landlord mid-review cannot see the dashboard they are being
 *   reviewed for. The lock belongs where the data would have been.
 *
 * PENDING IS NOT UNVERIFIED. Both are locked, and they are told different
 * things: one has something to do, the other has only to wait. Showing "verify
 * your account" to someone whose documents are already with a reviewer reads
 * as though the submission was lost.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Clock, Lock } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { VerificationStatus } from '@/modules/verification/types';

export function isLocked(status: VerificationStatus): boolean {
  return status !== 'verified';
}

interface VerifyPromptProps {
  status: VerificationStatus;
  /** Where the verification flow lives for this role. */
  href: string;
  /** What they would be doing here, e.g. "taking orders". Completes the copy. */
  activity: string;
  className?: string;
}

/**
 * The thing shown in place of data. Deliberately states the activity it is
 * standing in for - "Verify your account to start taking orders" beats a bare
 * "Locked", which tells someone nothing about what they are missing.
 */
export function VerifyPrompt({ status, href, activity, className }: VerifyPromptProps) {
  const awaitingReview = status === 'pending';
  const rejected = status === 'rejected';

  return (
    <div
      className={cn(
        'border-line/10 bg-panel flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-full',
          awaitingReview ? 'bg-ink/5 text-content-muted' : 'bg-lime/15 text-accent-fg',
        )}
      >
        {awaitingReview ? <Clock className="size-5" /> : <Lock className="size-5" />}
      </span>

      <div className="flex flex-col gap-1">
        <p className="font-display text-content text-lg">
          {awaitingReview
            ? 'Verification in review'
            : rejected
              ? 'Verification was not approved'
              : `Verify to start ${activity}`}
        </p>
        <p className="text-content-muted max-w-sm text-sm">
          {awaitingReview
            ? `We are checking your details. You will be able to start ${activity} as soon as it is approved   nothing more is needed from you.`
            : rejected
              ? 'Something in your submission did not check out. Send it again with corrected details and we will take another look.'
              : `Your account is set up. Verifying it unlocks ${activity} on Sync.`}
        </p>
      </div>

      {/* Nothing to press while a reviewer has it. A button here would only
          produce a duplicate submission. */}
      {!awaitingReview && (
        <Button asChild className="mt-1">
          <Link href={href}>{rejected ? 'Submit again' : 'Verify now'}</Link>
        </Button>
      )}
    </div>
  );
}

/**
 * Wraps a section that only means something once verified. Renders the section
 * untouched when it is, and the prompt in its place when it is not.
 */
export function VerifyGate({
  status,
  href,
  activity,
  children,
  className,
}: VerifyPromptProps & { children: ReactNode }) {
  if (!isLocked(status)) return <>{children}</>;
  return <VerifyPrompt status={status} href={href} activity={activity} className={className} />;
}
