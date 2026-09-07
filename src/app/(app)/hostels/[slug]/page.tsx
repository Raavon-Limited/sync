/**
 * ROUTE: /hostels/[slug]
 * ACCESS: public.
 * PURPOSE: Keeps every existing hostel link working, and sends it to the one
 *          detail view the product actually maintains.
 *
 * THERE WERE TWO HOSTEL DETAIL SCREENS SHOWING THE SAME BUILDING DIFFERENTLY.
 *   This route rendered its own `HostelDetail`, and `/hostels` rendered another
 *   inline. They drifted: the maintained one grew the commission split
 *   (`fee_mode` - absorbed by the landlord or passed to the student), the map,
 *   the gallery, the real verified badge and the live hold countdown. This one
 *   had none of it, and it is the one the landing page and /around have always
 *   linked to   so the version most visitors saw was the wrong one, quoting a
 *   price that did not say who pays Sync's fee.
 *
 * WHY A REDIRECT AND NOT A SHARED COMPONENT
 *   The maintained detail is not a component: it is ~500 lines rendered inline
 *   inside a 1300-line client page, sharing state with the grid behind it
 *   (filters, the booking row, the hold countdown). Lifting it out is the right
 *   end state and is NOT a safe change to make in the same pass as fixing the
 *   inconsistency   it would touch every one of those branches at once.
 *
 *   So the URL is preserved and the duplicate is retired. `/hostels?h=<slug>`
 *   opens that hostel's detail directly; see the deep-link effect in
 *   ../page.tsx. Nothing that links here breaks, and there is now exactly one
 *   screen describing a hostel.
 *
 * WHAT THIS COSTS, stated so it is a decision and not an accident: a redirect
 * renders no page, so the per-hostel <title> this route used to generate is
 * gone. Restore it by extracting the detail into a shared component and
 * rendering it here   at which point this file goes back to being a real page.
 */
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  redirect(`/hostels?h=${encodeURIComponent(slug)}`);
}
