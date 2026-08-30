/**
 * ROUTE: /food/[vendorSlug]
 * ACCESS: public
 *
 * The shell stays a server component so metadata renders on the server; the
 * storefront itself is a client island reading vendor_profiles + listings.
 */
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { resolveStorefrontBySlug, fetchFoodVendors } from '@/modules/food/queries';
import { VendorContainer } from './vendor-container';

interface Props {
  params: Promise<{ vendorSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vendorSlug } = await params;
  const db = await createClient();
  const resolved = await resolveStorefrontBySlug(db, vendorSlug);
  if (!resolved) return { title: 'Vendor' };
  // Title names the branch, because the page is a branch.
  const brands = await fetchFoodVendors(db, { pageSize: 100 });
  const brand = brands.find((b) => b.id === resolved.vendorId);
  return {
    title: brand ? `${brand.businessName} — ${resolved.branchName}` : resolved.branchName,
  };
}

export default async function Page({ params }: Props) {
  const { vendorSlug } = await params;
  return (
    <section className="flex flex-col gap-3">
      <VendorContainer slug={vendorSlug} />
    </section>
  );
}
