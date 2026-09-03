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
import { listAreas } from '@/modules/areas/queries';
import { listRoomTypes } from '@/modules/room-types/queries';
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

  // AREAS ARE ROWS, NOT A CONST. 0007 moved them into the database precisely
  // so a new area or a corrected coordinate is an insert rather than a deploy,
  // and the form was still reading the hardcoded fallback list.
  //
  // No campus filter yet: `profiles.campus_id` is only populated for students
  // at signup, so a landlord has none to scope by. `listAreas` takes one for
  // the day they do   see 20260907120000_areas_by_campus.
  const [properties, areas, roomTypes] = await Promise.all([
    getLandlordProperties(user.id),
    listAreas(),
    listRoomTypes(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Properties"
        description="Your hostels and rooms, and how much of each is taken."
      >
        <PropertyFormSheet areas={areas} roomTypes={roomTypes} />
      </PageHeader>

      <PropertiesClient properties={properties} areas={areas} roomTypes={roomTypes} />
    </div>
  );
}
