/**
 * ROUTE: /admin/verification
 * ACCESS: admin / super_admin only.
 * PURPOSE: Every account on the platform that has a verification state, in one
 *          list — vendors, landlords, riders and logistics companies.
 *
 * READ-ONLY ON PURPOSE
 *   This page answers "where does everyone stand", which is a different question
 *   from "decide this one". The deciding screens show the documents side by
 *   side because that is what a decision needs; putting Verify buttons here too
 *   would mean a reviewer could approve a business without ever opening its
 *   folder, which is the one thing 20260901260000 exists to prevent. Every row
 *   links to the review page for its own type instead.
 *
 * WHY THE STATES DO NOT ALL COME FROM ONE COLUMN
 *   `verification_status` holds four values. The two states staff ask about most
 *   are not among them:
 *     • fraud-blocked is `rejected` plus verification_blocked_at, deliberately
 *       kept out of the status enum (see 20260901260000's header).
 *     • suspended lives on profiles and is orthogonal to verification entirely —
 *       a suspended vendor's papers are still real.
 *   Both are separate filters here for that reason, not extra status values.
 */
import type { Metadata } from 'next';
import { requireStaff } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { VerificationOversight, type OversightRow } from './(components)/verification-oversight';

export const metadata: Metadata = { title: 'Verification — Admin' };

type Row = Record<string, unknown>;

export default async function Page() {
  await requireStaff();

  const db = createAdminClient();

  const [{ data: businesses }, { data: riders }, { data: companies }, { data: people }] =
    await Promise.all([
      db
        .from('vendor_profiles')
        .select(
          'id, business_name, slug, category, verification_status, verification_blocked_at, created_at',
        )
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
      db
        .from('rider_profiles')
        .select('id, verification_status, verification_blocked_at, created_at')
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
      db
        .from('logistics_companies')
        .select('id, name, owner_id, verification_status, verification_blocked_at, created_at')
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
      // Names for riders (rider_profiles has none) and the suspension flag,
      // which applies to every kind of account because it lives on the person.
      db.from('profiles').select('id, full_name, suspended_at'),
    ]);

  const person = new Map(
    ((people ?? []) as Row[]).map((p) => [
      p.id as string,
      { name: (p.full_name as string) ?? null, suspended: p.suspended_at != null },
    ]),
  );

  const rows: OversightRow[] = [];

  for (const b of (businesses ?? []) as Row[]) {
    const id = b.id as string;
    const isLandlord = b.category === 'landlord';
    rows.push({
      id,
      kind: isLandlord ? 'landlord' : 'vendor',
      name: (b.business_name as string) ?? 'Unnamed business',
      detail: (b.category as string) ?? '—',
      status: (b.verification_status as string) ?? 'unverified',
      blocked: b.verification_blocked_at != null,
      suspended: person.get(id)?.suspended ?? false,
      // Both have a page of their own now. Landlords keep their own route
      // because that page carries the hostel context a vendor has none of.
      href: isLandlord
        ? `/admin/landlord/${b.slug as string}`
        : `/admin/vendors/${b.slug as string}`,
      createdAt: b.created_at as string,
    });
  }

  for (const r of (riders ?? []) as Row[]) {
    const id = r.id as string;
    rows.push({
      id,
      kind: 'rider',
      name: person.get(id)?.name ?? 'Unnamed rider',
      detail: 'rider',
      status: (r.verification_status as string) ?? 'unverified',
      blocked: r.verification_blocked_at != null,
      suspended: person.get(id)?.suspended ?? false,
      href: `/admin/riders/${id}`,
      createdAt: r.created_at as string,
    });
  }

  for (const c of (companies ?? []) as Row[]) {
    const id = c.id as string;
    rows.push({
      id,
      kind: 'company',
      name: (c.name as string) ?? 'Unnamed company',
      detail: 'logistics',
      status: (c.verification_status as string) ?? 'unverified',
      blocked: c.verification_blocked_at != null,
      // A company is suspended through its OWNER, since suspension is a fact
      // about a person.
      suspended: person.get(c.owner_id as string)?.suspended ?? false,
      href: '/admin/riders',
      createdAt: c.created_at as string,
    });
  }

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / VERIFICATION</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Verification <span className="text-lime-deep">queue.</span>
        </h2>
      </div>
      <VerificationOversight rows={rows} />
    </section>
  );
}
