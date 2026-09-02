/**
 * Server Actions for the 'hostels' module.
 *
 * WHAT THIS REPLACES
 *   The landlord property form used to call `saveProperty` from
 *   `lib/landlord-properties`, which wrote to **localStorage**. A landlord who
 *   added a hostel on their phone had a hostel that existed on that phone: not
 *   on their laptop, not to a student searching, and not to the reviewer whose
 *   job is to go and confirm it is real. It looked like a working feature,
 *   which is the worst kind of broken.
 *
 * A NEW LISTING IS NEVER BORN VERIFIED
 *   `verified` is not writable here and is not in the insert. It is set by the
 *   agent visit flow after somebody has stood in the building   see
 *   verification_visits. A landlord who could tick their own box would make the
 *   badge worthless, which is the one thing the badge cannot survive.
 *
 * NAIRA IN, KOBO STORED
 *   The form collects naira because that is what a person types. Money is
 *   stored in kobo, because money in floats is how money goes missing.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { userMessage } from '@/lib/errors';
import { getCurrentUser } from '@/modules/auth/queries';

const hostelSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, 'Give the property a name'),
  address: z.string().trim().min(4, 'Enter the address'),
  area: z.string().trim().min(2, 'Enter the area').optional(),
  /** Naira. Converted to kobo below. */
  price: z.number().int().nonnegative('Price cannot be negative'),
  roomType: z.string().trim().min(2).optional(),
  amenities: z.array(z.string().trim()).default([]),
  description: z.string().trim().optional(),
});

export type HostelInput = z.input<typeof hostelSchema>;
export type HostelResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Create or update one of the caller's own hostels.
 *
 * OWNERSHIP IS CHECKED IN THE UPDATE ITSELF   `.eq('landlord_id', user.id)`
 * alongside the id, so an edit aimed at somebody else's listing matches no row
 * rather than being refused after the fact. RLS says the same thing again
 * underneath; this is the half that makes the intent readable.
 */
export async function saveHostel(input: HostelInput): Promise<HostelResult> {
  const parsed = hostelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check those details' };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Sign in first.' };

  const v = parsed.data;
  const db = await createClient();

  const payload = {
    name: v.name,
    address: v.address,
    area: v.area ?? v.address,
    room_type: v.roomType ?? 'Single room',
    amenities: v.amenities,
    price_per_session_kobo: v.price * 100,
  };

  if (v.id) {
    const { data, error } = await db
      .from('hostels')
      .update(payload)
      .eq('id', v.id)
      .eq('landlord_id', user.id)
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, error: userMessage(error, 'We could not save that listing.') };
    if (!data) return { ok: false, error: 'That listing is not yours to edit.' };

    revalidatePath('/landlord/properties');
    return { ok: true, id: data.id as string };
  }

  const { data, error } = await db
    .from('hostels')
    .insert({
      ...payload,
      landlord_id: user.id,
      // Derived from the name, and unique-checked by the database rather than
      // here: two landlords naming a hostel the same thing is ordinary, and a
      // race between two inserts is not something a client can win.
      slug: `${v.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}-${Date.now().toString(36)}`,
      campus: '',
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: userMessage(error, 'We could not save that listing.') };
  if (!data) return { ok: false, error: 'We could not save that listing.' };

  revalidatePath('/landlord/properties');
  return { ok: true, id: data.id as string };
}

/**
 * Take a listing down.
 *
 * ARCHIVED, NOT DELETED. Bookings, reviews and visits point at it, and a
 * hostel that vanishes takes somebody's booking history with it.
 */
export async function archiveHostel(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Sign in first.' };

  const db = await createClient();
  const { error } = await db
    .from('hostels')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('landlord_id', user.id);

  if (error) return { ok: false, error: userMessage(error, 'We could not remove that listing.') };
  revalidatePath('/landlord/properties');
  return { ok: true };
}
