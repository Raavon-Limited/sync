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

export interface EventPayout {
  /** Held, not yours yet. Releases 24h after the event unless disputed. */
  heldKobo: number;
  /** Already paid into the wallet, net of the Sync charge. */
  paidKobo: number;
  /** The Sync charge frozen onto holds that have not released yet. */
  feeKobo: number;
  /** Blocked by an open dispute rather than simply not due. */
  disputed: boolean;
  /** When the earliest held amount is due, if any. */
  nextReleaseAt: string | null;
}

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
  /** 'absorb' | 'pass_on' — who bears Sync's 5%. See setEventFeeMode. */
  feeMode: string;
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
    .select('id, name, slug, venue, category, description, cover_url, starts_at, fee_mode')
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
      // Defaulted rather than assumed present: the column arrives in
      // 20260903230000 and this reads fine before it lands.
      feeMode: (e.fee_mode as string) ?? 'absorb',
      ticketsSold: tally.count,
      grossKobo: tally.gross,
    };
  });
}

/**
 * What an organiser is owed for one event, and when.
 *
 * READ FROM escrow_holds, NOT FROM TICKET PRICES. Gross ticket sales and money
 * an organiser will actually receive are different numbers - the Sync charge is
 * frozen onto each hold at purchase - and showing the first while calling it
 * the second is how somebody plans around money that is not coming.
 *
 * Returns zeros when the escrow migration has not been applied, so the
 * dashboard renders instead of failing on a column that is not there yet.
 */
export async function getEventPayout(eventId: string): Promise<EventPayout> {
  const empty: EventPayout = {
    heldKobo: 0,
    paidKobo: 0,
    feeKobo: 0,
    disputed: false,
    nextReleaseAt: null,
  };

  const supabase = await createClient();
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const [holdsRes, disputesRes] = await Promise.all([
    db
      .from('escrow_holds')
      .select('amount_kobo, commission_kobo, status, release_after')
      .eq('event_id', eventId),
    db.from('disputes').select('resolved_at').eq('event_id', eventId),
  ]);

  if (holdsRes.error) return empty;

  const holds = (holdsRes.data ?? []) as Row[];
  let held = 0;
  let paid = 0;
  let fee = 0;
  let next: string | null = null;

  for (const h of holds) {
    const amount = (h.amount_kobo as number) ?? 0;
    const commission = (h.commission_kobo as number) ?? 0;
    if (h.status === 'held') {
      held += amount - commission;
      fee += commission;
      const due = h.release_after as string | null;
      if (due && (next === null || new Date(due) < new Date(next))) next = due;
    } else if (h.status === 'released') {
      paid += amount - commission;
    }
  }

  const disputes = (disputesRes.error ? [] : ((disputesRes.data ?? []) as Row[])).filter(
    (d) => d.resolved_at === null,
  );

  return {
    heldKobo: held,
    paidKobo: paid,
    feeKobo: fee,
    disputed: disputes.length > 0,
    nextReleaseAt: next,
  };
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
