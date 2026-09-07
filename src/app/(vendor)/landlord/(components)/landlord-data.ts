/**
 * Landlord dashboard data, fetched on the server.
 *
 * WHY SERVER-SIDE
 *   `RoleDashboard` is an async server component that takes its KPIs, pending
 *   list and chart as props. A client hook cannot feed it, so the data is
 *   gathered here and passed down   which also means one fetch produces the
 *   headline count and the list, so they cannot disagree.
 *
 * REVENUE IS WHAT ARRIVED, NOT WHAT WAS AGREED
 *   A confirmed booking is a promise; an escrow release is money. Revenue reads
 *   the ledger, so the dashboard agrees with the wallet. Counting confirmed but
 *   unpaid bookings is how a dashboard ends up flattering.
 */
import 'server-only';
import { Home, BedDouble, Wallet, ClipboardList } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { DashboardKpi } from '@/components/dashboard/role-dashboard';
import type { PendingRequestItem } from '@/components/dashboard/pending-request-card';
import type { RevenueDatum } from '@/components/dashboard/revenue-bar-chart';
import { fetchRevenueSeries } from '@/components/dashboard/fetch-revenue';

import type { Row } from '@/lib/supabase/row';

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

export interface LandlordDashboardData {
  count: number;
  kpis: DashboardKpi[];
  pending: PendingRequestItem[];
  chart: RevenueDatum[];
}

export async function getLandlordDashboard(landlordId: string): Promise<LandlordDashboardData> {
  const db = await createClient();

  const { data: hostels } = await db
    .from('hostels')
    .select('id, name, area, verified')
    .eq('landlord_id', landlordId)
    .is('archived_at', null);

  const hostelIds = ((hostels ?? []) as Row[]).map((h) => h.id as string);

  const [{ data: availability }, { data: bookings }, { data: ledger }] = await Promise.all([
    hostelIds.length
      ? db.from('hostel_availability').select('*').in('hostel_id', hostelIds)
      : Promise.resolve({ data: [] as Row[] }),
    hostelIds.length
      ? db
          .from('bookings')
          .select('id, hostel_id, status, created_at, move_in, hostel:hostels(name, area)')
          .in('hostel_id', hostelIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Row[] }),
    // The landlord's own statement. RLS scopes it to them.
    db.from('wallet_transactions').select('kind, direction, amount_kobo, created_at'),
  ]);

  const roomsFree = ((availability ?? []) as Row[]).reduce(
    (s, a) => s + (a.rooms_available ?? 0),
    0,
  );
  const roomsTotal = ((availability ?? []) as Row[]).reduce((s, a) => s + (a.rooms_total ?? 0), 0);

  const releases = ((ledger ?? []) as Row[]).filter(
    (t) => t.kind === 'escrow_release' && t.direction === 'in',
  );
  const earned = releases.reduce((s, t) => s + Math.abs(t.amount_kobo ?? 0), 0);

  const awaiting = ((bookings ?? []) as Row[]).filter(
    (b) => b.status === 'requested' || b.status === 'interested',
  );

  const kpis: DashboardKpi[] = [
    { label: 'Total Revenue', value: naira(earned), sub: 'released from escrow', icon: Wallet },
    {
      label: 'Hostels',
      value: String(hostels?.length ?? 0),
      sub: `${((hostels ?? []) as Row[]).filter((h) => h.verified).length} verified`,
      icon: Home,
    },
    {
      label: 'Rooms free',
      value: roomsTotal ? `${roomsFree}/${roomsTotal}` : ' ',
      sub: roomsTotal ? 'across all hostels' : 'no rooms listed yet',
      icon: BedDouble,
    },
    {
      label: 'Requests',
      value: String(awaiting.length),
      sub: awaiting.length ? 'need a decision' : 'nothing waiting',
      icon: ClipboardList,
    },
  ];

  const pending: PendingRequestItem[] = awaiting.slice(0, 5).map((b) => ({
    id: b.id as string,
    // The student's name is in `profiles`, which is own-row-only   a landlord
    // genuinely cannot read it. The hostel and dates are shown instead;
    // inventing a name would be worse than omitting one.
    name: (b.hostel?.name as string) ?? 'Hostel request',
    badge: String(b.id).slice(0, 8).toUpperCase(),
    subtitle: b.status === 'interested' ? 'Enquiry' : 'Requested a room',
    tags: [
      (b.hostel?.area as string) ?? 'No area',
      b.move_in
        ? `Move in ${new Date(b.move_in).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`
        : 'No move-in date',
    ],
  }));

  // The chart comes from the same RPC the period switcher calls. This used to
  // build SEVEN DAILY buckets labelled Mon-Sun under a card titled "REVENUE ·
  // LAST 12 WEEKS", and switching period replaced them with twelve weekly
  // ones   so the initial paint never matched its own heading. One chart, one
  // definition, empty buckets still kept because a gap is information.
  const chart = await fetchRevenueSeries('weekly');

  return { count: awaiting.length, kpis, pending, chart };
}
