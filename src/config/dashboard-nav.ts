/**
 * Per-role dashboard sidebar navigation. Every role (vendor, landlord, admin,
 * student) gets its OWN sidebar config here - the shared <DashboardSidebar>
 * just renders whichever config it's handed by `navKey`.
 *
 * Items are grouped into labelled sections (the eyebrow headers in the sidebar,
 * e.g. "BUSINESS", "OVERSIGHT"). `badge` is an optional count pill.
 *
 * This module is icon-data only (no hooks) so it's safe to import from the
 * client <DashboardSidebar> - that avoids passing icon components across the
 * server→client boundary.
 */
import {
  AlertOctagon,
  BarChart3,
  Bell,
  Bookmark,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  List,
  BadgeCheck,
  MapPin,
  UserCheck,
  Mail,
  Megaphone,
  MessageSquareQuote,
  Newspaper,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  TicketIcon,
  TrendingUp,
  Truck,
  UserCog,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type DashboardNavKey =
  | 'vendor'
  | 'landlord'
  | 'admin'
  | 'student'
  | 'rider'
  | 'organiser'
  | 'agent';

export interface DashboardNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional count pill rendered on the right of the row. */
  badge?: number;
  /** Descriptive page title for the header (falls back to `label`). */
  heading?: string;
  /**
   * The access area this row belongs to, from modules/access/areas.
   *
   * Present on the admin console only, where what somebody can reach is a
   * per-role grant rather than a property of being staff. DashboardShell
   * resolves the caller's areas and drops the rows they hold nothing for, so a
   * reviewer's sidebar is the four screens they work in rather than fifteen
   * screens, eleven of which answer /403.
   *
   * A row with no `area` is shown to everybody who can see that dashboard at
   * all   which is every row on every other dashboard, so they are unaffected.
   */
  area?: string;
  /**
   * For one row that fronts several routes   Accounts is Vendors, Landlords
   * and Riders, switched between by the tab bar on those pages.
   *
   * The row appears if ANY of these areas is held and points at the first one
   * that is, so a reviewer granted only `riders` gets a row that opens Riders
   * rather than one that opens Vendors and bounces them to /403. It also
   * highlights on every listed path, not only the one it links to.
   *
   * Takes precedence over `area` when present.
   */
  targets?: { area: string; href: string }[];
}

export interface DashboardNavSection {
  /** Eyebrow header above the group (omit for the primary, unlabelled group). */
  label?: string;
  items: DashboardNavItem[];
}

export interface DashboardNavConfig {
  /** Role label shown under the wordmark, e.g. "Vendor". */
  brandLabel: string;
  /** Base route for the role - used so the overview row only matches exactly. */
  rootHref: string;
  sections: DashboardNavSection[];
}

/**
 * The nav item the current path falls under (longest-prefix match), resolving
 * handle-based hrefs the same way the sidebar does. Used by the header to show
 * "what screen we're on": `label` for the breadcrumb, `heading` for the big
 * title. Falls back to the role's brand label.
 */
export function activeNav(
  navKey: DashboardNavKey,
  pathname: string,
  handle?: string,
): { label: string; heading: string } {
  const { sections, brandLabel, rootHref } = DASHBOARD_NAV[navKey];
  const toHref = (href: string) => (handle ? `/${handle}${href.slice(rootHref.length)}` : href);
  let label = brandLabel;
  let heading = brandLabel;
  let bestLen = -1;
  for (const section of sections) {
    for (const item of section.items) {
      const href = toHref(item.href);
      if ((pathname === href || pathname.startsWith(href + '/')) && href.length > bestLen) {
        label = item.label;
        heading = item.heading ?? item.label;
        bestLen = href.length;
      }
    }
  }
  return { label, heading };
}

export const DASHBOARD_NAV: Record<DashboardNavKey, DashboardNavConfig> = {
  vendor: {
    brandLabel: 'Vendor',
    rootHref: '/vendor',
    sections: [
      {
        items: [
          { href: '/vendor', label: 'Overview', icon: LayoutDashboard },
          { href: '/vendor/stores', label: 'Stores', icon: Store },
          // Access is granted per store but managed per person, so it sits
          // beside Stores rather than inside it.
          { href: '/vendor/team', label: 'Team', icon: Users, heading: 'Team & access' },
          { href: '/vendor/listings', label: 'Listings', icon: List },
          { href: '/vendor/orders', label: 'Orders', icon: ShoppingBag },
          { href: '/vendor/inbox', label: 'Inbox', icon: Inbox },
        ],
      },
      {
        label: 'Business',
        items: [
          { href: '/vendor/earnings', label: 'Earnings', icon: Wallet },
          { href: '/vendor/promotions', label: 'Promotions', icon: Megaphone },
          { href: '/vendor/plan', label: 'Plan', icon: Sparkles },
        ],
      },
      {
        label: 'Account',
        items: [{ href: '/vendor/settings', label: 'Settings', icon: Settings }],
      },
    ],
  },
  landlord: {
    brandLabel: 'Landlord',
    rootHref: '/landlord',
    sections: [
      {
        items: [
          { href: '/landlord', label: 'Overview', icon: LayoutDashboard },
          { href: '/landlord/properties', label: 'Properties', icon: Building2 },
          { href: '/landlord/tenants', label: 'Tenants', icon: Users },
          { href: '/landlord/requests', label: 'Booking requests', icon: ClipboardList },
          { href: '/landlord/inbox', label: 'Inbox', icon: Inbox },
        ],
      },
      {
        label: 'Business',
        items: [{ href: '/landlord/earnings', label: 'Earnings', icon: Wallet }],
      },
      {
        label: 'Account',
        items: [{ href: '/landlord/settings', label: 'Settings', icon: Settings }],
      },
    ],
  },
  admin: {
    brandLabel: 'Admin',
    rootHref: '/admin',
    sections: [
      {
        items: [
          { href: '/admin', label: 'Overview', icon: LayoutDashboard, area: 'overview' },
          /*
           * ONE ROW FOR EVERY KIND OF ACCOUNT STAFF REVIEW.
           *
           * Vendors, Landlords and Riders were three sidebar rows, and the
           * sidebar is where they competed with Analytics and Disputes for
           * space while all three asked the same question   is this account
           * real, and should it be trading. They are one row now, and the tab
           * bar on those pages switches between them, including per-trade
           * views of the business queue.
           *
           * They stay three ROUTES, which is why this is `targets` rather than
           * a merged page: each fetches only its own data, keeps its own
           * filters, and stays linkable.
           */
          {
            href: '/admin/vendors',
            label: 'Accounts',
            heading: 'Accounts & verification',
            icon: ShieldCheck,
            targets: [
              { area: 'vendors', href: '/admin/vendors' },
              { area: 'landlords', href: '/admin/landlord' },
              { area: 'riders', href: '/admin/riders' },
              { area: 'students', href: '/admin/students' },
              { area: 'events', href: '/admin/events' },
            ],
          },
          {
            href: '/admin/verify-visits',
            label: 'Verification visits',
            icon: ClipboardCheck,
            area: 'verify_visits',
          },
          { href: '/admin/users', label: 'Users', icon: Users, area: 'users' },
        ],
      },
      {
        label: 'Trust',
        items: [
          // Read-only, and above the per-type review pages in meaning rather
          // than beside them: this is "where does everyone stand", the pages
          // under it are "decide this one".
          {
            href: '/admin/verification',
            label: 'Verification queue',
            heading: 'Verification across the platform',
            icon: ShieldCheck,
            area: 'verification',
          },
          // Visible to every admin GRANTED IT, editable only by a super admin.
          // It used to be visible to every admin full stop, on the reasoning
          // that somebody who cannot see who else has access cannot tell a
          // colleague from a problem. That still holds for an admin   and it
          // is now a grant, because "who runs Sync" is not something a
          // part-time document reviewer needs on their screen.
          {
            href: '/admin/staff',
            label: 'Staff',
            // "Who runs Sync" is the name of a tab on that page now. Leaving it
            // here too meant the sticky header announced one tab by name while
            // you were reading the other.
            heading: 'Staff & access',
            icon: UserCog,
            area: 'staff',
          },
        ],
      },
      {
        label: 'Insights',
        items: [
          { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, area: 'analytics' },
          { href: '/admin/editorial', label: 'Editorial', icon: Newspaper, area: 'editorial' },
          {
            href: '/admin/reviews',
            label: 'Reviews',
            icon: MessageSquareQuote,
            area: 'reviews',
          },
        ],
      },
      {
        label: 'Oversight',
        items: [
          { href: '/admin/disputes', label: 'Disputes', icon: AlertOctagon, area: 'disputes' },
          // Its own area, held by nobody until it is granted   this is the one
          // row that can write to every account on the platform at once.
          { href: '/admin/agents', label: 'Agents', icon: UserCheck, area: 'agents' },
          { href: '/admin/mail', label: 'Mail centre', icon: Mail, area: 'mail' },
          // NO AREA, deliberately: it is this person's own ID card, and a
          // reviewer granted riders alone still knocks on doors.
          { href: '/admin/card', label: 'My staff ID', icon: BadgeCheck },
          { href: '/admin/settings', label: 'Settings', icon: Settings, area: 'settings' },
        ],
      },
    ],
  },
  /*
   * The event organiser. Three rows, because there are three things they do:
   * see what is selling, list another one, and get their money.
   *
   * No area keys - those are the admin console's, where two people with the
   * same role can be entitled to different screens. An organiser's dashboard is
   * their entitlement.
   */
  organiser: {
    brandLabel: 'Organiser',
    rootHref: '/organiser',
    sections: [
      {
        items: [
          { href: '/organiser', label: 'Overview', icon: LayoutDashboard },
          {
            href: '/organiser/events',
            label: 'Your events',
            heading: 'What you have on',
            icon: CalendarDays,
          },
          {
            href: '/organiser/events/new',
            label: 'List an event',
            heading: 'List an event',
            icon: TicketIcon,
          },
        ],
      },
      {
        label: 'Business',
        items: [
          { href: '/organiser/wallet', label: 'Wallet', icon: Wallet },
          { href: '/organiser/promotions', label: 'Promotions', icon: Megaphone },
        ],
      },
      {
        label: 'Account',
        // /user/verify, not a route of their own: that screen is role-driven and
        // serves every account whose status lives in profiles. The proxy admits
        // event managers to that one path specifically.
        items: [
          { href: '/user/verify', label: 'Verification', icon: ShieldCheck },
          { href: '/organiser/settings', label: 'Settings', icon: Settings },
        ],
      },
    ],
  },
  /*
   * The agent. One thing they do, so one row plus their card: an agent opens
   * this on a phone, in a stairwell, with one hand   a nav with sections is a
   * nav they scroll past to reach the only screen they came for.
   */
  agent: {
    brandLabel: 'Agent',
    rootHref: '/agent',
    sections: [
      {
        items: [
          { href: '/agent', label: 'Your visits', heading: 'Where you are expected', icon: MapPin },
        ],
      },
      {
        label: 'Account',
        // No area: it is their own ID, and it is the thing a landlord asks to
        // see before opening a gate.
        items: [{ href: '/agent/card', label: 'Your Sync ID', icon: BadgeCheck }],
      },
    ],
  },
  rider: {
    brandLabel: 'Rider',
    rootHref: '/rider',
    sections: [
      {
        items: [
          { href: '/rider', label: 'Today', heading: 'Your shift', icon: LayoutDashboard },
          // The board is its own screen rather than a panel on the overview:
          // it is the thing a rider stares at between jobs, and it refreshes.
          {
            href: '/rider/board',
            label: 'Open jobs',
            heading: 'Jobs to take',
            icon: ClipboardList,
          },
          { href: '/rider/history', label: 'History', heading: 'Completed deliveries', icon: List },
        ],
      },
      {
        label: 'Business',
        items: [
          // Shown to every rider, because an independent one can still find out
          // what a fleet is here. The page explains itself when there is none.
          { href: '/rider/fleet', label: 'My fleet', heading: 'Fleet', icon: Truck },
        ],
      },
      {
        label: 'Account',
        // A rider uploads their licence once, inside /rider/join, and until now
        // had nowhere to see what a reviewer did with it. Settings is that
        // place   the same panel a landlord has had all along.
        items: [{ href: '/rider/settings', label: 'Settings', icon: Settings }],
      },
    ],
  },
  student: {
    brandLabel: 'Account',
    rootHref: '/user',
    sections: [
      {
        items: [
          { href: '/user', label: 'Overview', heading: 'Your dashboard', icon: LayoutDashboard },
          {
            href: '/user/insights',
            label: 'Insights',
            heading: 'Your spending & usage',
            icon: TrendingUp,
          },
          { href: '/user/wallet', label: 'Wallet', heading: 'Your wallet', icon: Wallet },
          { href: '/user/saved', label: 'Saved', heading: 'Saved places', icon: Bookmark },
          {
            href: '/user/bookings',
            label: 'Bookings',
            heading: 'Your bookings',
            icon: ClipboardList,
          },
        ],
      },
      {
        label: 'Activity',
        items: [
          { href: '/user/events', label: 'Events', heading: 'Your events', icon: CalendarDays },
          { href: '/user/tickets', label: 'Tickets', heading: 'Your tickets', icon: TicketIcon },
          {
            href: '/user/notifications',
            label: 'Notifications',
            heading: 'Notifications',
            icon: Bell,
          },
          { href: '/user/reviews', label: 'Reviews', heading: 'Your reviews', icon: Star },
        ],
      },
      {
        label: 'Account',
        // THE ONE ROLE THAT HAD NO SETTINGS LINK.
        //
        // /user/settings has existed all along - the ID card, the student
        // details, the documents panel and the delete button are all on it -
        // and nothing in the shell pointed at it. Worse, `activeNav` matches on
        // the longest prefix, so with no entry of its own the page fell through
        // to '/user' and wore the heading "Your dashboard": somebody looking at
        // their ID card was told they were on the overview. Both halves are
        // fixed by the row existing.
        //
        // Profile sits beside it because that is the page the account menu's
        // "Profile" already opens, and a link you can only reach from a
        // dropdown is a link most people never find.
        items: [
          { href: '/user/profile', label: 'Profile', heading: 'Your profile', icon: UserRound },
          {
            href: '/user/settings',
            label: 'Settings',
            heading: 'Account settings',
            icon: Settings,
          },
        ],
      },
    ],
  },
};
