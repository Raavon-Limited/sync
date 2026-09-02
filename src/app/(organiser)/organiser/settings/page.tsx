/**
 * ROUTE: /organiser/settings
 * ACCESS: authenticated event organiser (the /organiser prefix is gated in proxy.ts)
 * PURPOSE: Where this organiser's verification stands, and the danger zone.
 *
 * THE SESSION IS THE AUTHORITY HERE, AND ONLY HERE
 *   For a student the status on `profiles` is the vendor MIRROR and must not be
 *   read; for an organiser it is the real thing, because neither an organiser
 *   nor a creator can hold a business row - see set_personal_verification and
 *   20260903120000. So this page passes nothing and the panel reads the
 *   session, which is correct for exactly this role.
 *
 * UPLOADING STILL HAPPENS AT /user/verify
 *   That screen is role-driven and serves every account whose status lives in
 *   profiles, which is why the organiser nav has always pointed at it. This
 *   page reports; that one collects.
 */
import type { Metadata } from 'next';
import { DeleteAccountButton } from '@/components/account/delete-account-button';
import { DocumentsPanel } from '@/components/account/documents-panel';
import { MySyncIdCard } from '@/components/account/my-sync-id-card';
import { ProfileForm } from '@/components/account/profile-form';
import { SettingsSection } from '@/components/account/settings-section';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';

export const metadata: Metadata = { title: 'Settings' };

export default async function Page() {
  const [profile, user] = await Promise.all([getProfile(), getCurrentUser()]);

  // Read as a plain string: Profile['role'] is a five-value union that predates
  // 'event_manager' and 'creator' existing as roles, and widening it here would
  // ripple into every gate that reads it. See 20260903150000.
  const isCreator = (profile?.role as string | undefined) === 'creator';

  return (
    <section className="flex flex-col gap-8">
      {/* An organiser sells tickets to strangers for an event that has not
          happened yet, which is the same exposure a vendor taking payment for
          undelivered food has. This is what they show a venue or a buyer. */}
      <SettingsSection
        title="Your Sync ID"
        description="Show this to a venue, a sponsor or anyone buying from you. The code is checked live, so it tells the truth about your account at the moment it is scanned."
      >
        <MySyncIdCard
          kind={isCreator ? 'creator' : 'organiser'}
          holderName={profile?.full_name ?? null}
          context={isCreator ? 'Content creator' : 'Event organiser'}
          status={profile?.verification_status ?? 'unverified'}
          memberSince={user?.created_at ?? null}
          photoUrl={profile?.avatar_url ?? null}
          fileName="organiser"
        />
      </SettingsSection>

      {/* The card is drawn from these fields, so they sit directly under it.
          A picture the holder can set is the reason this section exists: the
          card had a slot for one and nowhere in the product to fill it. */}
      <SettingsSection
        title="Your information"
        description="Your picture and how you are reached. It shows on your Sync ID and beside your name   it is not the ID document you sent a reviewer, which stays private."
      >
        <ProfileForm />
      </SettingsSection>

      <SettingsSection
        title="Verification documents"
        description="What you have uploaded, where each one stands, and anything a reviewer has sent back."
      >
        <DocumentsPanel role="event_manager" continueHref="/user/verify" />
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
