/**
 * ROUTE: /user/settings
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
import { ProfileForm } from '@/components/account/profile-form';
import { SettingsSection } from '@/components/account/settings-section';
import { Button } from '@/components/ui';
import { getMyStudentIdentity } from '@/modules/students';
import { MySyncIdCard } from '@/components/account/my-sync-id-card';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';

export const metadata: Metadata = { title: 'Settings' };

export default async function Page() {
  const [identity, profile, user] = await Promise.all([
    getMyStudentIdentity(),
    getProfile(),
    // The join date lives on the auth user, not on the profile row.
    getCurrentUser(),
  ]);

  const details: { label: string; value: string | null }[] = [
    { label: 'Matric number', value: identity.matricNumber },
    { label: 'Department', value: identity.department },
    { label: 'Level', value: identity.level },
  ];
  const missing = details.filter((d) => !d.value);

  return (
    <section className="flex flex-col gap-8">
      {/* THE CARD FIRST. It is the thing somebody came to this page to get  
          proof they can hold up   and the sections below are the details that
          decide what it says. Landlords have had one since the card existed;
          a student turning up to view a room had nothing to show. */}
      <SettingsSection
        title="Your Sync ID"
        description="Show this when somebody asks whether you are really on Sync. The code is checked live, so it always tells the truth about your account   including if it is ever suspended."
      >
        <MySyncIdCard
          kind="student"
          holderName={profile?.full_name ?? null}
          context={identity.department ? `Student · ${identity.department}` : 'Student'}
          status={identity.verificationStatus}
          memberSince={user?.created_at ?? null}
          photoUrl={profile?.avatar_url ?? null}
          facts={
            identity.matricNumber ? [{ label: 'Matric number', value: identity.matricNumber }] : []
          }
          fileName="student"
        />
      </SettingsSection>

      {/* DIRECTLY UNDER THE CARD, because it is what the card is made of.
          There was nowhere on this page to change a name, and no way anywhere
          in the product for a person to add a picture of themselves   so every
          student's card carried an initial in a circle and their own dashboard
          greeted a letter. The form was private to /user/profile, a page
          nothing links to prominently; it is shared now. */}
      <SettingsSection
        title="Your information"
        description="Your picture and how you are reached. The picture is yours to choose and yours to remove   it is not the ID document you sent a reviewer, which stays private."
      >
        <ProfileForm />
      </SettingsSection>

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
              <Link href="/user/verify">
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
          continueHref="/user/verify"
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
