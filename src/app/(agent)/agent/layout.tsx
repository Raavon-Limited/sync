/**
 * Layout for /agent/*. The sidebar nav lives in config/dashboard-nav under the
 * `agent` key.
 *
 * Authorization (role=agent) is enforced by the proxy, which gates this prefix
 * in PROTECTED_PREFIXES, and again by the page itself. Both, because an agent
 * holds somebody's address and the role can only arrive by invitation   the
 * cheapest thing to get wrong here is the most expensive to discover.
 */
import { DashboardShell } from '@/components/layouts/dashboard-shell';

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell navKey="agent" doodle="house">
      {children}
    </DashboardShell>
  );
}
