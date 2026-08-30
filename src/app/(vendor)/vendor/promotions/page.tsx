/**
 * ROUTE: /vendor/promotions
 * ACCESS: authenticated vendor
 * PURPOSE: Boost a listing - featured slot on Around-you / category page. Billed against the vendor's plan.
 * BUILT HERE: Promotion form (listing picker, duration), running promo list.
 *
 * The container is a client island: campaigns and the vendor's promotable
 * listings are both read through React Query.
 */
import type { Metadata } from 'next';
import { PromotionsContainer } from './(component)/promotions-container';

export const metadata: Metadata = { title: 'Promotions' };

export default function Page() {
  return (
    <section className="flex flex-col gap-3">
      <PromotionsContainer />
    </section>
  );
}
