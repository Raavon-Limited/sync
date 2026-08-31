/**
 * Layout for /vendor/* (generic vendor dashboard - food, beauty, trades,
 * laundry, events). The landlord variant has its own layout at
 * /landlord/layout.tsx so the two can diverge cleanly. The sidebar nav itself
 * lives in config/dashboard-nav under the `vendor` key.
 *
 * Authorization (role=vendor) is enforced by the proxy (middleware).
 */
import { DashboardShell } from '@/components/layouts/dashboard-shell';
import { ActiveStorefrontProvider } from '@/modules/storefronts/active-storefront';
import { StoreSwitcher } from './(components)/store-switcher';

export default function VendorLayout({ children }: { children: React.ReactNode }) {
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
