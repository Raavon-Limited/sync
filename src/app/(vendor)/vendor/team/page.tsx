/**
 * ROUTE: /vendor/team
 * ACCESS: authenticated vendor (owner). Managers get a statement of the
 *         boundary — every read and write behind this page is owner-scoped in
 *         the database, so hiding it would only turn a clear "no" into an
 *         unexplained empty screen.
 * PURPOSE: Who can touch the business, what each of them can reach, and what
 *          they have done — across every store, not one at a time.
 */
import type { Metadata } from 'next';
import { TeamContainer } from './(components)/team-container';

export const metadata: Metadata = { title: 'Team' };

export default function Page() {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h1 className="text-muted max-w-xl font-mono text-sm tracking-wide">TEAM</h1>
        <h2 className="text-section text-content font-display mt-2 font-medium">
          Your people, <span className="text-lime-deep">and what they can reach.</span>
        </h2>
      </div>
      <TeamContainer />
    </section>
  );
}
