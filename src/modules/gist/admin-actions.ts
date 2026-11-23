/**
 * Gist moderation for /admin/gist (migration 20261123120000).
 *
 * Hide / restore: staff holding the 'gist' area with write access. Runs on the
 * service role, because clients have no UPDATE on gist_posts or polls at all;
 * the area check here is what authorises it.
 *
 * Reveal: SUPER ADMIN ONLY, and deliberately NOT on the service role. It calls
 * reveal_gist_author() as the signed-in user, so the database itself checks
 * the role and writes the audit row (who, which post, why). The founder's rule:
 * identities stay private unless the law requires them.
 */
'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { assertArea } from '@/modules/access/guard';
import { requireStaff } from '@/modules/admin/guard';
import { getProfile } from '@/modules/auth/queries';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const loose = (c: unknown) => c as SupabaseClient;

export async function setGistHidden(postId: string, hidden: boolean): Promise<Result> {
  try {
    await requireStaff();
    await assertArea('gist', 'write');
  } catch {
    return { ok: false, error: 'You do not have access to do that' };
  }
  const { error } = await loose(createAdminClient())
    .from('gist_posts')
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq('id', postId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/gist');
  return { ok: true };
}

export async function setPollHidden(pollId: string, hidden: boolean): Promise<Result> {
  try {
    await requireStaff();
    await assertArea('gist', 'write');
  } catch {
    return { ok: false, error: 'You do not have access to do that' };
  }
  const { error } = await loose(createAdminClient())
    .from('polls')
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq('id', pollId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/gist');
  return { ok: true };
}

export interface RevealedAuthor {
  author_id: string;
  full_name: string | null;
  email: string | null;
  display_name: string | null;
}

export async function revealGistAuthor(postId: string, reason: string): Promise<Result<RevealedAuthor>> {
  const profile = await getProfile();
  if (profile?.role !== 'super_admin') return { ok: false, error: 'Only a super admin can do this' };
  const { data, error } = await loose(await createClient()).rpc('reveal_gist_author', {
    p_post: postId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };
  const row = ((data ?? []) as RevealedAuthor[])[0];
  if (!row) return { ok: false, error: 'No account found for that post' };
  return { ok: true, data: row };
}
