/**
 * ROUTE: /admin/verification
 * ACCESS: admin / super_admin only.
 * PURPOSE: Every account on the platform that has a verification state, in one
 *          dense list   vendors, landlords, riders, fleets, students and
 *          organisers.
 *
 * READ-ONLY ON PURPOSE
 *   This page answers "where does everyone stand", which is a different question
 *   from "decide this one". The deciding screens show the documents side by
 *   side because that is what a decision needs; putting Verify buttons here too
 *   would mean a reviewer could approve a business without ever opening its
 *   folder, which is the one thing 20260901260000 exists to prevent. Every row
 *   links to the review page for its own type instead.
 *
 * THE LIST ITSELF IS NOT BUILT HERE
 *   modules/admin/accounts owns "every account", because /admin/vendors' All
 *   tab shows the same set as cards. Two screens with two definitions of that
 *   is how one of them came to be missing landlords.
 *
 * WHY THE STATES DO NOT ALL COME FROM ONE COLUMN
 *   `verification_status` holds four values. The two states staff ask about most
 *   are not among them:
 *     • fraud-blocked is `rejected` plus verification_blocked_at, deliberately
 *       kept out of the status enum (see 20260901260000's header).
 *     • suspended lives on profiles and is orthogonal to verification entirely
 *       a suspended vendor's papers are still real.
 *   Both are separate filters in the component for that reason, not extra
 *   status values.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { listAccounts } from '@/modules/admin/accounts';
import { VerificationOversight } from './(components)/verification-oversight';

export const metadata: Metadata = { title: 'Verification   Admin' };

export default async function Page() {
  await requireStaffArea('verification');

  const rows = await listAccounts();

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
