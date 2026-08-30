/**
 * ROUTE: /vendor/plan
 * ACCESS: authenticated vendor
 * PURPOSE: Current plan, plan change, and billing history.
 *
 * Plans are charged to the vendor's Sync wallet via `subscribe_to_plan`, not to
 * a stored card — see ./(components)/plan-container for why the card UI is gone.
 */
import type { Metadata } from 'next';
import { PlanContainer } from './(components)/plan-container';

export const metadata: Metadata = { title: 'Plan' };

export default function Page() {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">PLAN</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Your <span className="text-lime-deep">subscription.</span>
        </h2>
      </div>
      <PlanContainer />
    </section>
  );
}
