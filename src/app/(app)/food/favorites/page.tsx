/**
 * ROUTE: /food/favorites
 * ACCESS: authenticated student
 * PURPOSE: Saved food vendors and menu items, from `public.favorites`.
 *
 * Was reading a localStorage context, so a heart tapped on one device showed
 * nowhere else and never reached the table /me/saved reads.
 */
import type { Metadata } from 'next';
import { FoodFavorites } from './(components)/food-favorites';

export const metadata: Metadata = { title: 'Saved' };

export default function Page() {
  return <FoodFavorites />;
}
