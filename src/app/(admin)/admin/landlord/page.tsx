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
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Home, ShieldCheck, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { adminRoleForEmail } from '@/lib/admin-emails';
import { createAdminClient } from '@/lib/supabase/admin';

export const metadata: Metadata = { title: 'Landlords — Admin' };

type Row = Record<string, any>;

const BADGE: Record<string, string> = {
  verified: 'bg-emerald-500/10 text-emerald-600',
  pending: 'bg-amber-500/10 text-amber-600',
  rejected: 'bg-rose-500/10 text-rose-600',
  unverified: 'bg-ink/5 text-content-muted',
};

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

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / LANDLORDS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Who owns <span className="text-lime-deep">what.</span>
        </h2>
      </div>

      {rows.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          No landlords registered yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((l) => (
            <Link
              key={l.id}
              href={`/admin/landlord/${l.slug}`}
              className="border-line/10 bg-panel hover:border-line/25 flex items-center gap-3 rounded-xl border p-4 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-content flex items-center gap-2 font-medium">
                  {l.business_name ?? 'Unnamed'}
                  <Badge className={BADGE[l.verification_status] ?? BADGE.unverified}>
                    {l.verification_status}
                  </Badge>
                </p>
                <p className="text-content-muted flex flex-wrap items-center gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <Home className="size-3" />
                    {l.counts.total} hostel{l.counts.total === 1 ? '' : 's'}
                  </span>
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="size-3" />
                    {/* Hostel verification is separate from landlord
                        verification: a verified landlord can still list a
                        property nobody has visited. */}
                    {l.counts.verified} verified
                  </span>
                  <span>{l.area ?? 'No area'}</span>
                </p>
              </div>
              <ChevronRight className="text-content-muted size-4 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
