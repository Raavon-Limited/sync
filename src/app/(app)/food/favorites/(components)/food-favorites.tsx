/**
 * Saved food — vendors and menu items the student hearted.
 *
 * Scoped to the two food entity types. /me/saved shows everything across all
 * verticals; this page is the food slice of the same table.
 */
'use client';

import { Heart } from 'lucide-react';
import FoodCards from '@/components/food-comps/food-card';
import { useFavorites } from '@/app/(app)/food/favorites-context';
import { useFoodStorefronts } from '@/modules/food/hooks';
import { useSession } from '@/providers/session-provider';

export function FoodFavorites() {
  const { isAuthenticated } = useSession();
  const { favoriteIds, isReady } = useFavorites();
  // Branches are saved as their brand, so match on vendorId.
  const { data: branches = [] } = useFoodStorefronts({ pageSize: 60 });

  const saved = branches.filter((b) => favoriteIds.has(b.vendorId));

  if (!isAuthenticated) {
    return (
      <section className="flex flex-col gap-3 pb-24">
        <h1 className="font-display text-content text-center text-2xl">Saved</h1>
        <p className="text-content-muted text-center text-sm">Sign in to see what you saved.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 pb-24">
      <h1 className="font-display text-content text-center text-2xl">Saved</h1>

      {!isReady && <div className="bg-ink/5 mt-2 h-40 animate-pulse rounded-2xl" />}

      {isReady && saved.length === 0 ? (
        <div className="border-line/10 bg-panel mt-2 flex flex-col items-center gap-3 rounded-2xl border px-6 py-10 text-center">
          <div className="bg-content-muted/10 flex h-14 w-14 items-center justify-center rounded-full">
            <Heart className="text-content h-6 w-6" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-display text-content text-base font-semibold">No favourites yet</p>
            <p className="text-content-muted mt-1 text-sm">
              Tap the heart on any store to save it here
            </p>
          </div>
        </div>
      ) : (
        isReady && (
          <>
            <p className="text-content-muted text-xs">
              {saved.length} saved store{saved.length !== 1 ? 's' : ''}
            </p>
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
              {saved.map((b) => (
                <FoodCards
                  key={b.id}
                  entityId={b.vendorId}
                  entityType="vendor"
                  slug={b.slug}
                  image={b.coverUrl ?? b.logoUrl ?? ''}
                  name={b.businessName ?? b.branchName}
                  tags={b.branchName ? [b.branchName] : []}
                  rating={b.ratingAvg.toFixed(1)}
                  reviewCount={b.ratingCount}
                  location={b.area ?? 'Ilorin'}
                  time="20 - 30 min"
                  status={b.isAcceptingOrders ? 'open' : 'closed'}
                />
              ))}
            </div>
          </>
        )
      )}
    </section>
  );
}
