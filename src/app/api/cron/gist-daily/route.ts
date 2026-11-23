/**
 * Daily gist job (migration 20261123120000):
 *   1. compute_gist_daily_stats(yesterday, Lagos time) - per-campus counts,
 *      top words, most "same here", busiest hour, reports. Shown at /admin/gist.
 *   2. purge_gist() - deletes posts older than 72 days. They left the public
 *      feed after 24 hours; this ends the staff review window.
 *
 * Runs at 00:10 Lagos (23:10 UTC) from vercel.json, authenticated with
 * CRON_SECRET like the other cron routes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function lagosYesterday(): string {
  // en-CA formats as YYYY-MM-DD.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Untyped: these tables and functions postdate src/types/database.ts.
  // Regenerate the types after applying 20261123120000 and this cast can go.
  const admin = createAdminClient() as unknown as SupabaseClient;
  const day = lagosYesterday();

  const stats = await admin.rpc('compute_gist_daily_stats', { p_day: day });
  const purge = await admin.rpc('purge_gist');

  if (stats.error || purge.error) {
    return Response.json(
      { error: stats.error?.message ?? purge.error?.message, day },
      { status: 500 },
    );
  }
  return Response.json({ day, campuses: stats.data, purged: purge.data });
}
