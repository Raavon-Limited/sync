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
 * UPLOADING STILL HAPPENS AT /me/verify
 *   That screen is role-driven and serves every account whose status lives in
 *   profiles, which is why the organiser nav has always pointed at it. This
 *   page reports; that one collects.
 */
import type { Metadata } from 'next';
import { DeleteAccountButton } from '@/components/account/delete-account-button';
import { DocumentsPanel } from '@/components/account/documents-panel';
import { SettingsSection } from '@/components/account/settings-section';

export const metadata: Metadata = { title: 'Settings' };

export default function Page() {
  return (
    <section className="flex flex-col gap-8">
      <SettingsSection
        title="Verification documents"
        description="What you have uploaded, where each one stands, and anything a reviewer has sent back."
      >
        <DocumentsPanel role="event_manager" continueHref="/me/verify" />
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
