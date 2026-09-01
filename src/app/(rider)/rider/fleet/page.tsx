/**
 * ROUTE: /rider/fleet
 * ACCESS: role=rider, enforced by the proxy.
 * PURPOSE: For a fleet owner — their company's standing, their riders, and what
 *          those riders are carrying. For everyone else, an explanation.
 *
 * THREE AUDIENCES, ONE ROUTE
 *   The owner of a company, a rider employed BY one, and an independent rider
 *   all land here from the same nav item. Hiding the item for the last two would
 *   mean they never find out fleets exist; a route that 403s them would be
 *   worse. Each gets the version of the page that is true for them.
 *
 * WHY THE OWNER READS THEIR RIDERS THROUGH THE SERVICE ROLE
 *   rider_profiles' RLS is own-row plus staff. A fleet owner is neither, so a
 *   plain query returns their own row and nothing else. The action behind this
 *   page re-checks ownership before it reads anything — same shape as the admin
 *   module, and the same reason: the guard is what stands between a signed-in
 *   rider and everybody else's row.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { getRiderProfile } from '@/modules/rider/queries';
import { getMyFleet } from '@/modules/rider/fleet';
import { FleetConsole } from './(components)/fleet-console';

export const metadata: Metadata = { title: 'Fleet — Rider' };

export default async function Page() {
  const rider = await getRiderProfile();
  // Straight to the dashboard, which carries the set-up prompt. Sending them
  // to the form instead would skip the explanation of what is being asked.
  if (!rider) redirect('/rider');

  const fleet = await getMyFleet();

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">RIDER / FLEET</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Your <span className="text-lime-deep">fleet.</span>
        </h2>
      </div>

      {fleet ? (
        <FleetConsole fleet={fleet} />
      ) : rider.companyId ? (
        // Employed by a fleet they do not own. They can see who they ride for
        // and leave; they cannot manage anybody.
        <MemberNote />
      ) : (
        <IndependentNote />
      )}
    </section>
  );
}

function MemberNote() {
  return (
    <div className="border-line/10 bg-panel flex flex-col gap-2 rounded-xl border p-6">
      <Building2 className="text-content-muted size-5" aria-hidden="true" />
      <p className="text-content font-medium">You ride for a fleet</p>
      <p className="text-content-muted text-sm">
        Your jobs and fees are your own — the fleet you ride for can see what you are carrying, and
        can release you. Ask them if you want to leave.
      </p>
    </div>
  );
}

function IndependentNote() {
  return (
    <div className="border-line/10 bg-panel flex flex-col gap-2 rounded-xl border p-6">
      <Building2 className="text-content-muted size-5" aria-hidden="true" />
      <p className="text-content font-medium">You ride independently</p>
      <p className="text-content-muted text-sm">
        You take jobs off the board yourself and keep your own fees. A logistics company runs
        several riders off that same board — if you operate one, register it when you sign up and
        Sync will review its papers separately from yours.
      </p>
    </div>
  );
}
