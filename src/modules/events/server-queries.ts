/**
 * Server-side data fetching for the 'events' module.
 * Called from RSC pages. Uses the server Supabase client.
 * RLS is the real authorization layer - these queries return only what the
 * caller is allowed to see (events are publicly readable).
 *
 * Every function degrades to an empty result rather than throwing: these render
 * public pages, and a Supabase outage should show "no events" and not a 500.
 */
import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

/** An event as the /around carousel and the events list need it. */
export interface EventCard {
  id: string;
  name: string;
  slug: string;
  venue: string | null;
  startsAt: string;
  /** Valid tickets sold. 0 until anyone buys - never a placeholder. */
  goingCount: number;
}

/**
 * Upcoming events, soonest first.
 *
 * Past events are excluded server-side rather than filtered in the component:
 * "what's on" is a forward-looking question and shipping yesterday's rows to
 * the client just to hide them wastes the payload.
 */
export const listUpcomingEvents = cache(async (limit = 6): Promise<EventCard[]> => {
  if (!configured) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('events')
      .select('id, name, slug, venue, starts_at, tickets(count)')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(limit);

    if (error || !data) return [];

    return data.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      venue: r.venue,
      startsAt: r.starts_at,
      // PostgREST returns an aggregate embed as [{ count: n }]; absent when
      // no tickets exist, which is the 0 case rather than an error.
      goingCount:
        (Array.isArray(r.tickets) ? (r.tickets[0] as { count?: number } | undefined)?.count : 0) ??
        0,
    }));
  } catch {
    return [];
  }
});

/**
 * How many students hold a valid ticket for an event starting today.
 *
 * Powers the "240 students going tonight" stat, which was a hardcoded mock.
 * Returns 0 when nothing is on - an honest zero, not a placeholder.
 */
export const countGoingTonight = cache(async (): Promise<number> => {
  if (!configured) return 0;

  try {
    const supabase = await createClient();

    // "Tonight" = the rest of the current day in server time. Good enough for a
    // single-campus product in one timezone.
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id')
      .gte('starts_at', now.toISOString())
      .lte('starts_at', endOfDay.toISOString());

    if (eventsError || !events || events.length === 0) return 0;

    const { count, error } = await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'valid')
      .in(
        'event_id',
        events.map((e) => e.id),
      );

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
});
