/**
 * ROUTE: /admin/editorial
 * ACCESS: admin / super_admin only.
 * PURPOSE: Write, schedule and retire platform articles.
 *
 * Was a client component seeded from a hardcoded ARTICLES array. It now reads
 * `public.articles`; the workspace below is still a client component because
 * the filters and modals are interactive, but it owns no data of its own.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { listArticles } from '@/modules/admin/editorial';
import { AdminEditorialPage } from './editorial-components';

export const metadata: Metadata = { title: 'Editorial   Admin' };

// Scheduled articles change status with the clock, not with a write, so a
// cached render would show yesterday's idea of what is live.
export const dynamic = 'force-dynamic';

export default async function EditorialPage() {
  await requireStaffArea('editorial');

  const { articles, stats, categories } = await listArticles();

  return (
    <div className="min-h-screen">
      <AdminEditorialPage articles={articles} stats={stats} usedCategories={categories} />
    </div>
  );
}
