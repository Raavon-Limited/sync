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
import { MySyncIdCard } from '@/components/account/my-sync-id-card';
import { ProfileForm } from '@/components/account/profile-form';
import { SettingsSection } from '@/components/account/settings-section';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import type { Row } from '@/lib/supabase/row';

export const metadata: Metadata = { title: 'Settings' };

/**
 * Their own verification state, and the fraud block if there is one.
 *
 * `select('*')` plus a cast, not a column list: `verification_blocked_reason`
 * postdates types/database.types.ts. REGENERATE THE TYPES once 20260901270000
 * is applied and this can name its columns.
 */
async function riderState(): Promise<{
  status: string;
  blocked: string | null;
  vehicle: string | null;
  plate: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'unverified', blocked: null, vehicle: null, plate: null };

  const { data } = await supabase
    .from('rider_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  const row = data as unknown as Row | null;
  return {
    status: (row?.verification_status as string) ?? 'unverified',
    blocked: (row?.verification_blocked_reason as string | undefined) ?? null,
    vehicle: (row?.vehicle_type as string | undefined) ?? null,
    plate: (row?.plate_number as string | undefined) ?? null,
  };
}

export default async function Page() {
  const [{ status, blocked, vehicle, plate }, profile, user] = await Promise.all([
    riderState(),
    getProfile(),
    getCurrentUser(),
  ]);

  return (
    <section className="flex flex-col gap-8">
      {/* THE CARD FIRST. A rider is the account most often asked to prove
          itself   at a gate, at a door, by somebody who has never met them
          and is about to hand over food or money. */}
      <SettingsSection
        title="Your Sync ID"
        description="Show this at a gate or a door. The code is checked live, so it tells the truth about your account at the moment it is scanned."
      >
        <MySyncIdCard
          kind="rider"
          holderName={profile?.full_name ?? null}
          context={vehicle ? `Rider · ${vehicle}` : 'Rider'}
          status={status}
          memberSince={user?.created_at ?? null}
          photoUrl={profile?.avatar_url ?? null}
          facts={plate ? [{ label: 'Plate', value: plate }] : []}
          fileName="rider"
        />
      </SettingsSection>

      {/* The card is drawn from these fields, so they sit directly under it.
          A picture the holder can set is the reason this section exists: the
          card had a slot for one and nowhere in the product to fill it. */}
      <SettingsSection
        title="Your information"
        description="Your picture and how you are reached. A face on your ID is what a customer at a gate is actually checking   it is not the ID document you sent a reviewer, which stays private."
      >
        <ProfileForm />
      </SettingsSection>

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
