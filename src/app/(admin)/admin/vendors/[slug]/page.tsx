/**
 * ROUTE: /admin/vendors/[slug]
 * ACCESS: admin / super_admin only, enforced here AND in every server action.
 * PURPOSE: One business, its documents, and the decision.
 *
 * WHY THIS EXISTS NOW
 *   The vendor queue used to render every folder inline, so a reviewer scanning
 *   forty businesses was loading forty sets of signed identity photos and
 *   reading the one they cared about in a column an eighth of the screen wide.
 *   The landlord side has had a page per account since it was built; this is the
 *   same shape, for the same reason   comparing a face to an ID needs room.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { emailFor } from '@/modules/admin/emails';
import type { Row } from '@/lib/supabase/row';
import { VerificationReview, type AdminVendor } from '@/components/admin/verification-review';

export const metadata: Metadata = { title: 'Vendor   Admin' };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  await requireStaffArea('vendors');

  const admin = createAdminClient();

  const { data: vendor } = await admin
    .from('vendor_profiles')
    .select('id, business_name, slug, category, area, verification_status, created_at')
    .eq('slug', slug)
    // A landlord reached through this route would be reviewed without the
    // property context /admin/landlord/[slug] exists to give. Not found is the
    // honest answer for this page.
    .neq('category', 'landlord')
    .is('archived_at', null)
    .maybeSingle();

  const v = vendor as Row | null;
  if (!v) notFound();

  const [{ data: docs }, email] = await Promise.all([
    admin
      .from('verification_documents')
      .select('id, doc_type, title, status, storage_path, action_message, uploaded_at')
      .eq('owner_id', v.id)
      .order('uploaded_at', { ascending: false }),
    // vendor_profiles.id IS the owner profile id, so this is their address.
    emailFor(v.id as string),
  ]);

  const row: AdminVendor = {
    id: v.id,
    businessName: v.business_name ?? 'Unnamed business',
    slug: v.slug,
    category: v.category ?? ' ',
    area: v.area ?? null,
    verificationStatus: v.verification_status ?? 'unverified',
    createdAt: v.created_at,
    email,
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
        href="/admin/vendors"
        className="text-content-muted hover:text-content inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All vendors
      </Link>

      <VerificationReview vendor={row} />
    </section>
  );
}
