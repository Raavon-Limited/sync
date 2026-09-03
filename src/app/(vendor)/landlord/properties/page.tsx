/**
 * ROUTE: /landlord/properties
 * ACCESS: landlord (gated in proxy.ts)
 * PURPOSE: The hostels this landlord lists, and adding another.
 *
 * WAS A COMING-SOON PLACEHOLDER. The screen came from the landlord branch,
 * where it read a mock array and persisted edits to `localStorage` - a hostel
 * added on a phone did not exist on a laptop, was invisible to a student
 * searching, and never reached the reviewer whose job is to confirm it is real.
 * It now reads `hostels`, which is where the rest of the platform has been
 * looking all along.
 *
 * OCCUPANCY COMES FROM `hostel_availability`, not from counting bookings here.
 * That view already knows what is free, and a second definition of "occupied"
 * would disagree with it the first time a booking was cancelled.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth/queries';
import { PageHeader } from '../(components)/shared/page-header';
import { getLandlordProperties } from '../(components)/landlord-queries';
import { PropertyFormSheet } from '../(components)/properties/property-form-sheet';
import { PropertiesClient } from './properties-client';

export const metadata: Metadata = { title: 'Properties' };

// A listing added a moment ago has to be here a moment later.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/landlord/properties');

  const properties = await getLandlordProperties(user.id);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Properties"
        description="Your hostels and rooms, and how much of each is taken."
      >
        <PropertyFormSheet />
      </PageHeader>

      <PropertiesClient properties={properties} />
    </div>
  );
}
