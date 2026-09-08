/**
 * Scheduled end of tenancies whose lease has run out.
 *
 * NOTHING HAS EVER SET A BOOKING TO 'completed'.
 *   The status exists in the constraint, the stage rail draws it as the last
 *   step, and no code anywhere wrote it - so every tenancy Sync has taken is
 *   still `confirmed` and would have remained so indefinitely.
 *
 * THE COST IS A ROOM THAT NEVER COMES BACK.
 *   `hostel_room_state` calls a room 'booked' whenever a CONFIRMED booking sits
 *   on it, with no date test - unlike a hold, which the same view re-checks
 *   against `reserved_until` when it is read. A lease that ended in May
 *   therefore keeps the room off the market in September, and there is no
 *   button on any screen that would free it.
 *
 *   This is the same hole `expire_stale_holds` filled for unpaid holds. Paid
 *   tenancies had it too; nobody had hit it because no lease has ended yet.
 *
 * GRACE IS HONOURED. The RPC completes on `coalesce(grace_until, end_date)`, so
 * a landlord who extended a stay does not have the room taken back out from
 * under their tenant by a sweep an hour later.
 *
 * SAME AUTH AND SAME SCHEDULER as expire-holds and release-escrow: bearer
 * CRON_SECRET, driven from GitHub Actions rather than vercel.json, because
 * Vercel's Hobby plan rejects a more-than-daily cron and fails the deployment
 * over it. See .github/workflows/escrow-release.yml.
 *
 * HOURLY IS MORE OFTEN THAN NEEDED - a lease ends on a date, so daily would do.
 * It rides the existing hourly workflow anyway, because a second schedule is a
 * second thing to fail to notice has stopped running.
 */
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Service role: the RPC is SECURITY DEFINER and granted to nothing else. Its
  // predicate is a date in the past, so it cannot end a tenancy that is still
  // running however often this is called.
  const { data, error } = await admin.rpc('complete_ended_tenancies', { p_limit: 500 });

  if (error) {
    // Non-2xx so the scheduler retries. Completing is idempotent - a row that
    // has moved to `completed` no longer matches the predicate.
    console.error('tenancy completion sweep failed', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ completed: Number(data ?? 0) });
}
