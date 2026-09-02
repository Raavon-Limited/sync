/**
 * The food storefronts that actually exist   BRANCHES, not brands.
 *
 * WHY BRANCHES
 *   A brand with three locations is three places a student can order from, with
 *   different stock and different distances. Listing the brand once and picking
 *   a location for them is how somebody ends up collecting rice from the wrong
 *   side of town. Each card links to that branch's own slug.
 *
 * WHY IT SITS ALONGSIDE THE CURATED ROWS
 *   Everything else on /food   the featured carousel, the category rows   is
 *   built from hardcoded arrays in FoodMain with stock photography and invented
 *   slugs like `mama-put-tanke`, which resolve to nothing. Replacing that
 *   designed landing is a product decision, not a wiring one, so this section
 *   adds the real storefronts rather than tearing the rest out.
 */
'use client';

import FoodCards from './food-card';
import { useFoodStorefronts } from '@/modules/food/hooks';

export function RealVendorsSection() {
  const { data: branches = [], isLoading } = useFoodStorefronts({ pageSize: 24 });

  if (isLoading) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-content text-xl">Stores near you</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-ink/5 h-56 animate-pulse rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  if (!branches.length) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-content text-xl">Stores near you</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((b) => (
          <FoodCards
            key={b.id}
            // `favorites` has no 'storefront' type, so a branch is saved as its
            // BRAND   see the note in favorites-context.
            entityId={b.vendorId}
            entityType="vendor"
            slug={b.slug}
            image={b.coverUrl ?? b.logoUrl ?? ''}
            // Brand first, branch second: the business is what a student
            // recognises, the location is what distinguishes this card.
            name={b.businessName ?? b.branchName}
            tags={b.branchName ? [b.branchName] : []}
            rating={b.ratingAvg.toFixed(1)}
            reviewCount={b.ratingCount}
            location={b.area ?? 'Ilorin'}
            time="20 - 30 min"
            // Three states. `is_accepting_orders` is the manual switch   one
            // location closing early does not close the business. A cooldown
            // is different: the store is open and will take orders again in a
            // few minutes on its own, so it must not read as "closed".
            status={
              !b.isAcceptingOrders
                ? 'closed'
                : b.pausedUntil && new Date(b.pausedUntil) > new Date()
                  ? 'paused'
                  : 'open'
            }
            isTopRated={b.ratingAvg >= 4.6}
          />
        ))}
      </div>
    </section>
  );
}
