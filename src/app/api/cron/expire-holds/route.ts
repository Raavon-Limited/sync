/**
 * Scheduled expiry of room holds nobody acted on.
 *
 * THE FUNCTION HAS EXISTED SINCE 0006 AND NOTHING HAS EVER CALLED IT.
 *   `expire_stale_holds()` was written with the note "call from a cron route
 *   alongside /api/cron/purge-archived". That route was never written, so no
 *   scheduler has ever driven it and `bookings` has been accumulating rows
 *   stuck at `awaiting_payment` with a deadline long past.
 *
 *   The visible half of the bug is in `bookings_one_hold_per_room_idx`. That
 *   unique index covers `awaiting_payment` and `confirmed`, and an index
 *   predicate has to be immutable so it CANNOT test `reserved_until > now()`.
 *   A lapsed-but-unswept hold therefore still occupies the room as far as the
 *   index is concerned, and the next student to request it is refused against a
 *   hold that expired weeks ago. The room never returns to the market on its
 *   own.
 *
 * WHAT WAS NOT BROKEN, so nobody noticed: `hostel_room_state` compares
 * `reserved_until > now()` at READ time, so a lapsed hold has always DISPLAYED
 * as `free`. The listing looked right while the write path refused. That gap
 * between what the page showed and what a request would do is exactly why this
 * went unseen.
 *
 * SO THIS IS NOT COSMETIC TIDY-UP. It is what lets a hostel go back on the
 * market when a student stops responding, and what makes the count in
 * `enforce_max_holds` fall back below the three-hostel cap so they can request
 * again.
 *
 * SAME AUTH AND SAME SCHEDULER AS release-escrow and release-inspections.
 * Bearer CRON_SECRET, driven from GitHub Actions rather than vercel.json,
 * because Vercel's Hobby plan rejects a more-than-daily cron expression and
 * takes the whole deployment down with it. See .github/workflows/.
 *
 * HOURLY IS ENOUGH, and deliberately not more. The hold is 24 hours
 * (`hold_interval()`), so an hour of slack either side is noise against it, and
 * every read path is already self-healing. Nothing a student sees waits on this
 * run.
 */
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Service role: the RPC is SECURITY DEFINER and granted to nothing else. It
  // only touches rows already past `reserved_until`, so it cannot take a room
  // from a student whose deadline is still running.
  const { data, error } = await admin.rpc('expire_stale_holds');

  if (error) {
    // Non-2xx so the scheduler retries. Expiring is idempotent   a row already
    // moved to `expired` no longer matches the predicate.
    console.error('hold expiry sweep failed', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ expired: Number(data ?? 0) });
}
