/**
 * ROUTE: /admin/riders/[id]
 * ACCESS: admin / super_admin only, enforced here AND in every server action.
 * PURPOSE: One rider — their record, their documents, and the two decisions.
 *
 * KEYED ON THE PROFILE ID, NOT A SLUG. rider_profiles has no slug: it is keyed
 * on profiles.id, because a rider is a person rather than a business with a
 * public page. The id is what every other rider query already uses.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';
import { RiderDetail } from '../(components)/rider-detail';
import type { AdminRider } from '../(components)/riders-console';

export const metadata: Metadata = { title: 'Rider — Admin' };

const ACTIVE = new Set(['assigned', 'picked_up', 'delivering']);

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await requireStaffArea('riders');

  const db = createAdminClient();

  const { data: riderRow } = await db
    .from('rider_profiles')
    .select(
      'id, vehicle_type, plate_number, verification_status, verification_blocked_at, company_id, is_online, rating_avg, deliveries_count, created_at',
    )
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle();

  const r = riderRow as Row | null;
  if (!r) notFound();

  const [{ data: person }, { data: company }, { data: docs }, { data: jobs }] = await Promise.all([
    db
      .from('profiles')
      .select('full_name, phone, suspended_at, suspended_reason')
      .eq('id', id)
      .maybeSingle(),
    r.company_id
      ? db.from('logistics_companies').select('name').eq('id', r.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from('verification_documents')
      .select('id, doc_type, title, status, storage_path, action_message, uploaded_at')
      .eq('owner_id', id)
      .order('uploaded_at', { ascending: false }),
    db.from('deliveries').select('status, fee_kobo').eq('rider_id', id).limit(1000),
  ]);

  const p = person as Row | null;

  let delivered = 0;
  let active = 0;
  let earnedKobo = 0;
  for (const j of (jobs ?? []) as Row[]) {
    if (j.status === 'delivered') {
      delivered++;
      earnedKobo += Number(j.fee_kobo ?? 0);
    } else if (ACTIVE.has(j.status)) {
      active++;
    }
  }

  const rider: AdminRider = {
    id,
    name: p?.full_name ?? 'Unnamed rider',
    phone: p?.phone ?? null,
    vehicleType: r.vehicle_type ?? 'motorcycle',
    plateNumber: r.plate_number ?? null,
    verificationStatus: r.verification_status ?? 'unverified',
    blocked: r.verification_blocked_at != null,
    suspendedAt: p?.suspended_at ?? null,
    suspendedReason: p?.suspended_reason ?? null,
    companyName: (company as Row | null)?.name ?? null,
    isOnline: r.is_online === true,
    ratingAvg: Number(r.rating_avg ?? 0),
    delivered,
    active,
    earnedKobo,
    createdAt: r.created_at,
    docs: ((docs ?? []) as Row[]).map((d) => ({
      id: d.id,
      docType: d.doc_type,
      title: d.title,
      status: d.status,
      storagePath: d.storage_path,
      actionMessage: d.action_message ?? null,
      uploadedAt: d.uploaded_at,
    })),
  };

  return (
    <section className="flex flex-col gap-4">
      <Link
        href="/admin/riders"
        className="text-content-muted hover:text-content inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All riders
      </Link>

      <RiderDetail rider={rider} />
    </section>
  );
}
