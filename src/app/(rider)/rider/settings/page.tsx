/**
 * ROUTE: /rider/settings
 * ACCESS: authenticated rider (the /rider prefix is gated in proxy.ts)
 * PURPOSE: Where this rider's verification stands, and the danger zone.
 *
 * WHY THIS PAGE DID NOT EXIST
 *   A rider uploaded their documents once, inside /rider/join, and after that
 *   had nowhere to look. If a reviewer bounced the licence photo, the message
 *   went onto a screen the rider had already finished with - so the only way to
 *   find out was to ask. Vendors and landlords have had this panel since it was
 *   written; the two roles most likely to be mid-review had nothing.
 *
 * THE STATUS COMES FROM rider_profiles
 *   Not from the session. `profiles.verification_status` is the mirror of
 *   vendor_profiles, so a rider who also sells food would read back the
 *   business decision - the same confusion that made a verified student look
 *   unverified on their own dashboard.
 */
import type { Metadata } from 'next';
import { DeleteAccountButton } from '@/components/account/delete-account-button';
import { DocumentsPanel } from '@/components/account/documents-panel';
import { SettingsSection } from '@/components/account/settings-section';
import { createClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/supabase/row';

export const metadata: Metadata = { title: 'Settings' };

/**
 * Their own verification state, and the fraud block if there is one.
 *
 * `select('*')` plus a cast, not a column list: `verification_blocked_reason`
 * postdates types/database.types.ts. REGENERATE THE TYPES once 20260901270000
 * is applied and this can name its columns.
 */
async function riderState(): Promise<{ status: string; blocked: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'unverified', blocked: null };

  const { data } = await supabase
    .from('rider_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  const row = data as unknown as Row | null;
  return {
    status: (row?.verification_status as string) ?? 'unverified',
    blocked: (row?.verification_blocked_reason as string | undefined) ?? null,
  };
}

export default async function Page() {
  const { status, blocked } = await riderState();

  return (
    <section className="flex flex-col gap-8">
      <SettingsSection
        title="Verification documents"
        description="What you have uploaded, where each one stands, and anything a reviewer has sent back."
      >
        <DocumentsPanel
          role="rider"
          status={status}
          blockedReason={blocked}
          continueHref="/rider/join"
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
