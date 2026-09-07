/**
 * Layout for /organiser/*. The sidebar nav lives in config/dashboard-nav under
 * the `organiser` key.
 *
 * Authorization (role=event_manager) is enforced by the proxy - see
 * PROTECTED_PREFIXES. The role is not open for signup yet, so in practice the
 * only people here are ones a super admin granted it to deliberately.
 */
import { DashboardShell } from '@/components/layouts/dashboard-shell';

export default function OrganiserLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell navKey="organiser" doodle="food">
      {children}
    </DashboardShell>
  );
}
