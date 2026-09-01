/**
 * ROUTE: /admin/landlord
 * ACCESS: admin / super_admin only.
 * PURPOSE: Every landlord, their hostels, and where verification stands.
 *
 * A LANDLORD IS A vendor_profiles ROW WITH category = 'landlord'
 *   Not a separate table. `profiles.role` is kept in step with that category by
 *   a trigger (20260828090000) — before it existed the two drifted and
 *   landlords could not reach their own dashboard.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { adminRoleForEmail } from '@/lib/admin-emails';
import { createAdminClient } from '@/lib/supabase/admin';
import { LandlordsBrowser, type LandlordRow } from './(components)/landlords-browser';

export const metadata: Metadata = { title: 'Landlords — Admin' };

import type { Row } from '@/lib/supabase/row';

export default async function Page() {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  const role = profile?.role ?? adminRoleForEmail(user?.email);
  if (role !== 'admin' && role !== 'super_admin') redirect('/403');

  const admin = createAdminClient();

  const [{ data: landlords }, { data: hostels }] = await Promise.all([
    admin
      .from('vendor_profiles')
      .select('id, slug, business_name, area, verification_status, created_at')
      .eq('category', 'landlord')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    admin.from('hostels').select('id, landlord_id, verified').is('archived_at', null),
  ]);

  // The live photo, for the card. One query for everybody rather than one per
  // landlord: the list is the place a reviewer scans, and a cascade of images
  // arriving one request at a time is the thing that makes a queue feel slow.
  const landlordIds = ((landlords ?? []) as Row[]).map((l) => l.id);
  const selfieByOwner = new Map<string, string>();
  if (landlordIds.length) {
    const { data: selfies } = await admin
      .from('verification_documents')
      .select('owner_id, storage_path, uploaded_at')
      .eq('doc_type', 'selfie')
      .in('owner_id', landlordIds)
      // Oldest first, so the last write into the map below is the NEWEST photo.
      // A landlord who re-submitted after a rejection has more than one.
      .order('uploaded_at', { ascending: true });

    const pathByOwner = new Map<string, string>();
    for (const d of (selfies ?? []) as Row[]) pathByOwner.set(d.owner_id, d.storage_path);

    if (pathByOwner.size) {
      const paths = [...pathByOwner.values()];
      const { data: signed } = await admin.storage
        .from('verification-docs')
        .createSignedUrls(paths, 60 * 5);

      const urlByPath = new Map<string, string>();
      for (const s of signed ?? []) {
        // `path` is null on the entries that failed; those owners simply get
        // the placeholder rather than blanking the whole list.
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
      }
      for (const [owner, path] of pathByOwner) {
        const url = urlByPath.get(path);
        if (url) selfieByOwner.set(owner, url);
      }
    }
  }

  const byLandlord = new Map<string, { total: number; verified: number }>();
  for (const h of (hostels ?? []) as Row[]) {
    const cur = byLandlord.get(h.landlord_id) ?? { total: 0, verified: 0 };
    cur.total += 1;
    if (h.verified) cur.verified += 1;
    byLandlord.set(h.landlord_id, cur);
  }

  // Annotated because spreading a Record<string, any> drops the index
  // signature, and every field read below then looks like a typo to tsc.
  const rows: Row[] = ((landlords ?? []) as Row[]).map((l) => ({
    ...l,
    counts: byLandlord.get(l.id) ?? { total: 0, verified: 0 },
  }));

  // Whoever is waiting on a person goes first. Ordered by signup date alone,
  // the one landlord who had submitted documents sat wherever they happened to
  // have registered, among everyone who never will. Signup date still breaks
  // ties inside each band, which is the order the query already returned.
  const RANK: Record<string, number> = { pending: 0, unverified: 1, rejected: 2, verified: 3 };
  rows.sort((a, b) => (RANK[a.verification_status] ?? 9) - (RANK[b.verification_status] ?? 9));

  const waiting = rows.filter((l) => l.verification_status === 'pending').length;

  const browserRows: LandlordRow[] = rows.map((l) => ({
    id: l.id,
    slug: l.slug,
    businessName: l.business_name ?? 'Unnamed',
    area: l.area ?? null,
    verificationStatus: l.verification_status ?? 'unverified',
    hostels: l.counts.total,
    verifiedHostels: l.counts.verified,
    selfieUrl: selfieByOwner.get(l.id),
  }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / LANDLORDS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Who owns <span className="text-lime-deep">what.</span>
        </h2>
        {/* Says what is owed before you have to read every badge to find it. */}
        <p className="text-content-muted mt-2 text-sm">
          {waiting > 0
            ? `${waiting} landlord${waiting === 1 ? '' : 's'} waiting on a verification decision — open one to review their documents.`
            : 'Nothing waiting on a verification decision.'}
        </p>
      </div>

      {/* Cards by default, with the live photo, and a toggle back to a list.
          See LandlordsBrowser for why the face is on the card. */}
      <LandlordsBrowser rows={browserRows} />
    </section>
  );
}
