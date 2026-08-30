/**
 * The editorial workspace: filters, list, and the three modals.
 *
 * It holds no article data of its own. Everything it shows arrives as props
 * from the route's server component, and every change goes back through a
 * server action that revalidates the route. That is why there is no
 * `setArticles` here — the list this renders is the list the database has, not
 * a local copy that has drifted from it.
 */
'use client';

import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { EditorialStatsRow } from './EditorialStatsRow';
import { ArticleList } from './ArticleList';
import { NewArticleModal } from './NewArticleModal';
import { ArticleViewModal } from './ArticleViewModal';
import { EditArticleModal } from './EditArticleModal';
import type { EditArticleFormValues } from './EditArticleModal';
import { ARTICLE_CATEGORIES } from '../admin-editorialConstants';
import type {
  Article,
  EditorialStats,
  NewArticleFormValues,
  StatusFilterOption,
} from '../admin-editorialTypes';
import {
  archiveArticle,
  createArticle,
  purgeArticle,
  updateArticle,
  type PublishMode,
} from '@/modules/admin/editorial-actions';
import { Button } from '@/components/ui';

const ALL_CATEGORIES = 'All Categories';

/** The edit modal speaks in statuses; the actions speak in publish modes. */
function modeFor(status: Article['status']): PublishMode {
  if (status === 'Draft') return 'draft';
  if (status === 'Scheduled') return 'schedule';
  return 'publish';
}

export function AdminEditorialPage({
  articles,
  stats,
  usedCategories,
}: {
  articles: Article[];
  stats: EditorialStats;
  /** Categories present in the data, so filtering can reach every article. */
  usedCategories: string[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>('All Status');
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [viewingArticle, setViewingArticle] = useState<Article | null>(null);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return articles.filter((a) => {
      const matchesSearch =
        !q || a.title.toLowerCase().includes(q) || a.excerpt.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'All Status' || a.status === statusFilter;
      const matchesCategory = categoryFilter === ALL_CATEGORIES || a.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [articles, searchQuery, statusFilter, categoryFilter]);

  // The picker offers the house categories plus anything already in use, so an
  // article tagged by hand does not disappear from the filter that would find it.
  const categoryOptions = useMemo(
    () => [ALL_CATEGORIES, ...new Set([...ARTICLE_CATEGORIES, ...usedCategories])],
    [usedCategories],
  );
  const pickerCategories = useMemo(
    () => [...new Set([...ARTICLE_CATEGORIES, ...usedCategories])],
    [usedCategories],
  );

  async function handleCreate(values: NewArticleFormValues, mode: PublishMode) {
    await createArticle(
      {
        title: values.title,
        category: values.category,
        excerpt: values.excerpt,
        content: values.content,
        featured: values.markAsFeatured,
        publishAt: values.publishAt,
        image: values.featuredImage,
      },
      mode,
    );
  }

  async function handleSaveEdit(id: string, values: EditArticleFormValues) {
    // Archiving is its own action: it is the one status change that is about
    // taking something down rather than about when it goes up.
    if (values.status === 'Archived') {
      await archiveArticle(id);
    } else {
      await updateArticle(
        id,
        {
          title: values.title,
          category: values.category,
          excerpt: values.excerpt,
          content: values.content,
          featured: values.markAsFeatured,
          publishAt: values.publishAt,
          image: values.featuredImage,
        },
        modeFor(values.status),
      );
    }
    // The route revalidates, so the open view modal would keep showing the old
    // copy. Closing it is honest; patching it locally would not be.
    setViewingArticle(null);
  }

  function handleEditFromView(article: Article) {
    setViewingArticle(null);
    setTimeout(() => setEditingArticle(article), 150);
  }

  async function handleDelete(article: Article) {
    // Anything that has been live is archived rather than destroyed; the action
    // enforces this too, so a stale list here cannot delete a published post.
    if (article.publishedAt) await archiveArticle(article.id);
    else await purgeArticle(article.id);
    if (viewingArticle?.id === article.id) setViewingArticle(null);
  }

  return (
    <div className="mx-auto w-full p-1 transition-colors duration-300">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div>
          <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / EDITORIAL</h1>
          <p className="text-content-muted/80 mt-1">
            Create and manage blog posts, articles, and content layouts.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setNewModalOpen(true)}
          className="bg-lime text-ink h-10 cursor-pointer gap-2 px-4 font-semibold whitespace-nowrap shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus size={16} />
          New Article
        </Button>
      </div>

      <EditorialStatsRow stats={stats} />

      <ArticleList
        articles={filtered}
        categoryOptions={categoryOptions}
        searchQuery={searchQuery}
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
        onSearchChange={setSearchQuery}
        onStatusChange={setStatusFilter}
        onCategoryChange={setCategoryFilter}
        onView={setViewingArticle}
        onEdit={setEditingArticle}
        onDelete={handleDelete}
      />

      <NewArticleModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        categories={pickerCategories}
        onSubmit={handleCreate}
      />

      <ArticleViewModal
        article={viewingArticle}
        onClose={() => setViewingArticle(null)}
        onEdit={handleEditFromView}
      />

      <EditArticleModal
        article={editingArticle}
        onClose={() => setEditingArticle(null)}
        categories={pickerCategories}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
