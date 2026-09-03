/**
 * ROUTE: /admin/verify-visits
 * ACCESS: admin / super_admin only, enforced here and again in every action.
 * PURPOSE: Hostel verification visits   review an ambassador's evidence and
 *          decide whether a hostel is real.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { hostelFactsFromRow } from '@/components/shared/hostel-facts';
import {
  VisitsQueue,
  type AdminVisit,
  type UnvisitedHostel,
  type AgentOption,
} from './(components)/visits-queue';

export const metadata: Metadata = { title: 'Verification visits   Admin' };

import type { Row } from '@/lib/supabase/row';

const HOSTEL_COLUMNS =
  'id, name, area, verified, address, landmark, room_type, price_per_session_kobo, inspection_fee_kobo, amenities, house_rules, description, lat, lng, hostel_images(url, position, kind)';

export default async function Page() {
  await requireStaffArea('verify_visits');

  const admin = createAdminClient();

  const [{ data: visits }, { data: hostels }, { data: profiles }] = await Promise.all([
    admin
      .from('verification_visits')
      .select(
        'id, hostel_id, ambassador_id, status, scheduled_for, photos, video_url, notes, submitted_at, decided_at',
      )
      .order('updated_at', { ascending: false }),
    // THE WHOLE LISTING, because this is the screen where somebody decides
    // whether it is real. It used to select four columns, so a reviewer saw a
    // name and an area and none of the claims the agent's photographs are
    // supposed to corroborate.
    admin.from('hostels').select(HOSTEL_COLUMNS).is('archived_at', null),
    // Ambassador names: `profiles` is own-row-only under RLS, so the service
    // role is the only way to resolve them, and only here.
    admin
      .from('profiles')
      .select('id, full_name, role, roles, suspended_at')
      .is('archived_at', null),
  ]);

  const nameById = new Map(((profiles ?? []) as Row[]).map((p) => [p.id, p.full_name]));
  const hostelById = new Map(((hostels ?? []) as Row[]).map((h) => [h.id, h]));

  const rows: AdminVisit[] = ((visits ?? []) as Row[]).map((v) => {
    const h = hostelById.get(v.hostel_id);
    return {
      id: v.id,
      hostelId: v.hostel_id,
      hostelName: h?.name ?? 'Unknown hostel',
      hostelArea: h?.area ?? null,
      hostelVerified: !!h?.verified,
      hostel: h ? hostelFactsFromRow(h) : null,
      ambassadorId: v.ambassador_id ?? null,
      ambassadorName: nameById.get(v.ambassador_id) ?? null,
      status: v.status,
      scheduledFor: v.scheduled_for ?? null,
      submittedAt: v.submitted_at ?? null,
      decidedAt: v.decided_at ?? null,
      photos: (v.photos ?? []) as string[],
      videoUrl: v.video_url ?? null,
      notes: v.notes ?? null,
    };
  });

  // Hostels with no open or completed visit at all   nobody has been sent.
  const visitedIds = new Set(rows.map((r) => r.hostelId));
  const unvisited: UnvisitedHostel[] = ((hostels ?? []) as Row[])
    .filter((h) => !visitedIds.has(h.id))
    .map((h) => ({
      id: h.id,
      name: h.name,
      area: h.area ?? null,
      // Same shape the visit cards use, so the panel is identical whichever
      // list you opened it from.
      hostel: hostelFactsFromRow(h),
    }));

  // An agent is anyone HOLDING the role, not only anyone currently wearing it
  // — an admin who also does visits is both, and leaving them out would make
  // them unassignable. Same rule as /admin/agents, deliberately.
  const openByAgent = new Map<string, number>();
  for (const v of rows) {
    if (!v.ambassadorId) continue;
    if (v.status === 'Verified' || v.status === 'Rejected') continue;
    openByAgent.set(v.ambassadorId, (openByAgent.get(v.ambassadorId) ?? 0) + 1);
  }

  const agents: AgentOption[] = ((profiles ?? []) as Row[])
    .filter((p) => p.role === 'agent' || (p.roles as string[] | null)?.includes('agent'))
    .map((p) => ({
      id: p.id as string,
      name: (p.full_name as string) ?? 'No name set',
      suspended: !!p.suspended_at,
      open: openByAgent.get(p.id as string) ?? 0,
    }))
    .sort((a, b) => a.open - b.open || a.name.localeCompare(b.name));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">
          ADMIN / VERIFICATION VISITS
        </h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Is it <span className="text-lime-deep">really there?</span>
        </h2>
      </div>
      <VisitsQueue visits={rows} unvisited={unvisited} agents={agents} />
    </section>
  );
}
