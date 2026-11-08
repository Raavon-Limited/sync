/**
 * Real-data container for the food storefront.
 *
 * WHAT CHANGED
 *   The page used to call `getVendorBySlug()` from `@/lib/vendor`   a hardcoded
 *   array with invented ids. Nothing a student saw here existed in the
 *   database, which is also why the "Message vendor" button had nowhere to
 *   mount: there was no real listing id to talk about.
 *
 * `VendorClient` stays presentation-only and prop-driven; this island does the
 * fetching and the shape translation, the same split the vendor dashboard uses.
 */
'use client';

import { useMemo } from 'react';
import { notFound } from 'next/navigation';
import { useFoodVendorById, useResolvedStorefront, useStorefrontMenu } from '@/modules/food/hooks';
import type { FoodListing } from '@/modules/food/types';
import type { StoreInfo } from '@/components/food-comps/StoreInfoModal';
import VendorClient from '@/components/food-comps/VendorClient';
import { MessageVendorButton } from '@/components/chat/message-vendor-button';

/** Postgres `time` is "HH:MM:SS"; isVendorOpen() wants "7am – 10pm". */
function toClockLabel(t?: string | null): string | null {
  if (!t) return null;
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr);
  if (Number.isNaN(h)) return null;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const mins = Number(mStr ?? 0);
  return mins ? `${hour12}:${String(mins).padStart(2, '0')}${suffix}` : `${hour12}${suffix}`;
}

const FALLBACK_HOURS = '7am – 10pm';

export function VendorContainer({ slug }: { slug: string }) {
  // The slug names a BRANCH. A brand slug still resolves   to its primary
  // branch   so older links keep working, but the menu below is one location's,
  // never the union of every branch the brand owns.
  const { data: resolved, isLoading: resolving, isError: resolveError } = useResolvedStorefront(slug);
  const { data: brand } = useFoodVendorById(resolved?.vendorId);
  const { data: listings = [], isLoading: menuLoading } = useStorefrontMenu(resolved?.storefrontId);

  // Group by the listing's own category   the storefront's section headings are
  // the vendor's taxonomy, not a fixed list we impose on them.
  const menu = useMemo(() => {
    const sections = new Map<string, FoodListing[]>();
    for (const l of listings) {
      if (l.status === 'Archived') continue;
      const key = l.category?.trim() || 'Menu';
      if (!sections.has(key)) sections.set(key, []);
      sections.get(key)!.push(l);
    }
    return Array.from(sections, ([title, items]) => ({
      title,
      items: items.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description ?? '',
        // The UI works in naira; the database stores kobo. Converting here
        // keeps the boundary in one place instead of scattered across JSX.
        price: l.priceKobo / 100,
        image: l.imageUrl ?? '',
      })),
    }));
  }, [listings]);

  if (resolving) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="bg-ink/5 h-48 w-full animate-pulse rounded-2xl" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-20 w-full animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (resolveError || (!resolving && !resolved)) notFound();
  if (!resolved || !brand) {
    return <div className="bg-ink/5 h-48 w-full animate-pulse rounded-2xl" />;
  }
  const vendor = brand;

  const openLabel = toClockLabel(vendor.opensAt);
  const closeLabel = toClockLabel(vendor.closesAt);
  const hours = openLabel && closeLabel ? `${openLabel} – ${closeLabel}` : FALLBACK_HOURS;

  const storeInfo: StoreInfo = {
    address: vendor.businessAddress ?? vendor.area ?? 'Address not provided',
    openingHours: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
      (day) => ({ day, hours }),
    ),
    phone: vendor.publicPhone ?? undefined,
    description: vendor.tagline ?? undefined,
  };

  // The thread's subject is a listing, so the button needs one. Anchoring it to
  // the first menu item is a deliberate simplification: a storefront-level
  // thread would need its own RPC, and there is no vendor-level subject in the
  // conversations table today.
  const firstListingId = listings.find((l) => l.status !== 'Archived')?.id;

  // MESSAGING IS FOR VERIFIED VENDORS ONLY. open_listing_conversation refuses a
  // new thread with anyone else, so offering the button would just be a way to
  // earn an error toast. A student who already has a thread with this vendor
  // keeps it in their inbox; this only governs starting one.
  const canMessage = !!firstListingId && vendor.isVerified;

  return (
    <div className="flex flex-col">
      {canMessage && firstListingId && (
        <div className="flex justify-end px-4 pt-4">
          <MessageVendorButton listingId={firstListingId} label={`Message ${vendor.businessName}`} />
        </div>
      )}

      {!menuLoading && menu.length === 0 && (
        <p className="text-muted px-4 py-6 text-sm">
          {vendor.businessName} has not published any items yet.
        </p>
      )}

      <VendorClient
        // The CART is keyed by branch, so this must be the storefront id, not
        // the brand's. Passing the brand would merge two branches' carts.
        vendorId={resolved.storefrontId}
        vendorName={
          // "Jamaal's Kitchen   KWASU Gate". A student needs to know which
          // location they are ordering from.
          resolved.branchName && listings.length
            ? `${vendor.businessName}   ${resolved.branchName}`
            : vendor.businessName
        }
        tagline={vendor.tagline ?? ''}
        location={vendor.area ?? 'Location not set'}
        rating={vendor.ratingAvg}
        reviews={vendor.ratingCount}
        // Not columns on vendor_profiles   shown as flat defaults rather than
        // invented per-vendor values.
        deliveryTime="20 - 30 min"
        deliveryFee="₦300"
        time={hours}
        heroImage={vendor.coverUrl ?? vendor.logoUrl ?? ''}
        menu={menu}
        storeInfo={storeInfo}
      />
    </div>
  );
}
