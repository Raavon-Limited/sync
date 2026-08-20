/**
 * Data access for the 'events' module. Backs /events, /events/[slug] and
 * /events/[slug]/tickets.
 *
 * SCHEMA NOTE
 * `public.events` (0006) is deliberately minimal — id, organizer, name, slug,
 * venue, geo, starts_at. It has no description, cover image, price tiers or
 * capacity. The /events screens will need those; add them in a follow-up
 * migration rather than stuffing them into `tickets.tier`, which is a per-ticket
 * label and not a catalogue of what is on sale.
 *
 * Ticket issuance is NOT here. A ticket is money: it must be issued in the same
 * transaction as its payment, with a unique `reference`, which means an RPC
 * alongside `checkout_cart` rather than a client insert. `tickets` has no client
 * INSERT grant, so attempting it from here would fail — correctly.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { unwrapList, unwrapMaybe, toRange, type PageParams } from '@/lib/query/helpers';

/* eslint-disable @typescript-eslint/no-explicit-any -- see lib/query/helpers.ts */
type Row = any;
type Client = SupabaseClient<Database>;

export interface SyncEvent {
  id: string;
  organizerId: string | null;
  name: string;
  slug: string;
  venue: string | null;
  startsAt: string;
  createdAt: string;
}

export type TicketStatus = 'valid' | 'used' | 'refunded';

export interface Ticket {
  id: string;
  eventId: string;
  eventName?: string | null;
  eventVenue?: string | null;
  eventStartsAt?: string | null;
  ownerId: string;
  /** Unique, server-assigned. This is what the gate scans. */
  reference: string;
  tier: string | null;
  priceKobo: number;
  status: TicketStatus;
  usedAt: string | null;
  createdAt: string;
}

const toEvent = (r: Row): SyncEvent => ({
  id: r.id,
  organizerId: r.organizer_id,
  name: r.name,
  slug: r.slug,
  venue: r.venue,
  startsAt: r.starts_at,
  createdAt: r.created_at,
});

const toTicket = (r: Row): Ticket => ({
  id: r.id,
  eventId: r.event_id,
  eventName: r.event?.name ?? null,
  eventVenue: r.event?.venue ?? null,
  eventStartsAt: r.event?.starts_at ?? null,
  ownerId: r.owner_id,
  reference: r.reference,
  tier: r.tier,
  priceKobo: Number(r.price_kobo ?? 0),
  status: r.status,
  usedAt: r.used_at,
  createdAt: r.created_at,
});

export async function fetchEvents(
  db: Client,
  opts: { upcomingOnly?: boolean; search?: string } & PageParams = {},
): Promise<SyncEvent[]> {
  const [from, to] = toRange(opts);
  let q = db.from('events').select('*').order('starts_at', { ascending: true }).range(from, to);

  if (opts.upcomingOnly !== false) q = q.gte('starts_at', new Date().toISOString());
  if (opts.search) q = q.ilike('name', `%${opts.search}%`);

  return unwrapList<Row>(await q).map(toEvent);
}

export async function fetchEventBySlug(db: Client, slug: string): Promise<SyncEvent | null> {
  const r = unwrapMaybe<Row>(await db.from('events').select('*').eq('slug', slug).maybeSingle());
  return r ? toEvent(r) : null;
}

/** RLS scopes this to the caller — `tickets_select_own`. */
export async function fetchMyTickets(
  db: Client,
  opts: { status?: TicketStatus } & PageParams = {},
): Promise<Ticket[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('tickets')
    .select('*, event:events(name, venue, starts_at)')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (opts.status) q = q.eq('status', opts.status);

  return unwrapList<Row>(await q).map(toTicket);
}

export async function fetchTicket(db: Client, id: string): Promise<Ticket | null> {
  const r = unwrapMaybe<Row>(
    await db.from('tickets').select('*, event:events(name, venue, starts_at)').eq('id', id).maybeSingle(),
  );
  return r ? toTicket(r) : null;
}
