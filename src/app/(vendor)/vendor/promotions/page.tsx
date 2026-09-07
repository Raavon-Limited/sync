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
import { UgcPromotionsCard } from '@/components/vendor/ugc-promotions-card';

export const metadata: Metadata = { title: 'Promotions' };

export default function Page() {
  return (
    <section className="flex flex-col gap-3">
      <PromotionsContainer />

      {/* Below the running campaigns, because it is not one yet. A vendor
          already thinking about promotion is the only person who will read
          this, which is why it lives here rather than on its own route. */}
      <UgcPromotionsCard />
    </section>
  );
}
