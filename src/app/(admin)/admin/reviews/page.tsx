/**
 * ROUTE: /admin/reviews
 * ACCESS: staff can read the queue; only a super_admin can publish or reject.
 * PURPOSE: Moderate testimonials before they reach the marketing pages.
 *
 * Nothing a student submits is public until it is approved here - see
 * `testimonials_select_approved` in 20260820170000_testimonials.sql, which is
 * what actually enforces that. This page is the human half of it.
 */
import type { Metadata } from 'next';

import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { requireStaffArea } from '@/modules/admin/guard';
import {
  countTestimonials,
  listTestimonialsByStatus,
  type TestimonialStatus,
} from '@/modules/testimonials/queries';
import { ReviewQueue } from './review-queue';

export const metadata: Metadata = { title: 'Reviews' };

const STATUSES: TestimonialStatus[] = ['pending', 'approved', 'rejected'];

function parseStatus(value: string | undefined): TestimonialStatus {
  return STATUSES.includes(value as TestimonialStatus) ? (value as TestimonialStatus) : 'pending';
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // This page guarded on the proxy alone; every other console screen also
  // asks here, and 'reviews' is a grantable area like the rest of them.
  await requireStaffArea('reviews');

  const status = parseStatus((await searchParams).status);

  const [profile, user, items, counts] = await Promise.all([
    getProfile(),
    getCurrentUser(),
    listTestimonialsByStatus(status),
    countTestimonials(),
  ]);

  // Role comes from the profiles table, not a JWT claim - same source the
  // server action re-checks before it writes.
  const role = profile?.role ?? (user?.user_metadata?.role as string | undefined);

  return (
    <ReviewQueue
      items={items}
      counts={counts}
      status={status}
      canModerate={role === 'super_admin'}
    />
  );
}
