/**
 * ROUTE: /admin/verify-visits
 * ACCESS: admin / super_admin only, enforced here and again in every action.
 * PURPOSE: Hostel verification visits — review an ambassador's evidence and
 *          decide whether a hostel is real.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { VisitsQueue, type AdminVisit, type UnvisitedHostel } from './(components)/visits-queue';

export const metadata: Metadata = { title: 'Verification visits — Admin' };

import type { Row } from '@/lib/supabase/row';

export default async function Page() {
  await requireStaffArea('verify_visits');

  const admin = createAdminClient();

  const [{ data: visits }, { data: hostels }, { data: profiles }] = await Promise.all([
    admin
      .from('hostel_verification_visits')
      .select(
        'id, hostel_id, ambassador_id, status, scheduled_for, photos, video_url, notes, submitted_at, decided_at',
      )
      .order('updated_at', { ascending: false }),
    admin.from('hostels').select('id, name, area, verified').is('archived_at', null),
    // Ambassador names: `profiles` is own-row-only under RLS, so the service
    // role is the only way to resolve them, and only here.
    admin.from('profiles').select('id, full_name'),
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

  // Hostels with no open or completed visit at all — nobody has been sent.
  const visitedIds = new Set(rows.map((r) => r.hostelId));
  const unvisited: UnvisitedHostel[] = ((hostels ?? []) as Row[])
    .filter((h) => !visitedIds.has(h.id))
    .map((h) => ({ id: h.id, name: h.name, area: h.area ?? null }));

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
      <VisitsQueue visits={rows} unvisited={unvisited} />
    </section>
  );
}
