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
import { nearestArea } from '@/lib/constants/areas';
import { isOwnStorageUrl } from '@/lib/storage/public-url';
import { getCurrentUser } from '@/modules/auth/queries';

const hostelSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2, 'Give the property a name'),
    address: z.string().trim().min(4, 'Enter the address'),
    area: z.string().trim().min(2, 'Pick the area this property is in').optional(),
    /** Naira. Converted to kobo below. */
    price: z.number().int().nonnegative('Price cannot be negative'),
    roomType: z.string().trim().min(2).optional(),
    // NOT an enum. The six checkboxes are a shortcut for the common ones, and
    // a landlord with a borehole or a reading room can say so. Capped in count
    // and length so the field cannot be used as free storage.
    amenities: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
    houseRules: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
    /**
     * Already-uploaded public URLs, IN DISPLAY ORDER. The first is the primary
     * image: it is the one the card and every listing tile shows.
     *
     * The form uploads on selection, so by the time this runs these are real
     * objects in our bucket rather than files in flight   which is also what
     * makes editing work, since an existing listing's photos are already URLs.
     */
    imageUrls: z
      .array(
        z.object({
          url: z.string().url(),
          // 'video' rows render as a player rather than a tile. The column is
          // added by 20260908120000_listing_video and, until that lands, is
          // dropped on the way in by the pending-column retry below.
          kind: z.enum(['image', 'video']).default('image'),
        }),
      )
      .max(12)
      .default([]),
    description: z.string().trim().max(2000).optional(),
    /**
     * How many rooms this hostel has. The form has always collected and
     * validated this and it was never sent   so `hostel_rooms` stayed empty,
     * `hostel_availability` counted zero, and the listing reported "0/0 rooms"
     * and an availability of 'draft'. A hostel with no rooms cannot be booked
     * at all: a booking points at a ROOM.
     */
    roomsTotal: z.number().int().min(0).max(200).optional(),
    // The pin, when Google gave us one. Optional because a landlord whose
    // address Places cannot find must still be able to list.
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  // The database says the same thing (`(lat is null) = (lng is null)`), because
  // half a pin puts the property in the Atlantic. Saying it here too turns a
  // constraint violation into a sentence.
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), {
    message: 'That location did not resolve properly   pick the address again.',
    path: ['lat'],
  });

/** First spelling wins, so the landlord's own capitalisation survives. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * A landlord typing a list types the bullets too. Stripped once here rather
 * than in every renderer   the markers belong to the <ul>, not to the data.
 */
function stripBullet(rule: string): string {
  return rule.replace(/^\s*[-*\u2022]+\s*/, '').trim();
}

/**
 * Replace a hostel's media with exactly this list, in this order.
 *
 * DELETE-THEN-INSERT, NOT A DIFF
 *   The client sends the full ordered list, so the rows are a projection of it.
 *   Diffing would have to reason about a photo that moved from third to first
 *   AND was also removed from the end, and get `position` right for both; this
 *   cannot get it wrong. A row holds a url, an index and a kind   there is no
 *   per-row state worth preserving.
 *
 * POSITION 0 IS THE PRIMARY IMAGE. `hostel_images_hostel_idx` is on
 * (hostel_id, position), so "the first photo" is an ordered read, not a guess.
 */
async function replaceImages(
  db: Awaited<ReturnType<typeof createClient>>,
  hostelId: string,
  media: { url: string; kind: 'image' | 'video' }[],
): Promise<void> {
  const { error: clearError } = await db.from('hostel_images').delete().eq('hostel_id', hostelId);
  if (clearError) throw clearError;

  if (media.length === 0) return;

  const rows = media.map((m, index) => ({
    hostel_id: hostelId,
    url: m.url,
    position: index,
    kind: m.kind,
  }));

  const { error } = await db.from('hostel_images').insert(rows);
  if (error) throw error;
}

/**
 * Make the hostel have exactly `desired` rooms, without destroying history.
 *
 * ADDING IS FREE, REMOVING IS NOT
 *   A booking points at a room. Deleting a room somebody has booked would take
 *   their booking with it (or be refused by the FK, depending on which room),
 *   so shrinking only removes rooms NOTHING points at, highest number first.
 *   A landlord who lists 10, takes 8 bookings and then edits down to 2 ends up
 *   with 8   which is the truth, and better than either a lie or an error.
 *
 * LABELS ARE 'Room 1'..'Room N'
 *   `hostel_rooms` has unique (hostel_id, label), so the numbers are derived
 *   from what is already there rather than from the count   otherwise adding a
 *   room after a deletion collides with a label that still exists.
 *
 * Per-room pricing stays null, meaning "inherit the hostel price". A landlord
 * who wants to price a room differently has `hostel_rooms` for it; this only
 * makes sure the rooms exist.
 */
async function syncRooms(
  db: Awaited<ReturnType<typeof createClient>>,
  hostelId: string,
  desired: number,
): Promise<void> {
  const { data: existing, error: readError } = await db
    .from('hostel_rooms')
    .select('id, label')
    .eq('hostel_id', hostelId);
  if (readError) throw readError;

  const rooms = (existing ?? []) as { id: string; label: string }[];
  if (rooms.length === desired) return;

  if (desired > rooms.length) {
    const taken = new Set(rooms.map((r) => r.label));
    const additions: { hostel_id: string; label: string }[] = [];
    let n = 1;
    while (rooms.length + additions.length < desired) {
      const label = `Room ${n}`;
      if (!taken.has(label)) additions.push({ hostel_id: hostelId, label });
      n += 1;
      // A hostel is capped at 200 rooms by the schema; this only stops a
      // pathological label set from looping forever.
      if (n > 500) break;
    }
    if (additions.length) {
      const { error } = await db.from('hostel_rooms').insert(additions);
      if (error) throw error;
    }
    return;
  }

  // Shrinking. Only rooms nothing has ever booked may go.
  const { data: booked, error: bookedError } = await db
    .from('bookings')
    .select('room_id')
    .eq('hostel_id', hostelId)
    .not('room_id', 'is', null);
  if (bookedError) throw bookedError;

  const spoken = new Set(((booked ?? []) as { room_id: string }[]).map((b) => b.room_id));
  const removable = rooms
    .filter((r) => !spoken.has(r.id))
    // Highest number first, so "Room 1" is the last thing to go.
    .sort((a, b) => b.label.localeCompare(a.label, undefined, { numeric: true }));

  const surplus = rooms.length - desired;
  const doomed = removable.slice(0, surplus).map((r) => r.id);
  if (!doomed.length) return;

  const { error } = await db.from('hostel_rooms').delete().in('id', doomed);
  if (error) throw error;
}

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

  // `area` IS THE COARSE LOCATION FILTER, NOT A LABEL.
  //
  // This used to be `v.area ?? v.address`, which stored "12 Ola Street, Safari,
  // Malete" as the area. The area dock filters on an exact name from a fixed
  // list, so a listing saved that way matched no area chip and was invisible in
  // 'area' mode   silently, and to the landlord most of all.
  //
  // Order: what the landlord picked, else the nearest service area to the pin.
  const area =
    v.area ??
    (v.lat !== undefined && v.lng !== undefined ? nearestArea({ lat: v.lat, lng: v.lng }) : null);

  if (!area) {
    return {
      ok: false,
      error: 'Pick the area this property is in, so students filtering by area can find it.',
    };
  }

  // ONLY OUR OWN BUCKET. Without this the column is an arbitrary URL rendered
  // to every student browsing hostels   see lib/storage/public-url. The upload
  // path produces exactly these, so a real landlord never sees this message.
  if (v.imageUrls.some((m) => !isOwnStorageUrl(m.url))) {
    return {
      ok: false,
      error: 'One of those photos did not upload properly. Remove it and add it again.',
    };
  }

  const payload = {
    name: v.name,
    address: v.address,
    area,
    // 'Single room' is NOT one of the four values the column allows, so this
    // fallback was itself a guaranteed check violation whenever roomType was
    // absent. 'Sharing' is the most common and is valid.
    room_type: v.roomType ?? 'Sharing',
    // Deduplicated case-insensitively: "Wi-Fi" and "wi-fi" are one amenity,
    // and a listing showing both reads as carelessness.
    amenities: dedupe(v.amenities),
    house_rules: v.houseRules.map(stripBullet).filter(Boolean),
    description: v.description || null,
    price_per_session_kobo: v.price * 100,
    // NULL RATHER THAN ABSENT, deliberately: editing a listing whose address
    // changed from a resolved one to a typed one has to CLEAR the old pin, or
    // the hostel keeps ranking at an address it is no longer at. A trigger
    // syncs `geo` from these two, and `hostels_near` reads only `geo`.
    lat: v.lat ?? null,
    lng: v.lng ?? null,
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

    // After the ownership check, never before: `replaceImages` deletes by
    // hostel_id, and doing that ahead of the update would let somebody clear
    // another landlord's photos with an id that is not theirs. RLS would refuse
    // the delete too   this is the half that reads as intent.
    try {
      await replaceImages(db, data.id as string, v.imageUrls);
      if (v.roomsTotal !== undefined) await syncRooms(db, data.id as string, v.roomsTotal);
    } catch (e) {
      return {
        ok: false,
        error: userMessage(e as { message: string }, 'The listing saved, but its photos did not.'),
      };
    }

    revalidatePath('/landlord/properties');
    return { ok: true, id: data.id as string };
  }

  const insertBody = {
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
  };

  const { data, error } = await db.from('hostels').insert(insertBody).select('id').maybeSingle();

  if (error) return { ok: false, error: userMessage(error, 'We could not save that listing.') };
  if (!data) return { ok: false, error: 'We could not save that listing.' };

  try {
    await replaceImages(db, data.id as string, v.imageUrls);
    if (v.roomsTotal !== undefined) await syncRooms(db, data.id as string, v.roomsTotal);
  } catch (e) {
    // The listing exists and is findable; only its photos are missing, and the
    // landlord can add them by editing. Reported rather than swallowed, and
    // NOT rolled back   deleting a saved listing to undo a failed photo insert
    // loses more than it fixes.
    return {
      ok: false,
      error: userMessage(
        e as { message: string },
        'The listing saved, but its photos or rooms did not.',
      ),
    };
  }

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
