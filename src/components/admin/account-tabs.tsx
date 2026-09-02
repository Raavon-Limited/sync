/**
 * One tab bar across every kind of account staff review.
 *
 * TABS ARE LINKS, NOT STATE
 *   Each one is its own route, so opening a tab fetches only that tab's data.
 *   Riders alone is five queries plus signed photo URLs; landlords is another
 *   two plus storage. Merging them into one client-switched page would pay for
 *   all of it on every visit to look at one list.
 *
 *   It also keeps what already works: the back button, a link somebody can send
 *   a colleague, and the per-page filter state in AccountBrowser (status chips,
 *   search, and the grid/list preference it keeps in localStorage).
 *
 *   Which is why this is a SERVER component with no state at all. The active
 *   tab is passed in by the page that knows which one it is, rather than
 *   guessed from the pathname — /admin/vendors serves five different tabs and
 *   the pathname cannot tell them apart.
 *
 * IT SHOWS ONLY WHAT THE VIEWER CAN OPEN
 *   The tabs span three access areas, and a reviewer granted `riders` alone
 *   should not be offered Landlords. Resolved from the same `visibleAreas` the
 *   sidebar uses, so the two cannot disagree.
 *
 * 'SOON' TABS ARE NOT LINKS
 *   They are the surfaces the product has but the console does not review yet.
 *   Rendering them as dead text rather than links is the point: a tab that
 *   navigates to an empty screen is worse than one that admits it is not built.
 */
import Link from 'next/link';
import { visibleAreas } from '@/modules/access/guard';
import { cn } from '@/lib/utils';

export type AccountTabKey =
  | 'vendors'
  | 'food'
  | 'beauty'
  | 'laundry'
  | 'tradesman'
  | 'landlords'
  | 'riders'
  | 'students'
  | 'events';

interface TabSpec {
  key: string;
  label: string;
  /** Omitted for a 'soon' tab, which is not navigable. */
  href?: string;
  /** The access area it needs. Omitted for 'soon' tabs, which need none. */
  area?: string;
  soon?: boolean;
}

/**
 * The vendor categories come from lib/validations' VendorCategory, minus
 * 'landlord' — a landlord IS a vendor_profiles row with that category, but it
 * is reviewed on its own screen because it has properties to show and the
 * business queue has no column for them.
 */
const TABS: TabSpec[] = [
  { key: 'vendors', label: 'All businesses', href: '/admin/vendors', area: 'vendors' },
  { key: 'food', label: 'Food', href: '/admin/vendors?category=food', area: 'vendors' },
  { key: 'beauty', label: 'Beauty', href: '/admin/vendors?category=beauty', area: 'vendors' },
  { key: 'laundry', label: 'Laundry', href: '/admin/vendors?category=laundry', area: 'vendors' },
  {
    key: 'tradesman',
    label: 'Workmanship',
    href: '/admin/vendors?category=tradesman',
    area: 'vendors',
  },
  { key: 'landlords', label: 'Landlords', href: '/admin/landlord', area: 'landlords' },
  { key: 'riders', label: 'Riders', href: '/admin/riders', area: 'riders' },
  { key: 'students', label: 'Students', href: '/admin/students', area: 'students' },
  { key: 'events', label: 'Events', href: '/admin/events', area: 'events' },
  // The account type does not exist yet — /signup lists it as "Not yet" for the
  // same reason. Listed here so the shape of what is coming is visible, and so
  // nobody builds a second nav for it later.
  { key: 'creators', label: 'Content creators', soon: true },
];

export async function AccountTabs({ active }: { active: AccountTabKey }) {
  const areas = await visibleAreas();
  // null is a super admin: no filtering. Otherwise a tab needs its area held.
  const allowed = TABS.filter((t) => t.soon || !t.area || !areas || areas.includes(t.area));

  return (
    <nav
      aria-label="Account types"
      // Scrolls rather than wraps: nine tabs on a laptop is one row, and on a
      // narrow window a wrapped tab bar pushes the list itself below the fold.
      className="border-line/10 -mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-px"
    >
      {allowed.map((t) =>
        t.soon ? (
          <span
            key={t.key}
            aria-disabled="true"
            className="text-content-muted/50 flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm"
          >
            {t.label}
            <span className="border-line/20 text-content-muted/60 rounded-full border px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
              soon
            </span>
          </span>
        ) : (
          <Link
            key={t.key}
            href={t.href!}
            aria-current={t.key === active ? 'page' : undefined}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors',
              t.key === active
                ? 'border-lime text-content font-medium'
                : 'text-content-muted hover:text-content border-transparent',
            )}
          >
            {t.label}
          </Link>
        ),
      )}
    </nav>
  );
}
