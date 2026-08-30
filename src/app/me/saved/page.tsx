/**
 * ROUTE: /me/saved
 * ACCESS: authenticated student
 * PURPOSE: Saved listings, vendors, events, services and hotspots.
 *
 * The list is a client island because a save points at one of five different
 * tables and has to be resolved against each — see ./(components)/saved-list.
 */
import type { Metadata } from 'next';
import { SavedList } from './(components)/saved-list';

export const metadata: Metadata = { title: 'Saved' };

export default function SavedPage() {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-content-muted font-mono text-sm tracking-wide">/ME/SAVED</h1>

      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Saved <span className="text-lime-deep">Places &amp; Events</span>
        </h2>
      </div>

      <section className="mt-5">
        <SavedList />
      </section>
    </section>
  );
}
