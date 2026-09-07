/**
 * Server-side reads for testimonials.
 *
 * Moderation lives in the database, not here: `testimonials_select_approved`
 * only exposes approved rows to anon/authenticated, so the public reader below
 * cannot leak a pending quote even if it forgets to filter. The explicit
 * `.eq('status', 'approved')` is belt and braces, and documents intent.
 *
 * Degrades to an empty list rather than throwing - these render marketing
 * pages, and a Supabase outage should drop the rail, not 500 the landing page.
 */
import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

export type TestimonialStatus = 'pending' | 'approved' | 'rejected';

export interface Testimonial {
  id: string;
  body: string;
  rating: number;
  /** Byline, e.g. "Aisha O." */
  name: string;
  /** Sub-byline, e.g. "300L · KWASU". Null when the author left it blank. */
  detail: string | null;
  createdAt: string;
}

export interface PendingTestimonial extends Testimonial {
  status: TestimonialStatus;
  authorId: string;
  authorEmail: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
}

/**
 * `testimonials` postdates the checked-in generated types, so the typed client
 * rejects the table name. Regenerate after applying the migration and this
 * cast can go:
 *   npx supabase gen types typescript --linked > src/types/database.types.ts
 */
async function db() {
  return (await createClient()) as unknown as SupabaseClient;
}

type ProfileRef = { full_name: string | null; email?: string | null };

type Row = {
  id: string;
  body: string;
  rating: number;
  detail: string | null;
  display_name: string | null;
  created_at: string;
  // PostgREST returns an embedded to-one relation as an ARRAY when it cannot
  // prove the cardinality - which it cannot here, because this goes through
  // the untyped client. Accept both shapes and normalise in profileOf().
  profiles?: ProfileRef | ProfileRef[] | null;
};

function profileOf(r: Row): ProfileRef | null {
  const p = r.profiles;
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

/** Byline preference: the name the author chose, else their profile name. */
function bylineOf(r: Row): string {
  const name = r.display_name?.trim() || profileOf(r)?.full_name?.trim();
  return name && name.length > 0 ? name : 'Sync student';
}

/** Approved testimonials, newest first. Used by the marketing pages. */
export const listApprovedTestimonials = cache(async (limit = 6): Promise<Testimonial[]> => {
  if (!configured) return [];
  try {
    const supabase = await db();
    const { data, error } = await supabase
      .from('testimonials')
      .select('id, body, rating, detail, display_name, created_at, profiles(full_name)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return (data as Row[]).map((r) => ({
      id: r.id,
      body: r.body,
      rating: r.rating,
      name: bylineOf(r),
      detail: r.detail,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
});

/**
 * The moderation queue. Staff-readable by RLS; the page itself is behind the
 * admin route group, and only a superadmin can actually act on a row.
 */
export const listTestimonialsByStatus = cache(
  async (status: TestimonialStatus, limit = 50): Promise<PendingTestimonial[]> => {
    if (!configured) return [];
    try {
      const supabase = await db();
      const { data, error } = await supabase
        .from('testimonials')
        .select(
          'id, body, rating, detail, display_name, status, author_id, review_note, reviewed_at, created_at, profiles(full_name, email)',
        )
        .eq('status', status)
        // Pending is a work queue - oldest first, so nothing waits forever.
        .order('created_at', { ascending: status === 'pending' })
        .limit(limit);

      if (error || !data) return [];
      return (data as (Row & {
        status: TestimonialStatus;
        author_id: string;
        review_note: string | null;
        reviewed_at: string | null;
      })[]).map((r) => ({
        id: r.id,
        body: r.body,
        rating: r.rating,
        name: bylineOf(r),
        detail: r.detail,
        createdAt: r.created_at,
        status: r.status,
        authorId: r.author_id,
        authorEmail: profileOf(r)?.email ?? null,
        reviewNote: r.review_note,
        reviewedAt: r.reviewed_at,
      }));
    } catch {
      return [];
    }
  },
);

/** Counts per status, for the queue's tab badges. */
export const countTestimonials = cache(
  async (): Promise<Record<TestimonialStatus, number>> => {
    const empty = { pending: 0, approved: 0, rejected: 0 };
    if (!configured) return empty;
    try {
      const supabase = await db();
      const out = { ...empty };
      await Promise.all(
        (['pending', 'approved', 'rejected'] as const).map(async (s) => {
          const { count } = await supabase
            .from('testimonials')
            .select('id', { count: 'exact', head: true })
            .eq('status', s);
          out[s] = count ?? 0;
        }),
      );
      return out;
    } catch {
      return empty;
    }
  },
);

/** The caller's own submission, so the form can show its state. */
export async function getMyTestimonial(): Promise<PendingTestimonial | null> {
  if (!configured) return null;
  try {
    const supabase = await db();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from('testimonials')
      .select(
        'id, body, rating, detail, display_name, status, author_id, review_note, reviewed_at, created_at, profiles(full_name)',
      )
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;
    const r = data as Row & {
      status: TestimonialStatus;
      author_id: string;
      review_note: string | null;
      reviewed_at: string | null;
    };
    return {
      id: r.id,
      body: r.body,
      rating: r.rating,
      name: bylineOf(r),
      detail: r.detail,
      createdAt: r.created_at,
      status: r.status,
      authorId: r.author_id,
      authorEmail: null,
      reviewNote: r.review_note,
      reviewedAt: r.reviewed_at,
    };
  } catch {
    return null;
  }
}
