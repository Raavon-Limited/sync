/**
 * ROUTE: /rider/profile
 * ACCESS: authenticated rider (the /rider prefix is gated in proxy.ts)
 * PURPOSE: Who this rider is on Sync - the card they hold up at a gate, and the
 * picture and contact details behind it.
 *
 * A RIDER IS THE ACCOUNT MOST OFTEN ASKED TO PROVE ITSELF
 *   At a gate, at a door, by somebody who has never met them and is about to
 *   hand over food or money. The card lived on Settings, three sections down a
 *   page about verification documents; it is the point of the account, so it
 *   has a page.
 *
 * THE STATUS COMES FROM rider_profiles
 *   Not from `profiles.verification_status`, which is the mirror of
 *   vendor_profiles - a rider who also sells food would read back the business
 *   decision. getRiderProfile() is the authority and already resolves it.
 */
import type { Metadata } from 'next';
import { AccountProfile } from '@/components/account/account-profile';
import { MySyncIdCard } from '@/components/account/my-sync-id-card';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { getRiderProfile } from '@/modules/rider/queries';

export const metadata: Metadata = { title: 'Profile' };

export default async function Page() {
  const [rider, profile, user] = await Promise.all([
    getRiderProfile(),
    getProfile(),
    // The join date lives on the auth user, not on the profile row.
    getCurrentUser(),
  ]);

  // Null when they have never onboarded as a rider. The card still draws - it
  // reads NOT VERIFIED, which is the truth about them and better than an empty
  // page for somebody who reached this from the sidebar.
  const status = rider?.verificationStatus ?? 'unverified';

  return (
    <AccountProfile
      verificationStatus={status}
      cardDescription="Show this at a gate or a door. The code is checked live, so it tells the truth about your account at the moment it is scanned."
      idCard={
        <MySyncIdCard
          kind="rider"
          holderName={profile?.full_name ?? null}
          context={rider?.vehicleType ? `Rider · ${rider.vehicleType}` : 'Rider'}
          status={status}
          memberSince={user?.created_at ?? null}
          photoUrl={profile?.avatar_url ?? null}
          facts={rider?.plateNumber ? [{ label: 'Plate', value: rider.plateNumber }] : []}
          fileName="rider"
        />
      }
    />
  );
}
