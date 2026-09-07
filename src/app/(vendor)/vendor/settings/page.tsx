/**
 * ROUTE: /vendor/settings
 * ACCESS: authenticated vendor
 * PURPOSE: Account settings, organised into sections - verification documents
 * and the danger zone (delete account). Add further setting classes as sections.
 *
 * THE BUSINESS PROFILE IS NOT HERE
 *   The card, the logo and the shopfront details moved to /vendor/profile. They were
 *   the largest thing on a page somebody opens to see what a reviewer did with
 *   their documents, and none of them is a setting.
 */
import type { Metadata } from 'next';
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
