/**
 * Scheduled release of matured escrow holds.
 *
 * A student confirming delivery releases their own escrow immediately. When
 * they never confirm — which is most of the time — the money would otherwise
 * sit frozen forever, and the vendor is owed it. `escrow_holds.release_after`
 * exists precisely so this can settle it either way.
 *
 * The student order tracker already promises "it releases automatically once
 * the hold matures". This is what keeps that promise.
 *
 * Vercel Cron example (vercel.json):
 *   { "crons": [{ "path": "/api/cron/release-escrow", "schedule": "0 * * * *" }] }
 * Hourly rather than daily: a vendor waiting on money notices a day, and the
 * work is bounded by how many holds actually matured in that hour.
 */
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/** Per run. release_matured_escrow caps it server-side too. */
const BATCH = 200;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Service role: the RPC is revoked from every other role, and it refuses to
  // release anything that has not matured, so this cannot pay out early.
  const { data, error } = await admin.rpc('release_matured_escrow', { p_limit: BATCH });

  if (error) {
    // Non-2xx so the scheduler retries. Every release is idempotent, so a
    // retry re-attempts only what genuinely failed.
    console.error('escrow release cron failed', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const released = (data ?? []) as { order_id: string; transaction_id: string | null }[];
  return Response.json({ released: released.length, orders: released.map((r) => r.order_id) });
}
