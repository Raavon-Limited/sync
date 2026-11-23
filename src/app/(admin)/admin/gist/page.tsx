/**
 * ROUTE: /admin/gist
 * ACCESS: staff holding the 'gist' area. Revealing who posted is super admin
 *         only (see modules/gist/admin-actions).
 * PURPOSE: The daily summary of the public gist (what students talk about,
 *          what they agree with, when they are busy) and moderation of posts
 *          and polls. Posts are listed for the 72-day review window, including
 *          ones that have left the public feed.
 *
 * Reads on the service role after the area check: clients have no SELECT on
 * gist_posts by design (it holds the real author). author_id is never sent to
 * the browser from here either; only a super admin's explicit reveal does that.
 */
import type { Metadata } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaffArea } from '@/modules/admin/guard';
import { getProfile } from '@/modules/auth/queries';
import { GistModeration, type AdminGistRow, type AdminPollRow } from './gist-moderation';

export const metadata: Metadata = { title: 'Gist & polls' };

interface StatRow {
  day: string;
  campus_id: string;
  posts: number;
  by_kind: Record<string, number>;
  top_words: { word: string; n: number }[];
  top_posts: { id: string; kind: string; body: string; same_here: number }[];
  busiest_hour: number | null;
  reports: number;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireStaffArea('gist');
  const show = (await searchParams).show === 'hidden' ? 'hidden' : 'all';
  const profile = await getProfile();
  const db = createAdminClient() as unknown as SupabaseClient;

  let postsQ = db
    .from('gist_posts')
    .select('id, author_name, kind, body, created_at, hidden_at, report_count, campuses(code)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (show === 'hidden') postsQ = postsQ.not('hidden_at', 'is', null);

  const [{ data: stats }, { data: posts }, { data: polls }, { data: campuses }] = await Promise.all([
    db.from('gist_daily_stats').select('*').order('day', { ascending: false }).limit(14),
    postsQ,
    db
      .from('polls')
      .select('id, question, author_name, kind, scope, ends_at, hidden_at, report_count, created_at')
      .order('created_at', { ascending: false })
      .limit(30),
    db.from('campuses').select('id, code'),
  ]);

  const codeOf = new Map(((campuses ?? []) as { id: string; code: string }[]).map((c) => [c.id, c.code]));
  const latest = ((stats ?? []) as StatRow[]).slice(0, 7);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-section">Gist &amp; polls</h1>
        <p className="text-content-muted mt-1 max-w-2xl text-sm">
          Public posts leave the feed after 24 hours (or once a campus has 50 newer ones) and are deleted
          after 72 days. The summary is computed every night for the day before.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg">Daily summary</h2>
        {latest.length === 0 ? (
          <p className="text-content-muted text-sm">No summaries yet. The first appears the night after people post.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {latest.map((d) => (
              <article key={`${d.day}-${d.campus_id}`} className="bg-panel border-line/10 flex flex-col gap-3 rounded-2xl border p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold">
                    {codeOf.get(d.campus_id) ?? 'Campus'} · {d.day}
                  </p>
                  <p className="text-content-muted text-xs">{d.posts} posts</p>
                </div>
                <p className="text-content-muted text-xs">
                  {Object.entries(d.by_kind)
                    .map(([k, n]) => `${n} ${k}`)
                    .join(' · ') || 'No posts'}
                  {d.busiest_hour !== null && ` · busiest ${String(d.busiest_hour).padStart(2, '0')}:00`}
                  {` · ${d.reports} report${d.reports === 1 ? '' : 's'}`}
                </p>
                {d.top_words.length > 0 && (
                  <div>
                    <p className="eyebrow text-content-muted mb-1">Talking about</p>
                    <div className="flex flex-wrap gap-1">
                      {d.top_words.slice(0, 12).map((w) => (
                        <span key={w.word} className="bg-surface-deep rounded-full px-2 py-0.5 text-xs">
                          {w.word} <span className="text-content-muted">{w.n}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {d.top_posts.length > 0 && (
                  <div>
                    <p className="eyebrow text-content-muted mb-1">Most reactions</p>
                    <ul className="flex flex-col gap-1 text-sm">
                      {d.top_posts.slice(0, 3).map((p) => (
                        <li key={p.id} className="line-clamp-2">
                          <span className="text-content-muted text-xs">[{p.kind} · {p.same_here}]</span> {p.body}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <GistModeration
        show={show}
        isSuperAdmin={profile?.role === 'super_admin'}
        posts={((posts ?? []) as Record<string, unknown>[]).map(
          (p): AdminGistRow => ({
            id: p.id as string,
            authorName: p.author_name as string,
            kind: p.kind as string,
            body: p.body as string,
            createdAt: p.created_at as string,
            hidden: Boolean(p.hidden_at),
            reports: Number(p.report_count ?? 0),
            campus: ((p.campuses as { code?: string } | null)?.code ?? '') as string,
          }),
        )}
        polls={((polls ?? []) as Record<string, unknown>[]).map(
          (p): AdminPollRow => ({
            id: p.id as string,
            question: p.question as string,
            authorName: p.author_name as string,
            kind: p.kind as string,
            scope: p.scope as string,
            endsAt: p.ends_at as string,
            hidden: Boolean(p.hidden_at),
            reports: Number(p.report_count ?? 0),
          }),
        )}
      />
    </div>
  );
}
