/**
 * Layout for /admin/* - internal admin console (Raavon team only). The sidebar
 * nav lives in config/dashboard-nav under the `admin` key.
 *
 * AUTHORIZATION IS ENFORCED TWICE, AND THIS COMMENT USED TO CLAIM ONCE.
 *   It said "enforced by the proxy (middleware)" while the /admin line in
 *   PROTECTED_PREFIXES was commented out   a false statement about a security
 *   control, which is worse than no statement, because it is the reason nobody
 *   looked. The gate is back. It is not the only one and must not become it:
 *
 *     proxy.ts        refuses the NAVIGATION for anyone who is not staff.
 *     requireStaff*   refuses the RENDER, per page, and returns the area grant.
 *     assertStaffArea refuses the WRITE, in every admin action   which matters
 *                     most, because those run on the service-role client and
 *                     nothing underneath them would catch a caller who never
 *                     loaded a page.
 *
 *   A layout cannot do any of that on its own: it renders inside the same pass
 *   as the page and cannot stop a server action.
 */
import { DashboardShell } from '@/components/layouts/dashboard-shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell navKey="admin">{children}</DashboardShell>;
}
