/**
 * ROUTE: /landlord/profile
 * ACCESS: authenticated landlord
 * PURPOSE: Who this landlord is on Sync - the ID card a student asks to see
 * before viewing a room, the business details behind it, and the person's own
 * picture and contact details.
 *
 * IT MOVED OFF SETTINGS, for the reason set out in AccountProfile: a card and a
 * photograph are not settings, and they were sitting above the verification
 * panel that /landlord/settings exists for.
 */
import type { Metadata } from 'next';
import { AccountProfile } from '@/components/account/account-profile';
import { BusinessProfileForm } from '@/components/account/business-profile-form';

export const metadata: Metadata = { title: 'Profile' };

export default function Page() {
  return (
    <AccountProfile
      cardTitle="Business profile"
      cardDescription="Your name, contact details and address as students see them on your hostels."
      idCard={<BusinessProfileForm />}
    />
  );
}
