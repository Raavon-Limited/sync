/**
 * Layout for /rider/*. The sidebar nav lives in config/dashboard-nav under the
 * `rider` key.
 *
 * Authorization (role=rider) is enforced by the proxy, which has gated this
 * prefix since before any of these screens existed   see PROTECTED_PREFIXES.
 */
import { DashboardShell } from '@/components/layouts/dashboard-shell';

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell navKey="rider" doodle="food">
      {children}
    </DashboardShell>
  );
}
