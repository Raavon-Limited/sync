/**
 * ROUTE: /vendor/stores
 * ACCESS: authenticated vendor (owner). Managers see empty lists — every read
 *         and write behind this page is owner-scoped in the database.
 * PURPOSE: Branches, the people who run them, and what those people did.
 */
import type { Metadata } from 'next';
import { StoresContainer } from './(components)/stores-container';

export const metadata: Metadata = { title: 'Stores' };

export default function Page() {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h1 className="text-muted max-w-xl font-mono text-sm tracking-wide">STORES</h1>
        <h2 className="text-section text-content font-display mt-2 font-medium">
          Every location, <span className="text-lime-deep">in one place.</span>
        </h2>
      </div>
      <StoresContainer />
    </section>
  );
}
