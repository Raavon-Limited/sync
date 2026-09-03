/**
 * ROUTE: /admin/revenue
 * ACCESS: staff granted the `revenue` area   its own grant, like payouts,
 *         because "what does Sync make" is not something every reviewer needs
 *         and is the first thing anybody who gets into the console would look
 *         for.
 * PURPOSE: What the platform has earned in service charges, and where from.
 *
 * THIS IS NOT THE NUMBER ON /admin
 *   The overview charts `orders.total_kobo`: the value of everything sold. That
 *   is the right measure of how busy the platform is and the wrong one for
 *   income. A ₦150,000 rent payment moves ₦150,000 through Sync and earns Sync
 *   ₦3,750 of it. This page is the second number, and the two are labelled so
 *   nobody quotes one for the other in a meeting.
 *
 * READ FROM THE LEDGER, NOT RECOMPUTED
 *   `admin_revenue` sums the double-entry lines already posted against the
 *   internal platform_revenue account. Re-deriving a commission from order rows
 *   would produce a second answer that drifts from the books the first time a
 *   rate changes or a dispute moves money.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { RevenuePanel, type RevenueData } from './(components)/revenue-panel';

export const metadata: Metadata = { title: 'Revenue   Admin' };

// Money that moved a minute ago has to be here a minute later.
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireStaffArea('revenue');

  // The request-scoped client deliberately: admin_revenue checks is_staff() in
  // the database, so the guard above is defence in depth rather than the only
  // thing standing between a reviewer and the ledger.
  // admin_revenue postdates the checked-in generated types. REGENERATE once
  // 20260906090000 is applied and this cast goes.
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db.rpc('admin_revenue', {});

  // A refusal is not an empty ledger. Rendering zeros would say the platform
  // has never earned anything rather than that the question could not be asked.
  if (error) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / REVENUE</h1>
        <p className="text-coral border-coral/30 bg-coral/5 rounded-lg border px-3 py-2 text-sm">
          Revenue unavailable: {error.message}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / REVENUE</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          What Sync <span className="text-lime-deep">earned.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          Service charges only, from the money ledger. This is not what customers spent   the
          overview&rsquo;s revenue chart is that number.
        </p>
      </div>

      <RevenuePanel data={data as unknown as RevenueData} />
    </section>
  );
}
