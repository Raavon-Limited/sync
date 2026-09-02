/**
 * ROUTE: /organiser/promotions
 * ACCESS: role=event_manager, enforced by the proxy.
 * PURPOSE: Push an event in front of more students. Announced, not built.
 *
 * WHY IT IS NOT WIRED TO THE EXISTING PROMOTIONS TABLE
 *   `promotions` is keyed on `vendor_id` and `listing_id`, and its discount
 *   model is order-shaped: percent or amount off, a minimum order, a redemption
 *   cap. None of that maps onto an event - there is no listing, the buyer is
 *   not placing an order against a menu, and "20% off a ticket" is a different
 *   object from "put this on the front page".
 *
 *   Bolting events onto that table would mean a nullable listing_id, a second
 *   meaning for vendor_id and a discount_type that does not apply. The ad-slot
 *   model in the build ledger is the right home for this, and it is not built.
 *
 * SO IT SAYS SO. A page that collects a promotion nobody can redeem is worse
 * than a page that admits the feature is coming.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Promotions' };

export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <p className="text-content-muted font-mono text-sm tracking-wide">ORGANISER</p>
        <h1 className="font-display mt-1 text-3xl">
          Get it <span className="text-lime-deep">seen.</span>
        </h1>
      </div>

      <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Megaphone className="text-lime-deep size-4 shrink-0" aria-hidden="true" />
          <h2 className="text-content text-sm font-medium">Paid placement</h2>
          <span className="border-line/20 text-content-muted rounded-full border px-2 py-0.5 text-[10px] tracking-wide uppercase">
            Coming soon
          </span>
        </div>

        <p className="text-content-muted text-sm">
          Buy a slot on the front page, the Around-you feed or the events page for a date range, and
          your event takes over the card that is already there.
        </p>

        <ul className="text-content-muted flex flex-col gap-1 text-xs">
          <li>· Priced per slot, per day</li>
          <li>· Booked and paid from this wallet</li>
          <li>· A slot cannot be double-booked</li>
        </ul>
      </div>

      <div className="border-line/10 flex flex-col gap-3 rounded-xl border border-dashed p-4">
        <p className="text-content text-sm font-medium">What works today</p>
        <p className="text-content-muted text-sm">
          Every event you list appears on <code>/events</code> the moment you publish it, free, and
          is searchable there. That is the whole reach for now.
        </p>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/organiser/events">Your events</Link>
        </Button>
      </div>
    </section>
  );
}
