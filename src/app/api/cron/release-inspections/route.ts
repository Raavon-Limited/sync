/**
 * Scheduled release of inspections whose agent never turned up.
 *
 * An agent claims a viewing from the open board and the student is told, by
 * name, who is coming. When that agent does not go, nothing in the system
 * notices on its own: the inspection stays assigned to them, the fee stays
 * pointed at them, and the student waits at a gate. This is what notices.
 *
 * Past `inspection_claim_grace_minutes` (60 by default) with no report filed,
 * the claim is forfeited and the job goes back on the board for someone else.
 * The agent who dropped it cannot take it again - `inspection_claims` keeps the
 * forfeited row and its (inspection_id, agent_id) unique is what refuses them.
 *
 * SAME AUTH AND SAME SCHEDULER AS release-escrow.
 * Bearer CRON_SECRET, so any scheduler can drive it, and for the reason that
 * route's header explains at length: Vercel's Hobby plan rejects a
 * more-than-daily cron expression outright and takes the whole deployment with
 * it. This is driven from GitHub Actions alongside the escrow release.
 *
 * FREQUENCY IS THE POINT. A student who was stood up an hour ago is worth
 * finding another agent for; one found tomorrow morning is not. Hourly.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/** `sweep_expired_inspection_claims` postdates the checked-in types. REGENERATE. */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

/** Per run. sweep_expired_inspection_claims caps it server-side too. */
const BATCH = 100;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Service role: the RPC is granted to nothing else, and it only touches
  // inspections that are past their grace period with no report filed, so this
  // cannot take a job off an agent who is standing in the building.
  const { data, error } = await loose(admin).rpc('sweep_expired_inspection_claims', {
    p_limit: BATCH,
  });

  if (error) {
    // Non-2xx so the scheduler retries. Releasing is idempotent   an inspection
    // already back on the board returns without changing anything.
    console.error('inspection claim sweep failed', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ released: Number(data ?? 0) });
}
