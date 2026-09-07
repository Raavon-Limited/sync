/**
 * Layout for /vendor/* (generic vendor dashboard - food, beauty, trades,
 * laundry, events). The landlord variant has its own layout at
 * /landlord/layout.tsx so the two can diverge cleanly. The sidebar nav itself
 * lives in config/dashboard-nav under the `vendor` key.
 *
 * Authorization (role=vendor) is enforced by the proxy (middleware).
 *
 * A LANDLORD IS SENT TO THEIR OWN DASHBOARD FROM HERE.
 *   The proxy admits anyone whose `profiles.role` is 'vendor', and a landlord's
 *   role can legitimately still say that: `set_vendor_category` moves the role
 *   only when the caller was already wearing a business hat, so picking
 *   "landlord" from a student or vendor account leaves the role behind. The
 *   handle rewrite then resolves /<their-handle> to /vendor for the same
 *   reason, so the sidebar they got was Stores, Listings, Orders and a store
 *   switcher   for a hostel.
 *
 *   This layout used to answer "which dashboard is this" with a hardcoded
 *   navKey, which is to say with the URL. The business answers it now. See
 *   getBusinessKind for why the category is the one of the three signals worth
 *   trusting.
 */
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layouts/dashboard-shell';
import { ActiveStorefrontProvider } from '@/modules/storefronts/active-storefront';
import { getBusinessKind } from '@/modules/vendor/business-kind';
import { StoreSwitcher } from './(components)/store-switcher';

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  // Null   no business row yet   deliberately does NOT redirect: that account
  // has nowhere better to be, and the sidebar collapses to the overview so the
  // wizard can be finished. Only a business that IS a landlord moves.
  if ((await getBusinessKind()) === 'landlord') redirect('/landlord');

  // The provider wraps BOTH the switcher and the pages: they have to agree on
  // which branch is active, and two providers would be two answers.
  return (
    <ActiveStorefrontProvider>
      <DashboardShell navKey="vendor" sidebarSlot={<StoreSwitcher />} doodle="food">
        {children}
      </DashboardShell>
    </ActiveStorefrontProvider>
  );
}
