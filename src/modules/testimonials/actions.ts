/**
 * Testimonial server actions: submit (any signed-in user) and moderate
 * (superadmin only).
 *
 * Two rules are enforced HERE as well as in RLS, deliberately:
 *
 *   1. A submission is always created as `pending`. RLS already refuses an
 *      insert with any other status, but stating it in code means a future
 *      policy edit cannot quietly turn this into self-publishing.
 *   2. Moderation re-checks the caller's role from the profiles table rather
 *      than trusting a JWT claim, matching how modules/account/actions.ts
 *      resolves privilege.
 *
 * Moderation writes go through the service-role client so the queue works
 * even before the `app_role` claim is present on a session - the role check
 * above is what authorises it, not RLS.
 */
'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Result = { ok: true } | { ok: false; error: string };

const MIN_BODY = 20;
const MAX_BODY = 600;

/** The signed-in caller's id + trusted role, read from the profiles table. */
async function caller(): Promise<{ id: string; role: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return { id: user.id, role: (data?.role as string | undefined) ?? 'student' };
}

/**
 * Submit a testimonial. Lands as `pending` and is invisible to everyone but
 * the author and staff until a superadmin approves it.
 */
export async function submitTestimonial(formData: FormData): Promise<Result> {
  const who = await caller();
  if (!who) return { ok: false, error: 'Sign in to leave a review.' };

  const body = String(formData.get('body') ?? '').trim();
  const ratingRaw = Number(formData.get('rating'));
  const detail = String(formData.get('detail') ?? '').trim();
  const displayName = String(formData.get('display_name') ?? '').trim();

  if (body.length < MIN_BODY) {
    return { ok: false, error: `Tell us a little more - at least ${MIN_BODY} characters.` };
  }
  if (body.length > MAX_BODY) {
    return { ok: false, error: `Keep it under ${MAX_BODY} characters.` };
  }
  if (!Number.isInteger(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
    return { ok: false, error: 'Pick a rating from 1 to 5.' };
  }

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { error } = await supabase.from('testimonials').insert({
    author_id: who.id,
    body,
    rating: ratingRaw,
    detail: detail || null,
    display_name: displayName || null,
    status: 'pending',
  });

  if (error) {
    // The partial unique index allows one pending row per author. Translate it
    // rather than surfacing a Postgres constraint name to a student.
    if (error.code === '23505') {
      return { ok: false, error: 'You already have a review waiting to be checked.' };
    }
    return { ok: false, error: 'Could not save your review. Try again.' };
  }

  revalidatePath('/');
  revalidatePath('/about');
  return { ok: true };
}

/** Approve or reject. Superadmin only - plain admins can read the queue, not act. */
async function decide(
  id: string,
  status: 'approved' | 'rejected',
  note: string | null,
): Promise<Result> {
  const who = await caller();
  if (!who) return { ok: false, error: 'Not signed in.' };
  if (who.role !== 'super_admin') {
    return { ok: false, error: 'Only a super admin can publish or reject a review.' };
  }

  const admin = createAdminClient() as unknown as SupabaseClient;
  const { error } = await admin
    .from('testimonials')
    .update({
      status,
      review_note: note,
      reviewed_by: who.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { ok: false, error: 'Could not update that review.' };

  revalidatePath('/admin/reviews');
  // An approval changes what the marketing pages render.
  revalidatePath('/');
  revalidatePath('/about');
  return { ok: true };
}

export async function approveTestimonial(id: string): Promise<Result> {
  return decide(id, 'approved', null);
}

export async function rejectTestimonial(id: string, reason: string): Promise<Result> {
  const note = reason.trim();
  if (!note) return { ok: false, error: 'Give a reason so the author can fix it.' };
  return decide(id, 'rejected', note);
}
