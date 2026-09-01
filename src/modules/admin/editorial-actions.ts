/**
 * Editorial mutations. Staff only, service-role client, role re-checked per
 * action — the same shape as `src/modules/admin/actions.ts`.
 *
 * WHAT MAPS ONTO WHAT
 *   publish   status 'published', published_at = now
 *   schedule  status 'published', published_at = a future time. There is no
 *             'scheduled' value in the table's check constraint; the future
 *             timestamp IS the schedule. Migration 20260828110000 taught the
 *             public read policy to respect it — before that, a scheduled
 *             article was readable the moment it was saved.
 *   draft     status 'draft', published_at cleared
 *   archive   status 'archived'
 *
 * FEATURED AND CATEGORY ARE TAGS
 *   `articles` has neither column. Category is the first non-'featured' tag,
 *   featured is the presence of that tag. Writing tags therefore always
 *   replaces the whole array rather than appending, so unchecking "featured"
 *   actually removes it.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database.types';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { isStaffRole } from '@/modules/admin/guard';
import { userMessage } from '@/lib/errors';
import { FEATURED_TAG } from '@/app/(admin)/admin/editorial/admin-editorialConstants';

export type PublishMode = 'publish' | 'draft' | 'schedule';

export interface ArticleInput {
  title: string;
  category: string;
  excerpt: string;
  content: string;
  featured: boolean;
  /** datetime-local string. Required when mode is 'schedule'. */
  publishAt?: string;
  /** Absent means "leave the current cover alone" on an update. */
  image?: File | null;
}

async function assertStaff(): Promise<string> {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  if (!isStaffRole(profile?.role)) throw new Error('Not authorised');
  if (!user?.id) throw new Error('Not authenticated');
  return user.id;
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'article'
  );
}

function tagsFor(category: string, featured: boolean): string[] {
  const tags = [category.trim()].filter(Boolean);
  if (featured) tags.push(FEATURED_TAG);
  return tags;
}

/**
 * `status` and `published_at` together. Scheduling writes 'published' with a
 * future timestamp because that is the only pair the table's check constraint
 * and the public read policy both understand.
 */
function timing(mode: PublishMode, publishAt?: string) {
  if (mode === 'draft') return { status: 'draft', published_at: null };
  if (mode === 'schedule') {
    const when = publishAt ? new Date(publishAt) : null;
    if (!when || Number.isNaN(when.getTime()))
      throw new Error('Pick a date and time to schedule for');
    if (when <= new Date()) throw new Error('Scheduled time must be in the future');
    return { status: 'published', published_at: when.toISOString() };
  }
  return { status: 'published', published_at: new Date().toISOString() };
}

/**
 * Covers live in `public-media` under the uploader's own uuid folder, which is
 * what the bucket's insert policy requires. The service role would bypass that
 * policy, but writing outside the folder anyway would leave objects no
 * request-scoped client could ever update or delete.
 */
async function uploadCover(file: File, staffId: string): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Cover must be an image');
  const db = createAdminClient();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${staffId}/articles/${crypto.randomUUID()}.${ext}`;

  const { error } = await db.storage
    .from('public-media')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(userMessage(error, 'The cover image could not be uploaded.'));

  return db.storage.from('public-media').getPublicUrl(path).data.publicUrl;
}

export async function createArticle(input: ArticleInput, mode: PublishMode) {
  const staffId = await assertStaff();

  if (!input.title.trim()) throw new Error('An article needs a title');
  if (!input.category.trim()) throw new Error('Pick a category');

  const when = timing(mode, input.publishAt);
  const db = createAdminClient();

  const cover = input.image ? await uploadCover(input.image, staffId) : null;

  // `slug` is unique. Two articles called "Food Safety" is an ordinary thing
  // to want, so the collision is resolved rather than reported.
  const base = slugify(input.title);
  let slug = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await db.from('articles').insert({
      slug,
      title: input.title.trim(),
      excerpt: input.excerpt.trim() || null,
      body: input.content.trim() || null,
      cover_url: cover,
      author_id: staffId,
      tags: tagsFor(input.category, input.featured),
      ...when,
    });

    if (!error) {
      revalidatePath('/admin/editorial');
      return;
    }
    // 23505 = unique_violation. Anything else is a real failure.
    if (error.code !== '23505')
      throw new Error(userMessage(error, 'We could not save the article.'));
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  throw new Error('Could not find a free slug for that title');
}

export async function updateArticle(id: string, input: ArticleInput, mode: PublishMode) {
  const staffId = await assertStaff();

  if (!input.title.trim()) throw new Error('An article needs a title');
  if (!input.category.trim()) throw new Error('Pick a category');

  const when = timing(mode, input.publishAt);
  const db = createAdminClient();

  const patch: Database['public']['Tables']['articles']['Update'] = {
    title: input.title.trim(),
    excerpt: input.excerpt.trim() || null,
    body: input.content.trim() || null,
    tags: tagsFor(input.category, input.featured),
    updated_at: new Date().toISOString(),
    ...when,
  };

  // Only touch the cover when a new file came with the edit. Sending null for
  // "unchanged" would quietly delete the existing image.
  if (input.image) patch.cover_url = await uploadCover(input.image, staffId);

  const { error } = await db.from('articles').update(patch).eq('id', id);
  if (error) throw new Error(userMessage(error, 'We could not save your changes.'));
  revalidatePath('/admin/editorial');
}

/**
 * Archive, not delete. An article that was live has been linked to and read;
 * removing the row breaks those links and destroys the record of what was
 * published. `purgeArticle` exists for the drafts that were never anything.
 */
export async function archiveArticle(id: string) {
  await assertStaff();
  const db = createAdminClient();
  const { error } = await db
    .from('articles')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(userMessage(error, 'We could not archive the article.'));
  revalidatePath('/admin/editorial');
}

export async function purgeArticle(id: string) {
  await assertStaff();
  const db = createAdminClient();

  // Refuses anything that has ever been published, whatever the caller asked
  // for — the guard belongs next to the delete, not in the UI that calls it.
  const { data: row, error: readErr } = await db
    .from('articles')
    .select('published_at, status')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(userMessage(readErr, 'We could not find that article.'));
  if (!row) return;
  if (row.published_at) throw new Error('Published articles are archived, not deleted');

  const { error } = await db.from('articles').delete().eq('id', id);
  if (error) throw new Error(userMessage(error, 'We could not delete the article.'));
  revalidatePath('/admin/editorial');
}
