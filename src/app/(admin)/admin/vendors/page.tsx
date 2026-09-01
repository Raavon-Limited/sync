/**
 * ROUTE: /admin/vendors
 * ACCESS: admin / super_admin only, enforced here AND in every server action.
 * PURPOSE: Vendor verification queue — review uploaded documents and decide
 *          whether a vendor is real.
 *
 * The route guard mirrors /admin/users: read the trusted role, redirect to /403
 * otherwise, then use the service-role client. Admin work is cross-tenant, so
 * it deliberately bypasses RLS — which is exactly why the guard is repeated in
 * `modules/admin/actions` rather than trusted from here alone.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { adminRoleForEmail } from '@/lib/admin-emails';
import { createAdminClient } from '@/lib/supabase/admin';
import { VerificationQueue, type AdminVendor } from './(components)/verification-queue';

export const metadata: Metadata = { title: 'Vendors — Admin' };

type Row = Record<string, unknown>;

export default async function Page() {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  const role = profile?.role ?? adminRoleForEmail(user?.email);
  if (role !== 'admin' && role !== 'super_admin') redirect('/403');

  const admin = createAdminClient();

  const [{ data: vendors }, { data: docs }] = await Promise.all([
    // VENDORS ONLY. A landlord is a vendor_profiles row with category
    // 'landlord', so a query that filters on nothing returns them too - which
    // is how this page ended up being every business on the platform under a
    // nav item named "Vendors". Landlords are reviewed on /admin/landlord,
    // which shows the property context this page has no column for.
    admin
      .from('vendor_profiles')
      .select('id, business_name, slug, category, area, verification_status, created_at')
      .is('archived_at', null)
      .neq('category', 'landlord')
      .order('created_at', { ascending: false }),
    // Documents are fetched separately rather than embedded: verification_documents
    // has no FK to vendor_profiles (it points at profiles), and this codebase has
    // been bitten repeatedly by embeds that cannot resolve.
    admin
      .from('verification_documents')
      .select('id, owner_id, doc_type, title, status, storage_path, action_message, uploaded_at')
      .order('uploaded_at', { ascending: false }),
  ]);

  const byOwner = new Map<string, AdminVendor['docs']>();
  for (const d of (docs ?? []) as Row[]) {
    const list = byOwner.get(d.owner_id as string) ?? [];
    list.push({
      id: d.id as string,
      docType: d.doc_type as string,
      title: d.title as string,
      status: d.status as string,
      storagePath: d.storage_path as string,
      actionMessage: (d.action_message as string) ?? null,
      uploadedAt: d.uploaded_at as string,
    });
    byOwner.set(d.owner_id as string, list);
  }

  const rows: AdminVendor[] = ((vendors ?? []) as Row[]).map((v) => ({
    id: v.id as string,
    businessName: (v.business_name as string) ?? 'Unnamed business',
    slug: v.slug as string,
    category: (v.category as string) ?? '—',
    area: (v.area as string) ?? null,
    verificationStatus: (v.verification_status as string) ?? 'unverified',
    createdAt: v.created_at as string,
    docs: byOwner.get(v.id as string) ?? [],
  }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / VENDORS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Vendor <span className="text-lime-deep">verification.</span>
        </h2>
      </div>
      <VerificationQueue vendors={rows} />
    </section>
  );
}
