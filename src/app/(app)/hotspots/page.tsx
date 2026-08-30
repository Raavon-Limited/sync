/**
 * ROUTE: /hotspots
 * ACCESS: public
 * PURPOSE: Curated places around campus, filterable by category.
 */
import type { Metadata } from 'next';
import { HotspotsList } from './(components)/hotspots-list';

export const metadata: Metadata = { title: 'Hotspots' };

export default function Page() {
  return (
    <section className="flex flex-col gap-3">
      <HotspotsList />
    </section>
  );
}
