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
  Megaphone,
  Newspaper,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  TicketIcon,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { resolveVendorTerms, type TermKey, type VendorCategory } from '@/config/vendor-vocabulary';

export type DashboardNavKey = 'vendor' | 'landlord' | 'admin' | 'student';

export interface DashboardNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional count pill rendered on the right of the row. */
  badge?: number;
  /** Descriptive page title for the header (falls back to `label`). */
  heading?: string;
  /**
   * Marks this row as renameable by vendor category (see config/vendor-vocabulary).
   * The `label`/`heading` above stay as the neutral fallback; `resolveDashboardNav`
   * swaps in the category's wording. The href never changes.
   */
  termKey?: TermKey;
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
 * The nav for a role with the signed-in vendor's wording applied. Every consumer
 * (sidebar, header) goes through here rather than reading DASHBOARD_NAV directly,
 * so exactly one module knows vendor categories exist. Roles without a category
 * get the config back untouched.
 */
export function resolveDashboardNav(
  navKey: DashboardNavKey,
  category?: VendorCategory | null,
): DashboardNavConfig {
  const config = DASHBOARD_NAV[navKey];
  const renameable = config.sections.some((s) => s.items.some((i) => i.termKey));
  if (!category || !renameable) return config;

  const terms = resolveVendorTerms(category);
  return {
    ...config,
    sections: config.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (!item.termKey) return item;
        const term = terms[item.termKey];
        return { ...item, label: term.label, heading: term.heading };
      }),
    })),
  };
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
  category?: VendorCategory | null,
): { label: string; heading: string } {
  const { sections, brandLabel, rootHref } = resolveDashboardNav(navKey, category);
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
          { href: '/vendor/listings', label: 'Listings', icon: List, termKey: 'listings' },
          { href: '/vendor/orders', label: 'Orders', icon: ShoppingBag, termKey: 'orders' },
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
          { href: '/admin', label: 'Overview', icon: LayoutDashboard },
          { href: '/admin/vendors', label: 'Vendors', icon: ShieldCheck },
          { href: '/admin/verify-visits', label: 'Verification visits', icon: ClipboardCheck },
          { href: '/admin/users', label: 'Users', icon: Users },
        ],
      },
      {
        label: 'Insights',
        items: [
          { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
          { href: '/admin/editorial', label: 'Editorial', icon: Newspaper },
        ],
      },
      {
        label: 'Oversight',
        items: [
          { href: '/admin/disputes', label: 'Disputes', icon: AlertOctagon },
          { href: '/admin/settings', label: 'Settings', icon: Settings },
        ],
      },
    ],
  },
  student: {
    brandLabel: 'Account',
    rootHref: '/me',
    sections: [
      {
        items: [
          { href: '/me', label: 'Overview', heading: 'Your dashboard', icon: LayoutDashboard },
          {
            href: '/me/insights',
            label: 'Insights',
            heading: 'Your spending & usage',
            icon: TrendingUp,
          },
          { href: '/me/wallet', label: 'Wallet', heading: 'Your wallet', icon: Wallet },
          { href: '/me/saved', label: 'Saved', heading: 'Saved places', icon: Bookmark },
          {
            href: '/me/bookings',
            label: 'Bookings',
            heading: 'Your bookings',
            icon: ClipboardList,
          },
        ],
      },
      {
        label: 'Activity',
        items: [
          { href: '/me/events', label: 'Events', heading: 'Your events', icon: CalendarDays },
          { href: '/me/tickets', label: 'Tickets', heading: 'Your tickets', icon: TicketIcon },
          {
            href: '/me/notifications',
            label: 'Notifications',
            heading: 'Notifications',
            icon: Bell,
          },
          { href: '/me/reviews', label: 'Reviews', heading: 'Your reviews', icon: Star },
        ],
      },
    ],
  },
};
