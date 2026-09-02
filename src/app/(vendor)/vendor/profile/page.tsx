/**
 * ROUTE: /vendor/profile
 * ACCESS: authenticated vendor
 * PURPOSE: Who this vendor is on Sync - the business ID card customers ask for,
 * the details behind it, and the person's own picture and contact details.
 *
 * IT MOVED OFF SETTINGS
 *   "Business profile" was the first and largest section of /vendor/settings,
 *   above the verification panel that page exists for. None of it is a setting:
 *   a card, a logo and a shopfront description are the account itself. Settings
 *   keeps the documents and the danger zone.
 *
 * TWO IDENTITIES ON ONE PAGE, AND THAT IS THE POINT
 *   The business is what a student sees on a storefront; the person is who a
 *   rider hands an order to. A vendor is both, they are edited in two different
 *   places (vendor_profiles and profiles), and having them on one page is what
 *   stops somebody uploading a logo while wondering why their own name still
 *   shows an initial in the header.
 */
import type { Metadata } from 'next';
import { AccountProfile } from '@/components/account/account-profile';
import { BusinessProfileForm } from '@/components/account/business-profile-form';

export const metadata: Metadata = { title: 'Profile' };

export default function Page() {
  return (
    <AccountProfile
      cardTitle="Business profile"
      cardDescription="Your ID card for customers who ask if you are verified, and the details behind it."
      idCard={<BusinessProfileForm />}
    />
  );
}
