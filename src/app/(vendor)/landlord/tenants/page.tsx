/**
 * ROUTE: /landlord/tenants
 * ACCESS: landlord (gated in proxy.ts)
 * PURPOSE: Who is actually in the rooms, and where each of them stands on rent.
 *
 * WAS A COMING-SOON PLACEHOLDER, and the landlord branch never built it - it
 * had the table component but no page. The table is that component, filled from
 * `bookings` joined to the student's profile.
 *
 * "TENANT" IS A BOOKING THAT WENT THROUGH, not a separate record. There is no
 * tenants table and there should not be one: a tenancy IS a confirmed booking,
 * and a second table would be a second answer to "is this room taken".
 *
 * THE VERIFIED BADGE IS THE STUDENT'S OWN, read from their profile rather than
 * decided here. A landlord about to hand over keys is exactly who it was put
 * there for.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth/queries';
import { PageHeader } from '../(components)/shared/page-header';
import { TenantsTable } from '../(components)/bookings/tenants-table';
import { getLandlordProperties, getLandlordTenants } from '../(components)/landlord-queries';

export const metadata: Metadata = { title: 'Tenants' };

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/landlord/tenants');

  const [tenants, properties] = await Promise.all([
    getLandlordTenants(user.id),
    getLandlordProperties(user.id),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tenants"
        description="Everyone currently in one of your rooms, and where they stand on rent."
      />
      <TenantsTable tenants={tenants} properties={properties} />
    </div>
  );
}
