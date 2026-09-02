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
import { createClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/supabase/row';

/**
 * The permanent-rejection reason, if there is one.
 *
 * Read here rather than from the session because the block lives on
 * `vendor_profiles` (the business) and the session carries `profiles` (the
 * account). Null for every ordinary rejection, which stays re-submittable.
 *
 * `select('*')` plus a cast, not a column list: `verification_blocked_reason`
 * postdates types/database.types.ts. REGENERATE THE TYPES once
 * 20260901260000 is applied and this can name the column.
 */
async function blockedReason(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  const row = data as unknown as Row | null;
  return (row?.verification_blocked_reason as string | undefined) ?? null;
}

export const metadata: Metadata = { title: 'Settings' };

export default async function Page() {
  const blocked = await blockedReason();
  return (
    <section className="flex flex-col gap-8">
      {/* The old line   "your name, contact details and address as students see
          them on your storefront"   described a page that no longer exists.
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
        <DocumentsPanel blockedReason={blocked} />
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
