/**
 * ROUTE: /me/settings
 * ACCESS: authenticated student
 * PURPOSE: Account settings - where verification stands, and the danger zone.
 *
 * IT SHOWS THE SAME PANEL A LANDLORD GETS
 *   Vendors and landlords have had "Verification documents" on their settings
 *   since the panel was written; a student had a page with nothing on it but a
 *   delete button. So the one role that most often needs to check whether a
 *   reviewer has come back to them was the one role with nowhere to look, and
 *   the answer lived only in a strip on the dashboard that disappears once you
 *   are verified.
 *
 * THE STATUS IS READ HERE, NOT TAKEN FROM THE SESSION
 *   `profiles.verification_status` is the MIRROR of vendor_profiles. For a
 *   student who also lets a room it reports the business decision - which is
 *   how a student an admin had verified was still being told to get verified.
 *   student_profiles is the authority (20260903180000), and only the server can
 *   read it, so it is passed down.
 *
 * WHAT IS MISSING IS SHOWN, INCLUDING THE PARTS THAT ARE NOT DOCUMENTS
 *   A matric number is not a file, and a reviewer cannot approve a school ID
 *   without one - set_student_verification refuses (20260904180000). Listing
 *   the documents alone would leave somebody uploading a card for the third
 *   time wondering why nothing moves.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { DeleteAccountButton } from '@/components/account/delete-account-button';
import { DocumentsPanel } from '@/components/account/documents-panel';
import { SettingsSection } from '@/components/account/settings-section';
import { Button } from '@/components/ui';
import { getMyStudentIdentity } from '@/modules/students';

export const metadata: Metadata = { title: 'Settings' };

export default async function Page() {
  const identity = await getMyStudentIdentity();

  const details: { label: string; value: string | null }[] = [
    { label: 'Matric number', value: identity.matricNumber },
    { label: 'Department', value: identity.department },
    { label: 'Level', value: identity.level },
  ];
  const missing = details.filter((d) => !d.value);

  return (
    <section className="flex flex-col gap-8">
      <SettingsSection
        title="Your student details"
        description="What a reviewer checks your school ID against. Without the matric number and department there is nothing to compare it to, so verification cannot finish."
      >
        <div className="flex flex-col gap-4">
          <dl className="border-line/10 bg-panel grid grid-cols-1 gap-3 rounded-xl border p-4 sm:grid-cols-3">
            {details.map((d) => (
              <div key={d.label} className="min-w-0">
                <dt className="text-content-muted font-mono text-[11px] tracking-wide uppercase">
                  {d.label}
                </dt>
                {/* Named plainly when absent: a blank cell reads as a bug, and
                    "not given" is the thing to act on. */}
                <dd className={d.value ? 'text-content truncate text-sm' : 'text-coral text-sm'}>
                  {d.value || 'Not given'}
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline">
              <Link href="/me/verify">
                {missing.length > 0
                  ? `Add ${missing.length} missing detail${missing.length === 1 ? '' : 's'}`
                  : 'Update these details'}
              </Link>
            </Button>
            {missing.length > 0 && (
              <p className="text-content-muted text-xs">
                Saved here, a reviewer sees them on your account straight away.
              </p>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Verification documents"
        description="What you have uploaded, where each one stands, and anything a reviewer has sent back."
      >
        <DocumentsPanel
          role="student"
          status={identity.verificationStatus}
          continueHref="/me/verify"
        />
      </SettingsSection>

      <SettingsSection
        title="Danger zone"
        description="Irreversible and destructive actions for your account."
      >
        <DeleteAccountButton />
      </SettingsSection>
    </section>
  );
}
