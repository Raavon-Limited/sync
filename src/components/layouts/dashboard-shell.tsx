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
import { DashboardHeader } from './dashboard-header';
import { getDashboardProfile } from './dashboard-profile';
import { DoodleBackdrop } from '@/components/shared/doodle-backdrop';
import type { DashboardNavKey } from '@/config/dashboard-nav';
import { visibleAreas } from '@/modules/access/guard';

interface DashboardShellProps {
  navKey: DashboardNavKey;
  children: React.ReactNode;
  /** Max width of the content+rail row. Admin runs wider than vendor. */
  maxWidth?: string;
  /**
   * Hand-drawn sheet behind the content column, saying what this dashboard is
   * about without a word. Omit for the surfaces that are already dense   admin
   * is tables end to end and a texture under them only makes them harder to
   * read.
   */
  doodle?: 'house' | 'food';
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
  doodle,
}: DashboardShellProps) {
  const profile = await getDashboardProfile(navKey);

  /*
   * Which console rows this person is allowed to see.
   *
   * Only asked for the admin console: it is the one dashboard where two people
   * with the same role can be entitled to different screens. Everywhere else
   * the dashboard IS the entitlement   a vendor's sidebar is the vendor's
   * sidebar   so they pass null and nothing is filtered.
   *
   * THE SIDEBAR IS NOT THE ENFORCEMENT. Hiding a row stops it being offered;
   * it does not stop the URL being typed. Every page behind these rows guards
   * itself with requireStaffArea, and the RPCs check again inside the
   * database. This is the courtesy layer, and it is the one that must never be
   * mistaken for the other two.
   */
  const areas = navKey === 'admin' ? await visibleAreas() : null;

  return (
    <div className="bg-surface text-content min-h-screen">
      {/*
        `min-h-dvh` IS WHAT MAKES THE BACKDROP REACH THE BOTTOM ON A PHONE.

        The backdrop is painted inside <main>, which is `flex-1` - so it fills
        whatever height this row has. This row had none: the wrapper above sets
        `min-h-screen`, but a block parent does not stretch a child, so the row
        was only ever as tall as its contents.

        On desktop that was invisible, because the sidebar next to it is
        `h-screen` and a flex row is as tall as its tallest child. On mobile the
        sidebar is `hidden`, that prop disappeared, and the doodle stopped dead
        where the content stopped - on every dashboard screen at once, which is
        the tell that it was the shell and not any one page.

        dvh rather than vh: on mobile browsers vh is the height WITH the address
        bar hidden, so it overshoots by the toolbar and leaves a scroll nobody
        asked for.
      */}
      <div className={`mx-auto flex min-h-dvh ${maxWidth}`}>
        <aside className="border-line/10 bg-panel sticky top-0 hidden h-screen w-64 shrink-0 overflow-hidden border-r p-4 md:block">
          {/* The store switcher is suppressed for the same reason the nav is:
              "No store assigned yet" over a sidebar that is already saying the
              business is unfinished is the same sentence twice. */}
          <DashboardSidebar
            navKey={navKey}
            profile={profile}
            topSlot={profile.businessReady === false ? undefined : sidebarSlot}
            areas={areas}
          />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <DashboardHeader navKey={navKey} profile={profile} areas={areas} />
          {/* No AppFooter here. A dashboard is a working surface - a marketing
              and legal link band under every table and form is noise, and the
              same links are already reachable from the account menu and the
              public site. It stays on AppShell and /around, which are browsing
              surfaces where it belongs. */}
          {/* `relative isolate` is load-bearing: DoodleBackdrop is -z-10 and
              without a stacking context here it slides behind the page's own
              background and disappears. */}
          <main className="relative isolate flex-1 p-4 md:p-8">
            {doodle && (
              // Fainter than the marketing surfaces. This one sits under
              // tables, forms and money, so it has to read as paper texture
              // and never compete with a number. The food sheet is packed edge
              // to edge where the townscape is sparse, so it takes the lower
              // alpha of the two at the same tile size.
              <DoodleBackdrop
                art={doodle}
                tile={620}
                className={
                  doodle === 'food'
                    ? 'text-ink/3 dark:text-cream/4'
                    : 'text-ink/4 dark:text-cream/5'
                }
              />
            )}
            {children}
          </main>
        </div>
      </div>

      {/* NO FLOATING CHAT BUBBLE.

          Messaging lives in ONE place, the Inbox, and it used to live in two:
          a draggable overlay pinned over every screen, plus the real inbox
          route. Two surfaces onto the same conversations table meant two sets
          of unread state, two places to look for the same thread, and a bubble
          sitting on top of the primary action on a small screen.

          The Inbox is a nav destination now, on every dashboard including the
          student one. See config/dashboard-nav. */}
    </div>
  );
}
