import type { StatusFilterOption, ArticleCategory } from './admin-editorialTypes';

const cn = (...classes: Array<string | boolean | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export default cn;

/**
 * The tag that marks an article featured. Kept here so the reader, the writer
 * and the category derivation all agree on the spelling — a typo in any one of
 * them makes "featured" silently stop working.
 */
export const FEATURED_TAG = 'featured';

/** Shown when an article has no category tag at all. */
export const UNCATEGORISED = 'Uncategorised';

export const STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
  'All Status',
  'Published',
  'Draft',
  'Scheduled',
  'Archived',
];

/**
 * Suggestions for the category picker, not a closed set. The filter dropdown
 * builds its options from the categories actually in use, so an article tagged
 * with something new is still findable without touching this list.
 */
export const ARTICLE_CATEGORIES: ArticleCategory[] = [
  'Business Tips',
  'Market Trends',
  'Safety & Compliance',
  'Marketing',
  'Customer Insights',
];
