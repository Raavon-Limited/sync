/**
 * Shapes for /admin/editorial, mapped onto `public.articles`.
 *
 * WHERE THE UI AND THE TABLE DISAGREED
 *   status    UI had Published | Draft | Scheduled. The table has
 *             draft | published | archived. "Scheduled" is not a stored state:
 *             it is `published` with a `published_at` still in the future,
 *             which is also what the public read policy already honours.
 *             "Archived" was missing from the UI and is added here — an
 *             article pulled from the site still exists and has to be findable.
 *   category  UI had a closed union of five. The table has `tags text[]`.
 *             Category is now the first non-marker tag, and is a plain string:
 *             a new category should be a new tag, not a code change.
 *   featured  No column. Carried as a 'featured' tag, which is why category
 *             skips it.
 *   views     No column, and nothing on the platform reads articles yet, so a
 *             view counter would report 0 forever. Dropped rather than faked;
 *             the stats row counts scheduled articles instead.
 */

export type ArticleStatus = 'Published' | 'Draft' | 'Scheduled' | 'Archived';

/** Free-form: comes from `articles.tags`, not from a union in this file. */
export type ArticleCategory = string;

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content?: string;
  category: ArticleCategory;
  author: string;
  date: string;
  /** ISO, or null while an article is a draft. Drives the Scheduled state. */
  publishedAt: string | null;
  status: ArticleStatus;
  featured: boolean;
  image?: string;
}

export interface EditorialStats {
  totalArticles: number;
  published: number;
  drafts: number;
  scheduled: number;
}

export interface NewArticleFormValues {
  title: string;
  category: ArticleCategory | '';
  excerpt: string;
  content: string;
  featuredImage: File | null;
  markAsFeatured: boolean;
  /** datetime-local value. Required by Schedule, ignored by the other two. */
  publishAt: string;
}

export type StatusFilterOption = 'All Status' | ArticleStatus;
export type CategoryFilterOption = string;
