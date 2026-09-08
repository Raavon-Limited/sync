/**
 * ROUTE: /landlord
 * ACCESS: authenticated landlord.
 * PURPOSE: Landlord dashboard   KPIs, booking requests, revenue, hostels.
 *
 * Was entirely mock: `@/mock/StatsCard` for the KPIs and revenue chart, and
 * three hardcoded students with Unsplash avatars as "pending requests". All of
 * it now comes from the landlord's own hostels, their real booking requests,
 * and the ledger.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RoleDashboard } from '@/components/dashboard/role-dashboard';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/modules/auth/queries';
import { PropertyCard, type Property } from './(components)/HostelCards';
import { getLandlordDashboard } from './(components)/landlord-data';
import { PendingBookingRequests } from './(components)/bookings/pending-booking-requests';

export const metadata: Metadata = { title: 'Landlord dashboard' };

import type { Row } from '@/lib/supabase/row';

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const db = await createClient();
  const [dashboard, { data: hostels }, { data: availability }] = await Promise.all([
    getLandlordDashboard(user.id),
    db
      .from('hostels')
      .select('id, name, slug, archived_at, hostel_images(url)')
      .eq('landlord_id', user.id)
      .is('archived_at', null),
    db.from('hostel_availability').select('*'),
  ]);

  const availById = new Map(((availability ?? []) as Row[]).map((a) => [a.hostel_id, a]));

  const properties: Property[] = ((hostels ?? []) as Row[]).map((h) => {
    const a = availById.get(h.id);
    const total = a?.rooms_total ?? 0;
    return {
      id: h.id,
      name: h.name,
      roomsTotal: total,
      // "Booked" is total minus free   the card counts occupancy, the view
      // counts vacancy, and inverting it in the wrong place is how a full
      // hostel renders as empty.
      roomsBooked: Math.max(0, total - (a?.rooms_available ?? 0)),
      status: 'Active',
      imageUrl: h.hostel_images?.[0]?.url ?? undefined,
    };
  });

  return (
    /* The dashboard rendered the shared pending list with NO handlers, so
       Accept here ran acceptOrderMock - a timer that changes nothing and fails
       8% of the time - while the same decision on /landlord/requests ran for
       real. Both write `awaiting_payment` now. */
    <RoleDashboard
      variant="landlord"
      count={dashboard.count}
      kpis={dashboard.kpis}
      pending={dashboard.pending}
      chart={dashboard.chart}
      pendingList={<PendingBookingRequests items={dashboard.pending} />}
    >
      <section>
        <h2 className="text-content-muted mb-2 max-w-xl font-mono text-sm tracking-wide">
          MY HOSTELS
        </h2>
        {properties.length === 0 ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-sm">
            No hostels listed yet.
          </p>
        ) : (
          <PropertyCard properties={properties} />
        )}
      </section>
    </RoleDashboard>
  );
}
