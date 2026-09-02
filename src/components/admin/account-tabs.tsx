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
 *   guessed from the pathname   /admin/vendors serves five different tabs and
 *   the pathname cannot tell them apart.
 *
 * IT SHOWS ONLY WHAT THE VIEWER CAN OPEN
 *   The tabs span three access areas, and a reviewer granted `riders` alone
 *   should not be offered Landlords. Resolved from the same `visibleAreas` the
 *   sidebar uses, so the two cannot disagree.
 *
 * 'SOON' TABS ARE NOT LINKS, AND THEY COME LAST
 *   They are the surfaces the product has but the console does not review yet.
 *   Rendering them as dead text rather than links is the point: a tab that
 *   navigates to an empty screen is worse than one that admits it is not built.
 *
 *   Everything live is listed first and the 'soon' tabs trail it, so the row
 *   never puts a dead tab between two working ones. Anything added later goes
 *   in the same order.
 */
import Link from 'next/link';
import { visibleAreas } from '@/modules/access/guard';
import { cn } from '@/lib/utils';

export type AccountTabKey =
  | 'all'
  | 'vendors'
  | 'food'
  | 'landlords'
  | 'riders'
  | 'students'
  | 'events'
  | 'beauty'
  | 'laundry'
  | 'tradesman';

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
 * 'landlord'   a landlord IS a vendor_profiles row with that category, but it
 * is reviewed on its own screen because it has properties to show and the
 * business queue has no column for them.
 */
const TABS: TabSpec[] = [
  // 'All' is every account with a verification state, not every business
  // see modules/admin/accounts. The tabs after it are the same list narrowed,
  // which is why this one is first and why it is not called anything narrower.
  // "All" means all   every role, with the role named and that role's own
  // verification resolved from whichever table is the authority for it. It used
  // to point at the vendor queue, which was the businesses list wearing the
  // word: students outnumber every other role and were not in it.
  { key: 'all', label: 'All', href: '/admin/accounts', area: 'users' },
  // The business queue keeps its own entry. Dropping it would leave a vendor
  // with no category unreachable, since the per-trade tabs are still to come.
  { key: 'vendors', label: 'Businesses', href: '/admin/vendors', area: 'vendors' },
  { key: 'food', label: 'Food', href: '/admin/vendors?category=food', area: 'vendors' },
  { key: 'landlords', label: 'Landlords', href: '/admin/landlord', area: 'landlords' },
  { key: 'riders', label: 'Riders', href: '/admin/riders', area: 'riders' },
  { key: 'students', label: 'Students', href: '/admin/students', area: 'students' },
  { key: 'events', label: 'Events', href: '/admin/events', area: 'events' },
  // EVERY LIVE TAB COMES FIRST, and the not-yet ones go last   the same order
  // /signup uses for its role cards.
  //
  // A dead tab sitting between two live ones breaks the scan: the eye stops on
  // the greyed-out label and reads the rest of the row as unavailable too. At
  // the end, the bar reads as "here is what you can review, and here is what is
  // coming" rather than as a row with holes in it.
  //
  // The category filter behind the trade tabs works and the rows would load
  // which is exactly why they are marked rather than quietly left live. A tab
  // that opens an empty, correct-looking queue for a trade nobody can sign up
  // for reads as "no beauty vendors have applied", which is a different and
  // wrong statement from "beauty is not open yet".
  { key: 'beauty', label: 'Beauty', soon: true },
  { key: 'laundry', label: 'Laundry', soon: true },
  { key: 'tradesman', label: 'Workmanship', soon: true },
  // The account type does not exist yet   /signup lists it as "Not yet" for the
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
      // Scrolls rather than wraps: ten tabs on a laptop is one row, and on a
      // narrow window a wrapped tab bar pushes the list itself below the fold.
      //
      // `no-scrollbar` because the bar under a tab row reads as a second,
      // uglier underline running the width of the page   and it sat directly
      // on top of the 2px lime rule that marks the active tab, which is the one
      // piece of state this row has to show. It still swipes, wheels and
      // keyboards to scroll.
      className="no-scrollbar border-line/10 -mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-px"
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
