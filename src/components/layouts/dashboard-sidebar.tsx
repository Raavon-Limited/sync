/**
 * DashboardSidebar - the shared, theme-aware sidebar used by every role's
 * dashboard. Structure mirrors the reference design: wordmark + role label,
 * a profile card (real signed-in user), grouped nav sections with optional
 * count pills + active highlight, and a Log out action pinned to the bottom.
 *
 * Presentation only - the nav config is selected by `navKey` (see
 * config/dashboard-nav) and the profile block is computed server-side by
 * getDashboardProfile, so no icon components cross the server→client boundary.
 *
 * Rendered both in the sticky desktop rail and inside the mobile drawer; pass
 * `onNavigate` from the drawer so tapping a link closes it.
 */
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SyncLogo } from '@/components/brand/sync-logo';
import { DASHBOARD_NAV, type DashboardNavKey } from '@/config/dashboard-nav';
import type { DashboardProfile } from './dashboard-profile';
import { toast } from '@/components/ui/toast';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AFTER_SIGN_OUT } from '@/config/site';
import { signOut } from '@/modules/auth/actions';

interface DashboardSidebarProps {
  navKey: DashboardNavKey;
  /** Optional block above the nav   the vendor store switcher. */
  topSlot?: React.ReactNode;
  /**
   * Rendered in the wordmark row, immediately after the mode toggle. The
   * mobile drawer's close button goes here.
   *
   * It has to be passed IN rather than positioned over: the drawer used to
   * place its own X at `absolute top-3 right-3`, which is the exact spot this
   * row puts the mode toggle. On a phone the two controls sat on top of each
   * other   the X drawn over the sun icon   and whichever one you meant, you
   * got the other. Sharing one flex row is what the marketing menu already
   * does, and it cannot overlap by construction.
   */
  headerAction?: React.ReactNode;
  profile: DashboardProfile;
  /**
   * Area keys this person may open, or null for "everything on this config".
   *
   * Resolved server-side by DashboardShell   a client component cannot ask the
   * database what it is allowed to render, and one that tried would be asking
   * the browser to be honest about it.
   */
  areas?: string[] | null;
  onNavigate?: () => void;
}

export function DashboardSidebar({
  navKey,
  profile,
  onNavigate,
  topSlot,
  headerAction,
  areas = null,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { brandLabel, sections: allSections, rootHref } = DASHBOARD_NAV[navKey];

  /*
   * The nav this person actually gets.
   *
   * A row is kept when it claims no area (every row on every non-admin
   * dashboard) or when they hold something in that area. A section that ends
   * up empty is dropped whole   an "INSIGHTS" heading with nothing under it
   * reads as a screen that failed to load rather than as a screen they were
   * never given.
   *
   * A row with `targets` fronts several routes behind one label   Accounts is
   * Vendors, Landlords and Riders. It survives if ANY of them is held, and it
   * points at the FIRST one that is: a reviewer granted only `riders` gets an
   * Accounts row that opens Riders, rather than one that opens Vendors and
   * bounces them to /403.
   */
  const holds = (area?: string) => !areas || !area || areas.includes(area);

  /*
   * A HALF-BUILT BUSINESS GETS ONE ROW.
   *
   * Someone who claimed the vendor role and abandoned the wizard has no
   * vendor_profiles row, so Stores, Listings, Orders, Team, Earnings and
   * Promotions all read from something that is not there. A sidebar of eleven
   * rows that can only say "nothing yet" reads as a broken product rather than
   * as an unfinished signup   and it buries the one thing they actually have
   * to do.
   *
   * The overview is kept because that is where the "Verify Now" banner lives,
   * and that banner opens the wizard IN A SHEET on the same page   so one row
   * really is enough to finish. The rest come back the moment the business
   * exists, which is what makes this a state and not a permission.
   */
  const rootOnly = profile.businessReady === false;

  const sections = allSections
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) =>
          rootOnly
            ? item.href === rootHref
            : item.targets
              ? item.targets.some((t) => holds(t.area))
              : holds(item.area),
        )
        .map((item) => ({
          ...item,
          href: item.targets
            ? (item.targets.find((t) => holds(t.area))?.href ?? item.href)
            : item.href,
        })),
    }))
    .filter((section) => section.items.length > 0);

  // Student + vendor dashboards live at a name-based root (e.g. /muiz-owolabi),
  // so rewrite each item's href from its static base (/user, /vendor) to the
  // handle. Other roles keep their static hrefs.
  const handle = navKey === 'student' || navKey === 'vendor' ? profile.handle : undefined;
  const toHref = (href: string) => (handle ? `/${handle}${href.slice(rootHref.length)}` : href);

  // Every path a row can be highlighted for. A row with `targets` answers for
  // all of them, not only the one it happens to point at   otherwise Accounts
  // would go dark the moment you switched to the Landlords tab, which is a
  // route it owns.
  const pathsOf = (item: (typeof sections)[number]['items'][number]) =>
    item.targets ? item.targets.map((t) => toHref(t.href)) : [toHref(item.href)];

  // Best match = the longest of those the current path falls under, so the
  // overview row (e.g. /muiz-owolabi) stays inactive on /muiz-owolabi/orders.
  const activeHref = sections
    .flatMap((s) => s.items.flatMap(pathsOf))
    .filter((href) => pathname === href || pathname.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0];

  async function handleSignOut() {
    onNavigate?.();
    const res = await signOut();
    if (!res.ok) {
      toast(res.error);
      return;
    }
    router.push(AFTER_SIGN_OUT);
    router.refresh();
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      {/* Wordmark + role on the left; mode toggle and, in the drawer, the close
          button share the right edge as siblings rather than as a stack. */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-2">
        {/* Points at the dashboard root, NOT `/`. The landing page is a web-only
            surface; from inside a dashboard the lockup should return you to your
            own overview, the way it does in any app. */}
        <Link
          href={toHref(rootHref)}
          onClick={onNavigate}
          className="text-content"
          aria-label={`${brandLabel} overview`}
        >
          {/* The kit's dashboard lockup: mark + wordmark + role tag. */}
          <SyncLogo height={18} role={brandLabel} />
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle className="text-content" />
          {headerAction}
        </div>
      </div>

      {/* Profile card */}
      <div className="border-line/10 bg-surface-deep/60 flex shrink-0 flex-col gap-3 rounded-2xl border p-4">
        <div className="flex items-center gap-3">
          <span className="bg-lime text-ink font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm">
            {profile.initial}
          </span>
          <div className="min-w-0">
            <p className="eyebrow text-accent-fg">{profile.eyebrow}</p>
            <p className="text-content truncate text-sm font-medium">{profile.name}</p>
          </div>
        </div>
        {profile.email && (
          <p className="text-content-muted -mt-1 truncate text-xs">{profile.email}</p>
        )}
        {profile.metaValue && (
          <div className="border-line/10 border-t pt-3">
            <p className="eyebrow text-content-muted">{profile.metaLabel}</p>
            <p className="text-content mt-0.5 truncate text-sm">{profile.metaValue}</p>
          </div>
        )}
      </div>

      {topSlot && <div className="shrink-0 px-1">{topSlot}</div>}

      {/* Grouped nav */}
      {/* The rail owns no scroll of its own: this list is the only part that
          scrolls, so the wordmark, the profile card and Log out stay put no
          matter how long a role's nav gets. min-h-0 is load-bearing - without
          it a flex child refuses to shrink below its content and the overflow
          moves back out to the frame. The negative inline margin lets an active
          row keep its full width while the scrollbar sits in the padding. */}
      <nav
        aria-label={`${brandLabel} navigation`}
        className="rail-scroll -mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 pb-1"
      >
        {sections.map((section, i) => (
          <div key={section.label ?? i} className="flex flex-col gap-1">
            {section.label && (
              <p className="eyebrow text-content-muted mb-1 px-3">{section.label}</p>
            )}
            {section.items.map((item) => {
              const { href, label, icon: Icon, badge } = item;
              const resolved = toHref(href);
              // Any of the row's paths winning makes the row active, not just
              // the one it links to. See `pathsOf`.
              const active = pathsOf(item).includes(activeHref);
              return (
                <Link
                  key={href}
                  href={resolved}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    active ? 'bg-ink text-cream' : 'text-content hover:bg-ink/5',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{label}</span>
                  {typeof badge === 'number' && badge > 0 && (
                    <span
                      className={cn(
                        'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                        active ? 'bg-cream/20 text-cream' : 'bg-ink/10 text-content-muted',
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* HOME, AND WHY IT POINTS AT /around RATHER THAN /.
          This link was removed once, correctly: it went to `/`, the marketing
          landing page, and sending a signed-in user there from their dashboard
          is a way out of the product rather than navigation.

          The removal left a hole, though. The reasoning was that home is
          reached from the bottom tab bar   and that bar is `md:hidden`. So on
          a laptop a vendor, a landlord, an agent or an admin had no route back
          into the marketplace at all: they could reach their own dashboard and
          nothing else. Same link, right destination.

          It sits with Log out because both are ways OUT of this dashboard, and
          keeping them together stops the nav above reading as though the app
          were only this. */}
      <div className="border-line/10 shrink-0 space-y-1 border-t pt-3">
        <Link
          href="/around"
          className="text-content-muted hover:bg-ink/5 hover:text-content flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
        >
          <Home className="h-4 w-4 shrink-0" aria-hidden="true" />
          Home
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-coral hover:bg-coral/10 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Log out
        </button>
      </div>
    </div>
  );
}
