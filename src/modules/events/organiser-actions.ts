/**
 * Server Actions for the people who run events.
 *
 * THEY RUN AS THE ORGANISER, NOT AS THE SERVICE ROLE
 *   Every function here uses the ordinary server client, so the policies added
 *   in 20260903150000 are what decide. That is deliberate and it is the
 *   difference from modules/admin: admin work is cross-tenant and has to
 *   bypass RLS, whereas an organiser only ever touches their own rows — so the
 *   database can enforce it and this file does not have to be trusted to.
 *
 *   The practical consequence: an organiser editing somebody else's event does
 *   not get an error message from here, it gets zero rows updated. Each
 *   function checks for that rather than reporting success.
 *
 * THE SLUG IS DERIVED, AND IT IS NOT ALLOWED TO COLLIDE
 *   `events.slug` is unique and is what /events/[slug] resolves. Two parties
 *   called "Rep Night" in one term is not a strange case, so a suffix is added
 *   rather than the second one failing on a constraint the organiser cannot
 *   see.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { userMessage } from '@/lib/errors';
import type { Row } from '@/lib/supabase/row';

export type EventResult = { ok: true; slug: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

const eventSchema = z.object({
  name: z.string().trim().min(3, 'Give the event a name').max(120, 'That name is too long'),
  description: z.string().trim().max(4000).optional(),
  venue: z.string().trim().max(200).optional(),
  category: z.string().trim().max(60).optional(),
  /** datetime-local gives "2026-09-04T19:30" with no zone; the browser's zone is meant. */
  startsAt: z.string().min(1, 'Say when it starts'),
  coverUrl: z.string().trim().url('That cover link is not a URL').optional().or(z.literal('')),
});

export type EventInput = z.infer<typeof eventSchema>;

/** Lowercase, hyphenated, no runs of punctuation. Matches what /events expects. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event'
  );
}

export async function createEvent(input: EventInput): Promise<EventResult> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to list an event.' };

  const base = slugify(parsed.data.name);

  // Read the neighbours once and pick a free suffix, rather than inserting and
  // retrying on a unique violation — a retry loop against a policy-guarded
  // table is hard to reason about and this list is tiny.
  const { data: taken } = await supabase.from('events').select('slug').like('slug', `${base}%`);
  const used = new Set(((taken ?? []) as Row[]).map((r) => r.slug as string));
  let slug = base;
  for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;

  const { error } = await supabase.from('events').insert({
    name: parsed.data.name,
    slug,
    description: parsed.data.description || null,
    venue: parsed.data.venue || null,
    category: parsed.data.category || null,
    starts_at: new Date(parsed.data.startsAt).toISOString(),
    cover_url: parsed.data.coverUrl || null,
    organizer_id: user.id,
  });

  if (error) {
    return { ok: false, error: userMessage(error, 'We could not list that event.') };
  }

  revalidatePath('/organiser');
  revalidatePath('/events');
  return { ok: true, slug };
}

export async function updateEvent(id: string, input: EventInput): Promise<EventResult> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('events')
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      venue: parsed.data.venue || null,
      category: parsed.data.category || null,
      starts_at: new Date(parsed.data.startsAt).toISOString(),
      cover_url: parsed.data.coverUrl || null,
    })
    .eq('id', id)
    .select('slug');

  if (error) return { ok: false, error: userMessage(error, 'We could not save that.') };

  // Zero rows means the policy refused it, not that nothing changed. Reported
  // as a refusal, because "saved" over a no-op is the worst possible answer.
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return { ok: false, error: 'That event is not yours to edit.' };

  revalidatePath('/organiser');
  revalidatePath('/events');
  return { ok: true, slug: rows[0].slug as string };
}

/**
 * Who bears Sync's 5%.
 *
 *   absorb   the buyer pays the ticket price and it comes out of takings
 *   pass_on  it is added to the buyer's total and the organiser keeps the face
 *            value
 *
 * The database is the one that applies it, at purchase, from
 * `events.fee_mode` — nothing here computes a price. Changing the mode affects
 * FUTURE purchases only: the charge is frozen onto each hold when it is made,
 * so tickets already sold keep the deal they were sold under.
 */
export async function setEventFeeMode(
  eventId: string,
  mode: 'absorb' | 'pass_on',
): Promise<SimpleResult> {
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;

  const { error } = await rpc('set_event_fee_mode', { p_event: eventId, p_mode: mode });
  if (error) return { ok: false, error: userMessage(error, 'We could not change that.') };

  revalidatePath('/organiser');
  return { ok: true };
}

const tierSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1, 'Name the tier').max(60),
  /** Naira in the form; kobo in the column. Integers only — no fractional kobo. */
  priceNaira: z.coerce.number().int('Whole naira only').min(0, 'A price cannot be negative'),
  quantity: z.coerce.number().int().min(1, 'At least one').optional(),
  description: z.string().trim().max(300).optional(),
});

export async function addTicketTier(input: z.input<typeof tierSchema>): Promise<SimpleResult> {
  const parsed = tierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the tier' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('event_ticket_tiers').insert({
    event_id: parsed.data.eventId,
    name: parsed.data.name,
    price_kobo: parsed.data.priceNaira * 100,
    quantity: parsed.data.quantity ?? null,
    description: parsed.data.description || null,
    // `sold` is never sent. purchase_tickets maintains it, and an organiser
    // writing it would be writing their own sales figures.
  });

  if (error) return { ok: false, error: userMessage(error, 'We could not add that tier.') };

  revalidatePath('/organiser');
  return { ok: true };
}

/**
 * Take a tier off sale. It is not deleted: tickets already sold reference it,
 * and the sales history has to keep meaning something after the tier closes.
 */
export async function setTierActive(id: string, active: boolean): Promise<SimpleResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('event_ticket_tiers')
    .update({ is_active: active })
    .eq('id', id)
    .select('id');

  if (error) return { ok: false, error: userMessage(error, 'We could not change that.') };
  if (((data ?? []) as Row[]).length === 0) {
    return { ok: false, error: 'That tier is not yours to change.' };
  }

  revalidatePath('/organiser');
  return { ok: true };
}
