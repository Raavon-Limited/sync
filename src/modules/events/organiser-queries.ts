/**
 * What an organiser sees about their own events.
 *
 * READ AS THE ORGANISER, not the service role: `events_select_all` makes their
 * own rows readable anyway, and running as them means a bug here shows up as
 * missing data rather than as somebody else's event on their dashboard.
 *
 * SALES COME FROM `tickets`, NOT FROM `event_ticket_tiers.sold`
 *   That column is maintained by the purchase path and is the right thing for
 *   a stock check — "are there any left". It is the wrong thing for a money
 *   figure, because it counts rows rather than what was paid, and a tier whose
 *   price changed would report the wrong total. The tickets themselves carry
 *   `price_kobo` as sold.
 */
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/supabase/row';

export interface OrganiserEvent {
  id: string;
  name: string;
  slug: string;
  venue: string | null;
  category: string | null;
  description: string | null;
  coverUrl: string | null;
  startsAt: string;
  upcoming: boolean;
  /** Tickets issued, and what they were paid for, in kobo. */
  ticketsSold: number;
  grossKobo: number;
}

export interface TicketTier {
  id: string;
  name: string;
  description: string | null;
  priceKobo: number;
  quantity: number | null;
  sold: number;
  isActive: boolean;
}

/** Every event this organiser has listed, newest first. */
export async function getMyEvents(): Promise<OrganiserEvent[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: eventRows } = await supabase
    .from('events')
    .select('id, name, slug, venue, category, description, cover_url, starts_at')
    .eq('organizer_id', user.id)
    .order('starts_at', { ascending: false });

  const events = (eventRows ?? []) as Row[];
  if (events.length === 0) return [];

  const ids = events.map((e) => e.id as string);
  const { data: ticketRows } = await supabase
    .from('tickets')
    .select('event_id, price_kobo, status')
    .in('event_id', ids);

  const sales = new Map<string, { count: number; gross: number }>();
  for (const t of (ticketRows ?? []) as Row[]) {
    // A cancelled ticket is not a sale. Counting it would overstate both the
    // number and the money, and the money is the number people act on.
    if (t.status === 'cancelled' || t.status === 'refunded') continue;
    const id = t.event_id as string;
    const tally = sales.get(id) ?? { count: 0, gross: 0 };
    tally.count++;
    tally.gross += (t.price_kobo as number) ?? 0;
    sales.set(id, tally);
  }

  const now = Date.now();
  return events.map((e) => {
    const tally = sales.get(e.id as string) ?? { count: 0, gross: 0 };
    return {
      id: e.id as string,
      name: (e.name as string) ?? 'Untitled event',
      slug: e.slug as string,
      venue: (e.venue as string) ?? null,
      category: (e.category as string) ?? null,
      description: (e.description as string) ?? null,
      coverUrl: (e.cover_url as string) ?? null,
      startsAt: e.starts_at as string,
      upcoming: new Date(e.starts_at as string).getTime() >= now,
      ticketsSold: tally.count,
      grossKobo: tally.gross,
    };
  });
}

/** One event of theirs, or null when it is not theirs. */
export async function getMyEvent(id: string): Promise<OrganiserEvent | null> {
  const all = await getMyEvents();
  return all.find((e) => e.id === id) ?? null;
}

export async function getTiers(eventId: string): Promise<TicketTier[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('event_ticket_tiers')
    .select('id, name, description, price_kobo, quantity, sold, is_active')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });

  return ((data ?? []) as Row[]).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    description: (t.description as string) ?? null,
    priceKobo: (t.price_kobo as number) ?? 0,
    quantity: (t.quantity as number) ?? null,
    sold: (t.sold as number) ?? 0,
    isActive: t.is_active === true,
  }));
}
