/**
 * The strip that asks a student to finish what signup started.
 *
 * WHY NOT VerificationBanner
 *   That one exists and is good, and it is wired to VerifyNowSheet, which
 *   opens the VENDOR onboarding wizard   business name, what you sell, an
 *   address. Pointing a student at it would ask them for a trade. Same idea,
 *   different destination, so it is a different component rather than a prop
 *   that makes the other one mean two things.
 *
 * IT SAYS WHAT IS OUTSTANDING, NOT JUST THAT SOMETHING IS
 *   "Your account is unverified" is a state, not an instruction. The list comes
 *   from requirementsFor('student'), so it stays right if the requirements
 *   change, and it names the two documents a person has to go and find.
 *
 * IT DISAPPEARS ON ITS OWN. Verified renders nothing at all   a dashboard that
 * keeps congratulating you is a dashboard with a permanent strip of noise. The
 * pending state stays, because "we have it, wait" is the answer to the question
 * somebody would otherwise ask again.
 */
import { AlertCircle, Clock } from 'lucide-react';
import { requirementsFor } from '@/modules/verification/requirements';
import { VerifySheet } from '@/components/verification/verify-sheet';

export function VerifyReminder({ status }: { status: string }) {
  if (status === 'verified') return null;

  if (status === 'pending') {
    return (
      <div className="border-line/15 bg-panel flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
        <Clock className="text-content-muted mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="text-content-muted text-sm">
          <span className="text-content font-medium">Your documents are with a reviewer.</span> You
          will hear back here there is nothing else to send.
        </p>
      </div>
    );
  }

  const asked = requirementsFor('student').map((r) => r.label);

  return (
    <div className="border-coral/30 bg-coral/5 flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="text-coral mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="text-content-muted text-sm">
          <span className="text-content font-medium">Finish setting up your account.</span> Sync
          asks students for {asked.join(' and ').toLowerCase()} before a landlord will take a
          booking seriously.
        </p>
      </div>
      {/* A panel over the dashboard, not a trip to /me/verify. The reason they
          are filling it in is the screen behind it. */}
      <VerifySheet role="student" status={status}>
        <button
          type="button"
          className="text-coral shrink-0 cursor-pointer text-sm font-medium underline underline-offset-2 sm:ml-3"
        >
          Get verified
        </button>
      </VerifySheet>
    </div>
  );
}
