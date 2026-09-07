/**
 * ROUTE: /admin/verify-visits
 * ACCESS: admin / super_admin only, enforced here and again in every action.
 * PURPOSE: Hostel verification visits   review an ambassador's evidence and
 *          decide whether a hostel is real.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { displayName, emailsByAccount } from '@/modules/admin/emails';
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

  const [{ data: visits }, { data: hostels }, { data: stores }, { data: profiles }] =
    await Promise.all([
      admin
        .from('verification_visits')
        .select(
          'id, hostel_id, vendor_id, storefront_id, ambassador_id, status, scheduled_for, brief, photos, video_url, selfie_url, notes, submitted_at, decided_at, decided_by',
        )
        .order('updated_at', { ascending: false }),
      // THE WHOLE LISTING, because this is the screen where somebody decides
      // whether it is real. It used to select four columns, so a reviewer saw a
      // name and an area and none of the claims the agent's photographs are
      // supposed to corroborate.
      admin.from('hostels').select(HOSTEL_COLUMNS).is('archived_at', null),
      // Branches, with the brand attached. NOT filtered on archived_at: a store
      // archived while its visit was open still has to be decidable, and the
      // visit row outlives the shopfront being on the market.
      admin
        .from('storefronts')
        .select(
          'id, name, area, address, public_phone, verified_at, vendor_id, vendor_profiles(business_name)',
        ),
      // Ambassador names: `profiles` is own-row-only under RLS, so the service
      // role is the only way to resolve them, and only here.
      admin
        .from('profiles')
        .select('id, full_name, role, roles, suspended_at')
        .is('archived_at', null),
    ]);

  // SAME FIX AS /admin/agents. `full_name` is null for anyone who accepted an
  // invite and only set a password, so every such agent rendered as the literal
  // "No name set"   including inside the "Send an agent" dropdown, where two of
  // them would have been indistinguishable.
  const emailById = await emailsByAccount();
  const nameById = new Map(
    ((profiles ?? []) as Row[]).map((p) => [
      p.id as string,
      displayName(p.full_name as string | null, emailById.get(p.id as string)),
    ]),
  );
  const hostelById = new Map(((hostels ?? []) as Row[]).map((h) => [h.id, h]));
  const storeById = new Map(((stores ?? []) as Row[]).map((s) => [s.id, s]));

  const rows: AdminVisit[] = ((visits ?? []) as Row[]).map((v) => {
    const h = v.hostel_id ? hostelById.get(v.hostel_id) : null;
    const s = v.storefront_id ? storeById.get(v.storefront_id) : null;

    // EVERY VISIT HAS EXACTLY ONE SUBJECT   the database enforces it
    // (verification_visits_one_subject). This screen used to assume that
    // subject was always a hostel, so a vendor visit rendered as the literal
    // "Unknown hostel" with a dead decision panel underneath it.
    const kind: AdminVisit['kind'] = v.hostel_id ? 'hostel' : v.storefront_id ? 'store' : 'vendor';
    const brand = (s?.vendor_profiles as { business_name?: string } | null)?.business_name ?? null;
    // "Mama Put - Tanke branch". The same string the notification uses, so the
    // alert and the queue name the place identically.
    const storeName = s ? [brand, s.name as string].filter(Boolean).join(' - ') : null;

    return {
      id: v.id,
      kind,
      subjectId: (v.hostel_id ?? v.storefront_id ?? v.vendor_id) as string,
      subjectName: (h?.name as string) ?? storeName ?? 'Unknown subject',
      subjectArea: (h?.area as string) ?? (s?.area as string) ?? null,
      subjectVerified: kind === 'store' ? !!s?.verified_at : !!h?.verified,
      hostel: h ? hostelFactsFromRow(h) : null,
      store: s
        ? {
            brand,
            address: (s.address as string) ?? null,
            phone: (s.public_phone as string) ?? null,
            verifiedAt: (s.verified_at as string) ?? null,
          }
        : null,
      ambassadorId: v.ambassador_id ?? null,
      ambassadorName: nameById.get(v.ambassador_id) ?? null,
      status: v.status,
      scheduledFor: v.scheduled_for ?? null,
      submittedAt: v.submitted_at ?? null,
      decidedAt: v.decided_at ?? null,
      // Resolved from the same map the ambassador uses   staff are profiles too.
      decidedByName: v.decided_by ? (nameById.get(v.decided_by) ?? null) : null,
      photos: (v.photos ?? []) as string[],
      videoUrl: v.video_url ?? null,
      // Collected since 20260909180000 and never rendered, which is why the
      // review panel only ever showed one picture.
      selfieUrl: v.selfie_url ?? null,
      notes: v.notes ?? null,
    };
  });

  // Hostels with no open or completed visit at all   nobody has been sent.
  //
  // HOSTELS ONLY, and there is no store equivalent by design: creating a
  // storefront queues its own visit row (20260912120000), so a store is never
  // in the "no row exists" state this list is computing. A store awaiting
  // somebody shows up in the queue above as 'Not Visited' with no agent.
  const visitedIds = new Set(rows.filter((r) => r.kind === 'hostel').map((r) => r.subjectId));
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
    // Fraud is a decision too   a flagged visit is not still on the agent's plate.
    if (v.status === 'Verified' || v.status === 'Rejected' || v.status === 'Fraud') continue;
    openByAgent.set(v.ambassadorId, (openByAgent.get(v.ambassadorId) ?? 0) + 1);
  }

  const agents: AgentOption[] = ((profiles ?? []) as Row[])
    .filter((p) => p.role === 'agent' || (p.roles as string[] | null)?.includes('agent'))
    .map((p) => ({
      id: p.id as string,
      name: displayName(p.full_name as string | null, emailById.get(p.id as string)),
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
