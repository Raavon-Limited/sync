/**
 * Data access for reviews.
 *
 * There was no module for this: the `reviews` table and the `submit_review`
 * RPC both existed, and nothing read or wrote them.
 *
 * "PENDING" IS DERIVED, NOT STORED
 *   Nothing marks a transaction as awaiting review. A pending review is simply
 *   a completed transaction the caller was part of that has no review row yet —
 *   which is exactly the rule `submit_review` enforces server-side. Deriving it
 *   here means the list can never offer something the RPC would then refuse.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { unwrapList } from '@/lib/query/helpers';
import type { PendingReview, Review, ReviewSubjectType, ReviewSourceType } from './types';

type Client = SupabaseClient<Database>;
import type { Row } from '@/lib/supabase/row';

const toReview = (r: Row): Review => ({
  id: r.id,
  authorId: r.author_id,
  subjectType: r.subject_type,
  subjectId: r.subject_id,
  sourceType: r.source_type,
  sourceId: r.source_id,
  rating: r.rating,
  title: r.title ?? null,
  body: r.body ?? null,
  createdAt: r.created_at,
});

/** Reviews the caller wrote. RLS scopes reads; no author filter needed. */
export async function fetchMyReviews(db: Client, authorId: string): Promise<Review[]> {
  return unwrapList<Row>(
    await db
      .from('reviews')
      .select('*')
      .eq('author_id', authorId)
      .order('created_at', { ascending: false }),
  ).map(toReview);
}

/**
 * Completed transactions with no review yet.
 *
 * Four sources, each with its own definition of "done" — and they are the ones
 * submit_review checks, deliberately kept in step with it:
 *   order            status = 'delivered'
 *   service_request  status = 'completed'
 *   delivery         status = 'delivered'
 *   booking          any status (the RPC does not require one)
 */
export async function fetchPendingReviews(
  db: Client,
  studentId: string,
): Promise<PendingReview[]> {
  const [orders, requests, bookings, existing] = await Promise.all([
    db
      .from('orders')
      .select('id, vendor_id, placed_at, storefront_id')
      .eq('student_id', studentId)
      .eq('status', 'delivered'),
    db
      .from('service_requests')
      .select('id, vendor_id, vertical, created_at, service:services(name)')
      .eq('student_id', studentId)
      .eq('status', 'completed'),
    db
      .from('bookings')
      .select('id, hostel_id, created_at, hostel:hostels(name)')
      .eq('student_id', studentId)
      .in('status', ['confirmed', 'completed']),
    db.from('reviews').select('source_type, source_id').eq('author_id', studentId),
  ]);

  const reviewed = new Set(
    ((existing.data ?? []) as Row[]).map((r) => `${r.source_type}:${r.source_id}`),
  );

  const out: PendingReview[] = [];

  for (const o of (orders.data ?? []) as Row[]) {
    if (reviewed.has(`order:${o.id}`)) continue;
    out.push({
      sourceType: 'order',
      sourceId: o.id,
      subjectType: 'vendor',
      subjectId: o.vendor_id,
      label: `Order ${String(o.id).slice(0, 8).toUpperCase()}`,
      occurredAt: o.placed_at,
    });
  }

  for (const r of (requests.data ?? []) as Row[]) {
    if (reviewed.has(`service_request:${r.id}`)) continue;
    out.push({
      sourceType: 'service_request',
      sourceId: r.id,
      subjectType: 'vendor',
      subjectId: r.vendor_id,
      label: r.service?.name ?? `${r.vertical} request`,
      occurredAt: r.created_at,
    });
  }

  for (const b of (bookings.data ?? []) as Row[]) {
    if (reviewed.has(`booking:${b.id}`)) continue;
    out.push({
      sourceType: 'booking',
      sourceId: b.id,
      // A booking is reviewed as the HOSTEL, not the landlord — students rate
      // the place they lived in.
      subjectType: 'hostel',
      subjectId: b.hostel_id,
      label: b.hostel?.name ?? 'Hostel stay',
      occurredAt: b.created_at,
    });
  }

  return out.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

/** Idempotent: the RPC upserts, so re-submitting edits the existing review. */
export async function submitReview(
  db: Client,
  input: {
    subjectType: ReviewSubjectType;
    subjectId: string;
    sourceType: ReviewSourceType;
    sourceId: string;
    rating: number;
    title?: string;
    body?: string;
  },
): Promise<string> {
  const { data, error } = await db.rpc('submit_review', {
    p_subject_type: input.subjectType,
    p_subject_id: input.subjectId,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_rating: input.rating,
    p_title: input.title,
    p_body: input.body,
  });
  if (error) throw error;
  return data as string;
}
