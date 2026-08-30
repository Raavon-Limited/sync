/**
 * Reading `public.articles` for /admin/editorial.
 *
 * Staff see every article, including drafts and archived ones — the public
 * policy only exposes `status = 'published'`, so this goes through the
 * service-role client the way the rest of the admin surface does. The caller
 * is expected to have checked the role already; every mutation in
 * `editorial-actions.ts` re-checks it for itself.
 */
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { FEATURED_TAG, UNCATEGORISED } from '@/app/(admin)/admin/editorial/admin-editorialConstants';
import type {
  Article,
  ArticleStatus,
  EditorialStats,
} from '@/app/(admin)/admin/editorial/admin-editorialTypes';

type Row = Record<string, any>;

/**
 * "Scheduled" is not a stored status. It is `published` with a publish time
 * that has not arrived — the same condition the public read policy uses — so
 * it is derived here rather than written anywhere.
 */
export function statusOf(row: { status: string; published_at: string | null }): ArticleStatus {
  if (row.status === 'archived') return 'Archived';
  if (row.status === 'draft') return 'Draft';
  if (row.published_at && new Date(row.published_at) > new Date()) return 'Scheduled';
  return 'Published';
}

export function categoryOf(tags: string[] | null): string {
  return (tags ?? []).find((t) => t !== FEATURED_TAG) ?? UNCATEGORISED;
}

const DATE = (iso: string) =>
  new Date(iso).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });

export async function listArticles(): Promise<{
  articles: Article[];
  stats: EditorialStats;
  categories: string[];
}> {
  const db = createAdminClient();

  const { data, error } = await db
    .from('articles')
    .select('id, slug, title, excerpt, body, cover_url, author_id, status, published_at, tags, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Could not load articles: ${error.message}`);

  const rows = (data ?? []) as Row[];

  // `articles.author_id` points at `profiles`, which is own-row-only under RLS
  // and has no PostgREST relationship worth embedding here, so the names are
  // fetched once and joined in code. Embedding it would fail the whole query.
  const authorIds = [...new Set(rows.map((r) => r.author_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (authorIds.length) {
    const { data: authors } = await db.from('profiles').select('id, full_name').in('id', authorIds);
    for (const a of (authors ?? []) as Row[]) names.set(a.id, a.full_name);
  }

  const articles: Article[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt ?? '',
    content: r.body ?? '',
    category: categoryOf(r.tags),
    // An author whose account was deleted leaves author_id null. Saying so is
    // more useful than an empty byline.
    author: (r.author_id && names.get(r.author_id)) || 'Unknown author',
    date: DATE(r.published_at ?? r.created_at),
    publishedAt: r.published_at,
    status: statusOf(r as { status: string; published_at: string | null }),
    featured: ((r.tags ?? []) as string[]).includes(FEATURED_TAG),
    image: r.cover_url ?? undefined,
  }));

  return {
    articles,
    stats: {
      totalArticles: articles.length,
      published: articles.filter((a) => a.status === 'Published').length,
      drafts: articles.filter((a) => a.status === 'Draft').length,
      scheduled: articles.filter((a) => a.status === 'Scheduled').length,
    },
    // Built from what is actually in use, so a tag nobody predicted is still
    // filterable.
    categories: [...new Set(articles.map((a) => a.category))].sort(),
  };
}
