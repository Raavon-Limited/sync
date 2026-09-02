/**
 * ROUTE: /admin/events
 * ACCESS: staff granted the `events` area.
 * PURPOSE: The people who run events - are they real, and what have they listed.
 *
 * IT IS AN ACCOUNTS SCREEN, NOT AN EVENTS FEED
 *   This sits in the Accounts tab strip beside Landlords, Riders and Students,
 *   and it answers the same question they do: is this account real and should
 *   it be trading. The first cut listed EVENTS, which made the tab mean
 *   something different from every tab next to it and buried the thing staff
 *   actually decide.
 *
 *   An organiser needs a verified profile before their events are worth
 *   showing, which is the whole reason this is the account and not the content.
 *   What they have listed hangs off the row as a count, because "verified, and
 *   running four things" is the sentence a reviewer needs.
 *
 * THE ROLE IS NOT OPEN YET, AND THIS DOES NOT PRETEND OTHERWISE
 *   'event_manager' shows on /signup as "Not yet", so no account holds it. The
 *   screen is built and the empty state says exactly that rather than implying
 *   nobody has applied. It also picks up anyone already sitting on
 *   `events.organizer_id` - seeded rows, or anything created before the role
 *   opens - so an organiser who exists by another route is never invisible.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { selfieUrlsFor } from '@/modules/admin/selfies';
import { AccountTabs } from '@/components/admin/account-tabs';
import { OrganisersBrowser, type OrganiserRow } from './(components)/organisers-browser';
import type { Row } from '@/lib/supabase/row';

export const metadata: Metadata = { title: 'Event organisers - Admin' };

/**
 * Fetching and shaping, outside the component: "still to come" is a comparison
 * against the clock, and reading the clock during a render is impure.
 */
async function loadOrganisers(): Promise<OrganiserRow[]> {
  const admin = createAdminClient();

  const [{ data: eventRows }, { data: byRole }] = await Promise.all([
    admin.from('events').select('organizer_id, starts_at'),
    admin
      .from('profiles')
      .select('id')
      .in('role', ['event_manager', 'creator'])
      .is('archived_at', null),
  ]);

  const events = (eventRows ?? []) as Row[];

  const now = Date.now();
  const listed = new Map<string, { total: number; upcoming: number }>();
  for (const e of events) {
    const id = e.organizer_id as string | null;
    if (!id) continue;
    const tally = listed.get(id) ?? { total: 0, upcoming: 0 };
    tally.total++;
    if (new Date(e.starts_at as string).getTime() >= now) tally.upcoming++;
    listed.set(id, tally);
  }

  // The union: everyone holding the role, plus anyone who has listed an event
  // without it. The second set is empty in a clean database, and is exactly the
  // set that would otherwise go unreviewed.
  const ids = [
    ...new Set([...((byRole ?? []) as Row[]).map((p) => p.id as string), ...listed.keys()]),
  ];
  if (ids.length === 0) return [];

  // The face for the card, in one round trip for the whole page - the same
  // reason every other account list does it that way.
  const [{ data: people }, selfieByOwner, { data: authList }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, role, verification_status, suspended_at')
      .in('id', ids),
    selfieUrlsFor(ids),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emailById = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? '-']));

  return ((people ?? []) as Row[])
    .map((p) => {
      const tally = listed.get(p.id as string) ?? { total: 0, upcoming: 0 };
      return {
        id: p.id as string,
        name: (p.full_name as string) ?? 'No name set',
        email: emailById.get(p.id as string) ?? '-',
        verificationStatus: (p.verification_status as string) ?? 'unverified',
        role: (p.role as string) ?? 'event_manager',
        listed: tally.total,
        upcoming: tally.upcoming,
        suspended: Boolean(p.suspended_at),
        selfieUrl: selfieByOwner.get(p.id as string),
      };
    })
    .sort((a, b) => b.listed - a.listed);
}

export default async function Page() {
  await requireStaffArea('events');

  const rows = await loadOrganisers();
  const waiting = rows.filter((r) => r.verificationStatus === 'pending').length;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / ACCOUNTS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Who runs the <span className="text-lime-deep">events.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          {rows.length === 0
            ? 'No event organiser accounts yet.'
            : `${rows.length} ${rows.length === 1 ? 'organiser' : 'organisers'}${
                waiting > 0 ? `, ${waiting} waiting on a decision` : ''
              }. Open one to review what they have uploaded.`}
        </p>
      </div>

      <AccountTabs active="events" />

      <OrganisersBrowser rows={rows} />
    </section>
  );
}
