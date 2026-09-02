/** Domain types for reviews. */

export type ReviewSubjectType = 'vendor' | 'rider' | 'hostel';
export type ReviewSourceType = 'order' | 'booking' | 'service_request' | 'delivery';

export interface Review {
  id: string;
  authorId: string;
  subjectType: ReviewSubjectType;
  subjectId: string;
  sourceType: ReviewSourceType;
  sourceId: string;
  /** 1-5, enforced by a check constraint. */
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: string;
}

/**
 * A completed transaction with no review yet. Derived, never stored   see the
 * note in queries.ts.
 */
export interface PendingReview {
  sourceType: ReviewSourceType;
  sourceId: string;
  subjectType: ReviewSubjectType;
  subjectId: string;
  /** What the student will recognise it by. */
  label: string;
  occurredAt: string;
}
