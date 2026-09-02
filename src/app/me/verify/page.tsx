/**
 * ROUTE: /me/verify
 * ACCESS: any signed-in account that verifies through profiles rather than
 *         through a business or rider row.
 * PURPOSE: The step signup does not do — prove you are who you said you are.
 *
 * WHY THIS EXISTS AT ALL
 *   Vendors and landlords get /onboarding, riders get their own setup on their
 *   dashboard, and a student got nothing: they finished signup verified-as-
 *   nobody, with no screen anywhere that would take a document. The account
 *   worked, right up to the point where a landlord wanted to know who was
 *   asking to see a room.
 *
 * IT IS THE SCREEN FOR EVERY ROLE THAT HAS NO OTHER ONE
 *   Which today means students, and on the day the roles open, content creators
 *   and event managers. Nothing below is student-specific: the role comes from
 *   the profile and the documents come from `requirementsFor(role)`, so
 *   connecting a new role to this page is a routing change and nothing more.
 *
 * IT IS NOT A WIZARD. A business needs one because it also has a name, a trade
 * and an address to give. Two to four uploads do not.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProfile } from '@/modules/auth/queries';
import { getMyStudentIdentity } from '@/modules/students';
import { requirementsFor, type VerificationRole } from '@/modules/verification/requirements';
import { VerifyForm } from './(components)/verify-form';

export const metadata: Metadata = { title: 'Get verified' };

/**
 * Roles this page can serve — the ones whose status lives in `profiles` alone.
 *
 * Kept in step with `submit_personal_verification` deliberately: the database
 * refuses anything outside this set, so a role added here and not there would
 * fail at the last step of its own onboarding, after the uploads.
 */
const SERVED: VerificationRole[] = ['student', 'creator', 'event_manager'];

/** Where a role that does NOT verify here is sent instead. */
const ELSEWHERE: Record<string, string> = {
  vendor: '/onboarding',
  landlord: '/onboarding',
  rider: '/rider',
};

export default async function Page() {
  const profile = await getProfile();
  if (!profile) redirect('/login?next=/me/verify');

  const role = profile.role as string;

  // A business or rider has an authority row of its own; submitting through
  // this page would be refused by the RPC after they had uploaded everything.
  if (ELSEWHERE[role]) redirect(ELSEWHERE[role]);

  const served = SERVED.includes(role as VerificationRole)
    ? (role as VerificationRole)
    : ('student' as VerificationRole);

  const asked = requirementsFor(served).length;

  /*
   * A STUDENT'S STATUS COMES FROM student_profiles, NOT FROM profiles.
   *
   * profiles.verification_status is the mirror of vendor_profiles, so for
   * somebody who is a student AND a vendor it reports the business decision.
   * Reading it here would tell a verified student they were rejected the day
   * their shop was. See modules/students.
   */
  const identity = served === 'student' ? await getMyStudentIdentity() : null;
  const status = identity
    ? identity.verificationStatus
    : (profile.verification_status ?? 'unverified');

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <p className="text-content-muted font-mono text-sm tracking-wide">YOUR ACCOUNT</p>
        <h1 className="font-display text-content mt-1 text-3xl">
          Get <span className="text-lime-deep">verified.</span>
        </h1>
        <p className="text-content-muted mt-2 text-sm">
          {asked} {asked === 1 ? 'document' : 'documents'}, reviewed by a person. A verified account
          gets taken seriously by landlords and vendors — an unverified one can browse, but it asks
          a stranger to take your word for it.
        </p>
      </div>

      <VerifyForm
        role={served}
        status={status}
        identity={
          identity
            ? {
                matricNumber: identity.matricNumber,
                department: identity.department,
                level: identity.level,
              }
            : null
        }
      />
    </section>
  );
}
