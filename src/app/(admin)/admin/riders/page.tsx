/**
 * ROUTE: /admin/riders
 * ACCESS: admin / super_admin only, enforced here AND in every server action.
 * PURPOSE: The people who actually move the orders — verify them, see what they
 *          have delivered, and freeze one who should not be working.
 *
 * WHY THIS PAGE DID NOT EXIST UNTIL NOW
 *   The rider system has been in the database since 20260817090200:
 *   rider_profiles, deliveries, delivery_offers and a position view that only
 *   leaks a rider's location while a job is in flight. Every table was correct
 *   and nothing had ever written to one, because there was no screen. This is
 *   the staff half of that; the rider's own half is the /rider app.
 *
 * THE COUNTS ARE COMPUTED HERE, NOT READ OFF THE PROFILE
 *   rider_profiles.deliveries_count exists and is maintained by trigger, but it
 *   answers "how many, ever" — and the question a reviewer actually has is
 *   "what has this person been doing lately, and is anything stuck". So the
 *   recent deliveries are fetched and aggregated per rider instead, which also
 *   surfaces in-flight jobs a suspension would strand.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { selfieUrlsFor } from '@/modules/admin/selfies';
import { AccountTabs } from '@/components/admin/account-tabs';
import { RidersConsole, type AdminRider } from './(components)/riders-console';

export const metadata: Metadata = { title: 'Riders — Admin' };

type Row = Record<string, unknown>;

/** In flight: claimed but not yet delivered. A suspension strands these. */
const ACTIVE = new Set(['assigned', 'picked_up', 'delivering']);

export default async function Page() {
  await requireStaffArea('riders');

  const db = createAdminClient();

  const { data: riderRows } = await db
    .from('rider_profiles')
    // ONE LITERAL, NOT A CONCATENATION. supabase-js infers the row type from
    // the select string, and only a literal can be inferred - a concatenation
    // is just `string`, which silently degrades the result to an unchecked
    // type and takes the column-name checking with it.
    .select(
      'id, vehicle_type, plate_number, verification_status, verification_blocked_at, company_id, is_online, rating_avg, deliveries_count, created_at',
    )
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  const riders = (riderRows ?? []) as Row[];
  const ids = riders.map((r) => r.id as string);

  // Nothing to join against. Returning early keeps the `.in()` calls below from
  // being issued with an empty list, which PostgREST answers with everything.
  if (ids.length === 0) {
    return <Shell rows={[]} />;
  }

  const [{ data: people }, { data: companies }, { data: docs }, { data: jobs }] = await Promise.all(
    [
      db
        .from('profiles')
        .select('id, full_name, phone, suspended_at, suspended_reason')
        .in('id', ids),
      db
        .from('logistics_companies')
        .select('id, name, verification_status')
        .is('archived_at', null),
      // Same shape as the vendor queue: documents point at profiles, not at the
      // role table, so they are fetched by owner and grouped here.
      db
        .from('verification_documents')
        .select('id, owner_id, doc_type, title, status, storage_path, action_message, uploaded_at')
        .in('owner_id', ids)
        .order('uploaded_at', { ascending: false }),
      db
        .from('deliveries')
        .select('id, rider_id, status, fee_kobo, delivered_at')
        .in('rider_id', ids)
        .order('created_at', { ascending: false })
        .limit(1000),
    ],
  );

  const byId = new Map(((people ?? []) as Row[]).map((p) => [p.id as string, p]));
  const companyById = new Map(((companies ?? []) as Row[]).map((c) => [c.id as string, c]));

  const docsByOwner = new Map<string, AdminRider['docs']>();
  for (const d of (docs ?? []) as Row[]) {
    const list = docsByOwner.get(d.owner_id as string) ?? [];
    list.push({
      id: d.id as string,
      docType: d.doc_type as string,
      title: d.title as string,
      status: d.status as string,
      storagePath: d.storage_path as string,
      actionMessage: (d.action_message as string) ?? null,
      uploadedAt: d.uploaded_at as string,
    });
    docsByOwner.set(d.owner_id as string, list);
  }

  const stats = new Map<string, { delivered: number; active: number; earnedKobo: number }>();
  for (const j of (jobs ?? []) as Row[]) {
    const key = j.rider_id as string;
    const s = stats.get(key) ?? { delivered: 0, active: 0, earnedKobo: 0 };
    const status = j.status as string;
    if (status === 'delivered') {
      s.delivered++;
      s.earnedKobo += Number(j.fee_kobo ?? 0);
    } else if (ACTIVE.has(status)) {
      s.active++;
    }
    stats.set(key, s);
  }

  const selfieByOwner = await selfieUrlsFor(ids);

  const rows: AdminRider[] = riders.map((r) => {
    const id = r.id as string;
    const person = byId.get(id);
    const company = r.company_id ? companyById.get(r.company_id as string) : undefined;
    const s = stats.get(id) ?? { delivered: 0, active: 0, earnedKobo: 0 };

    return {
      id,
      // A rider who has not set a name yet is still a row somebody must review,
      // so they get a placeholder rather than being dropped from the list.
      name: (person?.full_name as string) ?? 'Unnamed rider',
      phone: (person?.phone as string) ?? null,
      vehicleType: (r.vehicle_type as string) ?? 'motorcycle',
      plateNumber: (r.plate_number as string) ?? null,
      verificationStatus: (r.verification_status as string) ?? 'unverified',
      blocked: r.verification_blocked_at != null,
      suspendedAt: (person?.suspended_at as string) ?? null,
      suspendedReason: (person?.suspended_reason as string) ?? null,
      companyName: (company?.name as string) ?? null,
      isOnline: r.is_online === true,
      ratingAvg: Number(r.rating_avg ?? 0),
      delivered: s.delivered,
      active: s.active,
      earnedKobo: s.earnedKobo,
      createdAt: r.created_at as string,
      docs: docsByOwner.get(id) ?? [],
      selfieUrl: selfieByOwner.get(id),
    };
  });

  return <Shell rows={rows} />;
}

// Async because AccountTabs asks the database what this viewer may open. The
// two call sites both already await the page, so nothing else changes.
async function Shell({ rows }: { rows: AdminRider[] }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / ACCOUNTS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Riders <span className="text-lime-deep">&amp; fleets.</span>
        </h2>
      </div>

      <AccountTabs active="riders" />

      <RidersConsole riders={rows} />
    </section>
  );
}
