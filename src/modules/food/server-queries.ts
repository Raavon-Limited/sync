/**
 * Server-side data fetching for the 'food' module.
 * Called from RSC pages. Uses the server Supabase client.
 * RLS is the real authorization layer - `listings_select_active` already hides
 * archived and Archived-status rows, so those filters are belt-and-braces for
 * readers rather than the security boundary.
 *
 * Every function degrades to an empty result rather than throwing: these render
 * public pages, and a Supabase outage should show "no food yet" and not a 500.
 */
import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

/** A food listing as the /around carousel and the food grid need it.
 *  Prices are in KOBO - render with formatKobo(), never formatNaira(). */
export interface FoodCard {
  id: string;
  name: string;
  description: string | null;
  category: string;
  priceKobo: number;
  imageUrl: string | null;
  /** Units sold. Drives the "popular" ordering; 0 for a new listing. */
  sold: number;
  inStock: boolean;
}

/**
 * Food listings, most-sold first.
 *
 * `sold` is the only popularity signal that exists today. When ratings or order
 * counts land this is the one place that ordering needs to change.
 */
export const listPopularFood = cache(async (limit = 8): Promise<FoodCard[]> => {
  if (!configured) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('listings')
      .select('id, name, description, category, price_kobo, image_url, sold, stock, status')
      .eq('status', 'Active')
      .is('archived_at', null)
      .order('sold', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category,
      priceKobo: Number(r.price_kobo),
      imageUrl: r.image_url,
      sold: r.sold ?? 0,
      inStock: (r.stock ?? 0) > 0,
    }));
  } catch {
    return [];
  }
});
