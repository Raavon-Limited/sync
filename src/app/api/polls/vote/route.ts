/**
 * POST /api/polls/vote - cast a vote. NO ACCOUNT NEEDED.
 *
 * The one caller of cast_poll_vote() (migration 20261123120000), which clients
 * cannot execute directly. The route supplies what the client must not set:
 *
 *   voter_key   SHA-256 of an httpOnly cookie this route issues. JavaScript on
 *               the page cannot read or forge it.
 *   device_key  SHA-256 of the device id the page keeps in localStorage. A
 *               second key, so clearing cookies alone does not unlock a revote.
 *   user_id     the signed-in account, if any: one vote per account too.
 *   in_vicinity worked out HERE from the coordinates sent, against the poll
 *               campus's own areas. Within VICINITY_KM of any of them counts.
 *               No coordinates means "outside": the tag says so, never guesses.
 *   ip_hash     recorded for staff review, NOT used to refuse votes. Campus
 *               Wi-Fi puts hundreds of students behind one address.
 *
 * Honest limit: a different browser or a private window is a new device. This
 * makes a second vote a deliberate act, not an accident or a refresh.
 */
import { createHash, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const COOKIE = 'sync_vid';
const VICINITY_KM = 5;

const Body = z.object({
  pollId: z.string().uuid(),
  optionIds: z.array(z.string().uuid()).min(1).max(10),
  deviceId: z.string().min(8).max(100).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'That vote did not make sense. Refresh and try again.' }, { status: 400 });
  }
  const { pollId, optionIds, deviceId, lat, lng } = parsed.data;

  const jar = await cookies();
  let vid = jar.get(COOKIE)?.value;
  if (!vid) {
    vid = randomUUID();
    jar.set(COOKIE, vid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365 * 2,
    });
  }

  // Untyped: these tables and functions postdate src/types/database.ts.
  // Regenerate the types after applying 20261123120000 and this cast can go.
  const admin = createAdminClient() as unknown as SupabaseClient;

  // Which campus is this poll at, and where are its areas?
  const { data: poll } = await admin.from('polls').select('campus_id').eq('id', pollId).maybeSingle();
  if (!poll) return Response.json({ error: 'This poll has closed' }, { status: 404 });

  let inVicinity = false;
  if (lat !== undefined && lng !== undefined) {
    const { data: areas } = await admin
      .from('areas')
      .select('lat, lng')
      .eq('campus_id', poll.campus_id as string);
    inVicinity = (areas ?? []).some(
      (a) => km({ lat, lng }, { lat: Number(a.lat), lng: Number(a.lng) }) <= VICINITY_KM,
    );
  }

  // Signed in? Count the account too. Never required.
  let userId: string | null = null;
  try {
    const { data } = await (await createClient()).auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    /* signed out */
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const { error } = await admin.rpc('cast_poll_vote', {
    p_poll: pollId,
    p_voter_key: sha(`v:${vid}`),
    p_device_key: deviceId ? sha(`d:${deviceId}`) : null,
    p_user: userId,
    p_in_vicinity: inVicinity,
    p_ip_hash: ip ? sha(`ip:${ip}`) : null,
    p_options: optionIds,
  });

  if (error) {
    // The function's own messages are written for students; pass them on.
    const known = error.code === 'P0001';
    return Response.json(
      { error: known ? error.message : 'Could not save your vote. Try again.' },
      { status: known ? 409 : 500 },
    );
  }
  return Response.json({ ok: true, inVicinity });
}
