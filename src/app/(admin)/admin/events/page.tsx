/**
 * ROUTE: /admin/events
 * ACCESS: staff granted the `events` area.
 * PURPOSE: What is being listed on campus, and who is running it.
 *
 * EVENTS, NOT EVENT MANAGERS — FOR NOW
 *   The account type does not exist yet: `events.organizer_id` points at
 *   `profiles`, and there is no 'event manager' role for that profile to have,
 *   so an organiser today is whoever created the row. Listing the EVENTS is
 *   the honest version of this screen until the role ships; when it does, this
 *   is where the roster of organisers belongs, beside their events.
 *
 * SPLIT BY WHEN, NOT BY STATUS
 *   Events have no verification status to filter on — they are content, not
 *   accounts. What staff actually need to separate is what is still to come
 *   from what has already happened, because only the first kind can still be
 *   fixed, pulled, or go wrong in public.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { AccountTabs } from '@/components/admin/account-tabs';
import type { Row } from '@/lib/supabase/row';

export const metadata: Metadata = { title: 'Events — Admin' };

interface AdminEvent {
  id: string;
  name: string;
  slug: string;
  venue: string | null;
  category: string | null;
  startsAt: string;
  organiserName: string | null;
  upcoming: boolean;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Fetching and shaping, deliberately OUTSIDE the component.
 *
 * "Is this event still to come" is a comparison against the clock, and reading
 * the clock during a render is impure — the React Compiler says so, and it is
 * right in principle even though a server component renders once per request.
 * Keeping the time-dependent work in a plain async function makes the page
 * itself a pure function of what it is handed, which is the shape every other
 * admin page here already has.
 */
async function loadEvents(): Promise<AdminEvent[]> {
  const admin = createAdminClient();

  const { data: eventRows } = await admin
    .from('events')
    .select('id, name, slug, venue, category, starts_at, organizer_id')
    .order('starts_at', { ascending: false });

  const events = (eventRows ?? []) as Row[];
  if (events.length === 0) return [];

  // One query for every organiser rather than one per event. `organizer_id` is
  // nullable — a seeded event has none — so the nulls are stripped before the
  // `.in()`, which PostgREST would otherwise answer with everything.
  const organiserIds = [...new Set(events.map((e) => e.organizer_id).filter(Boolean))] as string[];
  const organiserName = new Map<string, string>();
  if (organiserIds.length) {
    const { data: people } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', organiserIds);
    for (const p of (people ?? []) as Row[]) {
      organiserName.set(p.id as string, (p.full_name as string) ?? 'No name set');
    }
  }

  const now = Date.now();
  return events.map((e) => ({
    id: e.id as string,
    name: (e.name as string) ?? 'Untitled event',
    slug: e.slug as string,
    venue: (e.venue as string) ?? null,
    category: (e.category as string) ?? null,
    startsAt: e.starts_at as string,
    organiserName: e.organizer_id ? (organiserName.get(e.organizer_id as string) ?? null) : null,
    upcoming: new Date(e.starts_at as string).getTime() >= now,
  }));
}

export default async function Page() {
  await requireStaffArea('events');

  const rows = await loadEvents();
  const upcoming = rows.filter((r) => r.upcoming);
  const past = rows.filter((r) => !r.upcoming);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / ACCOUNTS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          What&rsquo;s <span className="text-lime-deep">on.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          {rows.length === 0
            ? 'No events have been listed yet.'
            : `${upcoming.length} still to come, ${past.length} already past.`}
        </p>
      </div>

      <AccountTabs active="events" />

      {rows.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          Nothing here yet. Events appear as soon as somebody lists one — the public page at /events
          reads the same table.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <EventGroup
            title="Still to come"
            blurb="These can still be changed or pulled."
            rows={upcoming}
          />
          <EventGroup title="Already past" blurb="Kept for the record." rows={past} />
        </div>
      )}
    </section>
  );
}

function EventGroup({ title, blurb, rows }: { title: string; blurb: string; rows: AdminEvent[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-content text-sm font-medium">
          {title} <span className="text-content-muted font-normal">· {rows.length}</span>
        </h3>
        <p className="text-content-muted text-xs">{blurb}</p>
      </div>

      <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
        {rows.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-content text-sm font-medium">{e.name}</p>
              <p className="text-content-muted text-xs">
                {formatWhen(e.startsAt)}
                {e.venue ? ` · ${e.venue}` : ''}
                {e.category ? ` · ${e.category}` : ''}
                {' · '}
                {/* Named plainly when unknown rather than left blank: a seeded
                    event with no organiser is a real state, and an empty gap
                    reads as a bug. */}
                {e.organiserName ?? 'no organiser on record'}
              </p>
            </div>
            {/* Opens the public page — there is no admin detail screen for an
                event yet, and the page the students see is the thing staff
                actually need to check. */}
            <a
              href={`/events/${e.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-content-muted hover:text-content shrink-0 text-xs underline"
            >
              View
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
