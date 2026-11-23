/**
 * The public header's navigation - one source for the desktop dropdowns and
 * the mobile menu, so the two can never list different things.
 *
 * EVERY `href` HERE MUST BE A ROUTE THAT EXISTS. The same rule as invariant 6
 * in docs/WORKFLOW.md, for the same reason: a nav item that 404s is worse than
 * no nav item. Things the product is planning but has not built (Sync Internet,
 * Dispatch for students, communities, a careers page) carry `soon: true` and NO
 * href, and render as a labelled, unclickable row. When one ships, give it an
 * href and drop the flag - nothing else needs to change.
 *
 * The "Spill the gist" and "Careers" items do not have pages of their own yet.
 * They open the Reach out form on the landing page with the topic preselected
 * (`/?topic=...#contact`), which is a real, working way to send that request
 * today rather than a promise of one.
 */
import { MODULES } from '@/config/modules';
import { LEGAL_LINKS } from '@/config/footer-nav';
import { SITE } from '@/config/site';

export interface NavItem {
  label: string;
  /** One short line under the label. Optional for plain link lists. */
  desc?: string;
  /** Absent only when `soon` is true. */
  href?: string;
  soon?: boolean;
  /** Matches a SyncIcon name where the kit has one; otherwise a lucide name. */
  icon?: string;
}

export interface NavGroup {
  label: string;
  /** Mono kicker at the top of the dropdown. */
  kicker: string;
  items: NavItem[];
  /** Two-column grid on desktop. */
  wide?: boolean;
}

/** The topic keys the Reach out form understands. Keep in step with it. */
export const CONTACT_TOPICS = [
  'general',
  'vendor',
  'gist',
  'spotlight',
  'event',
  'feature',
  'careers',
  'issue',
] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

const contact = (topic: ContactTopic) => `/?topic=${topic}#contact`;

export const EXPLORE: NavGroup = {
  label: 'Explore',
  kicker: 'Everything on Sync',
  wide: true,
  items: [
    ...MODULES.map((m) => ({
      label: m.label,
      desc: m.tagline,
      href: `/${m.slug}`,
      icon: m.iconName,
    })),
    // Planned, not built. See the header comment before giving these an href.
    { label: 'Sync Internet', desc: 'Fast Wi-Fi that actually works', soon: true, icon: 'wifi' },
    { label: 'Dispatch', desc: 'Pickups, errands and moves', soon: true, icon: 'truck' },
  ],
};

export const GIST: NavGroup = {
  label: 'Spill the gist',
  kicker: "What's happening around you?",
  wide: true,
  items: [
    { label: 'Drop campus gist', desc: 'Something is happening? Put us on.', href: contact('gist'), icon: 'megaphone' },
    { label: 'Get on the spotlight', desc: 'Nominate a person, spot or business', href: contact('spotlight'), icon: 'star' },
    { label: 'Promote your event', desc: 'Fill your venue with the right crowd', href: contact('event'), icon: 'ticket' },
    { label: 'Promote your business', desc: 'Get seen by students near you', href: '/for-vendors', icon: 'store' },
    { label: 'Feature on Sync home', desc: 'Pitch your story for the homepage', href: contact('feature'), icon: 'home' },
    { label: 'Find your community', desc: 'Clubs, groups and circles near you', soon: true, icon: 'users' },
    { label: 'Creators corner', desc: 'Artists, photographers and makers', soon: true, icon: 'brush' },
    { label: 'Start a community', desc: 'Bring your people together', soon: true, icon: 'plus' },
  ],
};

export const CAREERS: NavGroup = {
  label: 'Careers',
  kicker: 'Work with Sync',
  items: [
    { label: 'Open roles', desc: 'Build campus life with us', href: contact('careers'), icon: 'briefcase' },
    { label: 'Campus ambassadors', desc: 'Rep Sync on your campus', href: contact('careers'), icon: 'users' },
    { label: 'Internships', desc: 'Learn by shipping real things', href: contact('careers'), icon: 'graduation' },
  ],
};

export const POLICIES: NavGroup = {
  label: 'Policies',
  kicker: 'The fine print, made simple',
  wide: true,
  items: [
    ...LEGAL_LINKS.map((l) => ({ label: l.label, href: l.href, icon: 'doc' })),
    { label: 'How verification works', href: '/how-verification-works', icon: 'shield' },
    { label: 'Help centre', href: `mailto:${SITE.support.help}`, icon: 'help' },
  ],
};

/** Top-level order in the header. Plain links are `{ label, href }`. */
export const TOP_NAV: (NavGroup | { label: string; href: string })[] = [
  { label: 'Home', href: '/' },
  { label: 'How it works', href: '/#how' },
  EXPLORE,
  GIST,
  CAREERS,
  { label: 'About', href: '/about' },
  POLICIES,
];

export const isGroup = (x: (typeof TOP_NAV)[number]): x is NavGroup => 'items' in x;
