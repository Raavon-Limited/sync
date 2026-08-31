/**
 * DashboardShell - the full-page shell for a role's dashboard (vendor, landlord,
 * admin). Renders the sticky desktop sidebar rail, the mobile top bar + drawer,
 * and the main content column. The profile block is fetched server-side here so
 * the sidebar shows the real signed-in user.
 *
 * Each role passes its own `navKey`; the nav config + per-role profile shaping
 * live in config/dashboard-nav and dashboard-profile. Authorization is enforced
 * by the proxy (middleware), not here.
 */
import { DashboardSidebar } from './dashboard-sidebar';
import { ChatWidget } from '@/components/chat/chat-widget';
import { DashboardHeader } from './dashboard-header';
import { getDashboardProfile } from './dashboard-profile';
import type { DashboardNavKey } from '@/config/dashboard-nav';

interface DashboardShellProps {
  navKey: DashboardNavKey;
  children: React.ReactNode;
  /** Max width of the content+rail row. Admin runs wider than vendor. */
  maxWidth?: string;
  /**
   * Rendered at the top of the sidebar, above the nav. The vendor shell puts
   * its store switcher here; student and landlord pass nothing, so their
   * sidebars are byte-identical to before.
   */
  sidebarSlot?: React.ReactNode;
}

export async function DashboardShell({
  navKey,
  children,
  maxWidth = 'max-w-full',
  sidebarSlot,
}: DashboardShellProps) {
  const profile = await getDashboardProfile(navKey);

  return (
    <div className="bg-surface text-content min-h-screen">
      <div className={`mx-auto flex ${maxWidth}`}>
        <aside className="border-line/10 bg-panel sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-r p-4 md:block">
          <DashboardSidebar navKey={navKey} profile={profile} topSlot={sidebarSlot} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <DashboardHeader navKey={navKey} profile={profile} />
          {/* No AppFooter here. A dashboard is a working surface - a marketing
              and legal link band under every table and form is noise, and the
              same links are already reachable from the account menu and the
              public site. It stays on AppShell and /around, which are browsing
              surfaces where it belongs. */}
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>

      {/* Live messaging. Every dashboard route is auth-gated by the proxy, so
          there is no signed-out case to guard here. */}
      <ChatWidget />
    </div>
  );
}
