/**
 * ROUTE: /vendor/settings
 * ACCESS: authenticated vendor
 * PURPOSE: Account settings, organised into sections - verification documents
 * and the danger zone (delete account). Add further setting classes as sections.
 */
import type { Metadata } from 'next';
import { BusinessProfileForm } from '@/components/account/business-profile-form';
import { DeleteAccountButton } from '@/components/account/delete-account-button';
import { DocumentsPanel } from '@/components/account/documents-panel';
import { SettingsSection } from '@/components/account/settings-section';

export const metadata: Metadata = { title: 'Settings' };

export default function Page() {
  return (
    <section className="flex flex-col gap-8">
      {/* The old line — "your name, contact details and address as students see
          them on your storefront" — described a page that no longer exists.
          The ID card is the first thing here now and is not something students
          see on a storefront at all; it is something you show a customer
          standing in front of you. A description that does not match the
          screen is worse than none, because it is read as instructions. */}
      <SettingsSection
        title="Business profile"
        description="Your ID card for customers who ask if you are verified, and the details behind it."
      >
        <BusinessProfileForm />
      </SettingsSection>

      <SettingsSection
        title="Verification documents"
        description="Your uploaded business documents (CAC, ID, proof of address) and their verification status."
      >
        <DocumentsPanel />
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
