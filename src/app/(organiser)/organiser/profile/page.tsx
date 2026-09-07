/**
 * ROUTE: /organiser/profile
 * ACCESS: authenticated event organiser or creator
 * PURPOSE: Who this organiser is on Sync - the card they show a venue or a
 * buyer, and the picture and contact details behind it.
 *
 * WHY AN ORGANISER HAS A CARD AT ALL
 *   They sell tickets to strangers for an event that has not happened yet,
 *   which is the same exposure a vendor taking payment for undelivered food
 *   has. The card is what a venue, a sponsor or a buyer checks.
 *
 * IT USES profiles.verification_status, AND HERE THAT IS CORRECT
 *   Unlike a student or a rider, an organiser has no separate profile table -
 *   the personal status IS the authority for this role. See verify_card in
 *   20260905090000, which reads it the same way.
 */
import type { Metadata } from 'next';
import { AccountProfile } from '@/components/account/account-profile';
import { MySyncIdCard } from '@/components/account/my-sync-id-card';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';

export const metadata: Metadata = { title: 'Profile' };

export default async function Page() {
  const [profile, user] = await Promise.all([getProfile(), getCurrentUser()]);

  // Read as a plain string: Profile['role'] is a five-value union that predates
  // 'event_manager' and 'creator' existing as roles, and widening it here would
  // ripple into every gate that reads it. See 20260903150000.
  const isCreator = (profile?.role as string | undefined) === 'creator';
  const status = profile?.verification_status ?? 'unverified';

  return (
    <AccountProfile
      verificationStatus={status}
      cardDescription="Show this to a venue, a sponsor or anyone buying from you. The code is checked live, so it tells the truth about your account at the moment it is scanned."
      idCard={
        <MySyncIdCard
          kind={isCreator ? 'creator' : 'organiser'}
          holderName={profile?.full_name ?? null}
          context={isCreator ? 'Content creator' : 'Event organiser'}
          status={status}
          memberSince={user?.created_at ?? null}
          photoUrl={profile?.avatar_url ?? null}
          fileName="organiser"
        />
      }
    />
  );
}
