/**
 * Every area access can be granted over, in one place.
 *
 * WHY THIS IS NOT IN THE DATABASE
 *   It is product config, not state. `access_grants` records what a role WAS
 *   given; this is the list of what CAN be given, and an area nobody has been
 *   granted still has to appear in the editor — as ungranted. Deriving the list
 *   from the rows would hide exactly the areas that matter most, because an
 *   area with no grants is the interesting one.
 *
 *   It also means adding a screen is a code change, not a migration. Same
 *   reasoning as modules/verification/requirements.
 *
 * TWO SCOPES, DELIBERATELY SEPARATE LISTS
 *   The console and a vendor's branch are different vocabularies. "Disputes"
 *   means the platform's queue to staff and nothing at all to a food seller;
 *   "Earnings" means one branch's money to a vendor and would be meaningless
 *   platform-wide. One list would force every screen to filter it.
 *
 * READ VERSUS WRITE
 *   read  can open the screen and see what is there
 *   write can also act — approve, refund, publish, invite
 *
 *   The distinction is worth having because most of the risk in this console is
 *   in the acting, not the looking, and "let them see the queue without letting
 *   them decide" is a real thing to want from a new reviewer.
 */

export type AccessLevel = 'none' | 'read' | 'write';
export type AccessScope = 'admin' | 'storefront';

export interface AreaSpec {
  /** Stored in access_grants.area. Never change one without a data migration. */
  key: string;
  label: string;
  /** What someone holding it can actually do, in the terms staff use. */
  description: string;
  /** The route it guards, for the sidebar and for redirecting away. */
  href?: string;
}

export const ADMIN_AREAS: AreaSpec[] = [
  {
    key: 'overview',
    label: 'Overview',
    description: 'The console home and its headline numbers.',
    href: '/admin',
  },
  {
    key: 'vendors',
    label: 'Vendor verification',
    description: 'Review vendor documents and decide whether a business is real.',
    href: '/admin/vendors',
  },
  {
    key: 'landlords',
    label: 'Landlords',
    description: 'Review landlords and the properties they list.',
    href: '/admin/landlord',
  },
  {
    key: 'riders',
    label: 'Riders & fleets',
    description: 'Verify riders, suspend them, and see what they have delivered.',
    href: '/admin/riders',
  },
  {
    key: 'verification',
    label: 'Verification queue',
    description: 'The read-only view of where every account stands.',
    href: '/admin/verification',
  },
  {
    key: 'verify_visits',
    label: 'Verification visits',
    description: 'Schedule and record in-person checks.',
    href: '/admin/verify-visits',
  },
  {
    key: 'students',
    label: 'Students',
    description: 'The people the platform is for. Suspend or archive one.',
    href: '/admin/students',
  },
  {
    key: 'events',
    label: 'Events',
    description: 'What is being listed on campus, and who is running it.',
    href: '/admin/events',
  },
  {
    key: 'users',
    label: 'Users',
    description: 'The account directory — every role in one list.',
    href: '/admin/users',
  },
  {
    key: 'staff',
    label: 'Staff & roles',
    description: 'Who has console access and what each role can do.',
    href: '/admin/staff',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description: 'Revenue, orders and platform activity.',
    href: '/admin/analytics',
  },
  {
    key: 'editorial',
    label: 'Editorial',
    description: 'Articles and what is featured on the front page.',
    href: '/admin/editorial',
  },
  {
    key: 'reviews',
    label: 'Reviews',
    description: 'Moderate what students have written.',
    href: '/admin/reviews',
  },
  {
    key: 'disputes',
    label: 'Disputes',
    description: 'Decide who is owed what when an order goes wrong. Moves money.',
    href: '/admin/disputes',
  },
  {
    key: 'payouts',
    label: 'Payouts',
    description: 'Approve withdrawals. Moves money out of the platform.',
    href: '/admin/payouts',
  },
  {
    key: 'promotions',
    label: 'Promotions & placement',
    description: 'Platform promotions and paid front-page slots.',
    href: '/admin/promotions',
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Rates, fees and feature flags. Changes what everyone else is charged.',
    href: '/admin/settings',
  },
];

export const STOREFRONT_AREAS: AreaSpec[] = [
  {
    key: 'orders',
    label: 'Orders',
    description: 'See and fulfil orders for this branch.',
  },
  {
    key: 'listings',
    label: 'Listings',
    description: 'What the branch sells, its prices and its stock.',
  },
  {
    key: 'earnings',
    label: 'Earnings',
    description: 'What the branch has made, and withdrawing it.',
  },
  {
    key: 'promotions',
    label: 'Promotions',
    description: 'Discount codes and campaigns for this branch.',
  },
  {
    key: 'inbox',
    label: 'Inbox',
    description: 'Messages from students about their orders.',
  },
  {
    key: 'team',
    label: 'Team',
    description: 'Invite people to this branch and set what they can do.',
  },
  {
    key: 'settings',
    label: 'Branch settings',
    description: 'Opening hours, address, and pausing orders.',
  },
];

export function areasFor(scope: AccessScope): AreaSpec[] {
  return scope === 'admin' ? ADMIN_AREAS : STOREFRONT_AREAS;
}

export function areaSpec(scope: AccessScope, key: string): AreaSpec | undefined {
  return areasFor(scope).find((a) => a.key === key);
}

/** `write` implies `read`; anything else is a straight comparison. */
export function satisfies(held: AccessLevel, needed: Exclude<AccessLevel, 'none'>): boolean {
  if (held === 'write') return true;
  return held === needed;
}
