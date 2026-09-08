/**
 * ROUTE: /user  (and /<handle>, via the proxy rewrite)
 * ACCESS: authenticated student
 * PURPOSE: The overview. One section per part of their life on Sync.
 *
 * THE PAGE SAID THE SAME THING TWICE, TWICE.
 *   - The billboard showed "ACTIVE BOOKING · Crescent villa 2 · Room 4", and MY
 *     BOOKINGS directly beneath it showed the same room again, from the same
 *     query. A student rents ONE apartment, so a list of one under a feature
 *     card of the same one is a list with nothing to list.
 *   - "SAVED HOSTELS" and "RECENTLY LISTED" both rendered HostelCardListLive,
 *     which queries the public catalogue - so they were the same three listings
 *     under two headings, and neither was saved or notably recent.
 *
 *   Both are gone. The apartment is the billboard; saved hostels are actually
 *   saved hostels; browsing lives on /hostels, which is a whole screen built
 *   for it and is one tap away in the nav.
 *
 * SECTIONS ARE BY SUBJECT, and each one hides itself when it is empty.
 *   Somewhere to live · Saved hostels · Events and tickets · Recent activity.
 *   A new student sees the first two and nothing else, rather than five
 *   headings over five empty states.
 *
 * NOTHING ON THIS PAGE IS INVENTED ANY MORE. The recent-activity list was four
 * hardcoded lines naming a person and a property that exist in nobody's data,
 * and the saved count was the literal constant 12.
 */
import type { Metadata } from 'next';
import { BookingBillboard } from './(components)/BillboardComponent';
import { UsageSummary } from './(components)/UsageSummary';
import { SavedHostels } from './(components)/SavedHostels';
import { RecentActivity } from './(components)/RecentActivity';
import { EventsTicketsSummary } from './(components)/EventsTickets';
import { getDashboardProfile } from '@/components/layouts/dashboard-profile';
import { VerifyReminder } from './(components)/VerifyReminder';
import { getMyStudentIdentity } from '@/modules/students';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function Page() {
  const [profile, identity] = await Promise.all([
    getDashboardProfile('student'),
    // NOT profile.verificationStatus. That column is the MIRROR of
    // vendor_profiles, so a student who also lets a room reads back the
    // decision made about the business   which is how a student verified by an
    // admin was still being told on this page to go and get verified.
    // student_profiles is the authority for the student half; /user/verify has
    // read it correctly since 20260903180000 and this page had not caught up.
    getMyStudentIdentity(),
  ]);
  const studentName = profile.name;
  const base = profile.handle ? `/${profile.handle}` : '/user';

  return (
    <section className="flex flex-col gap-8">
      <div>
        <p className="text-content-muted font-mono text-sm tracking-wide">WELCOME BACK</p>
        <h1 className="font-display mt-1 text-3xl">
          Hi <span className="text-lime-deep">{studentName}</span> - here&apos;s your spot.
        </h1>
      </div>

      {/* Above everything, and it renders nothing once verified. Signup does
          not collect documents, so without this a student never finds out
          there is a step left   see /user/verify. */}
      <VerifyReminder status={identity.verificationStatus} />

      <UsageSummary />

      {/* ── Somewhere to live ──────────────────────────────────────────────
          The apartment they have, then the ones they are considering. Both
          hostel-shaped, so they sit together and nothing else comes between
          them. */}
      <section className="flex flex-col gap-8">
        <BookingBillboard basePath={base} />
        <SavedHostels basePath={base} />
      </section>

      {/* ── Everything else they have bought ───────────────────────────────
          Renders nothing at all until there is a ticket or an event worth
          showing, rather than two headings over two empty states. */}
      <EventsTicketsSummary basePath={base} />

      {/* ── What has happened ──────────────────────────────────────────────
          Real notifications, and absent entirely on a new account. */}
      <RecentActivity basePath={base} />
    </section>
  );
}
