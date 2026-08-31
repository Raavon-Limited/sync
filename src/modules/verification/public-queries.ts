/**
 * The public side of verification — what a stranger scanning a card can see.
 *
 * Separate from `queries.ts` because the audience is different in a way that
 * matters: everything here is readable by `anon`, and adding a field is a
 * disclosure decision rather than a convenience. Keeping the two files apart
 * means nobody widens the public answer by editing what looked like a private
 * query.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;
/* eslint-disable @typescript-eslint/no-explicit-any -- see lib/query/helpers.ts */
type Row = any;

/**
 * What Sync currently says about a business.
 *
 * `suspended` outranks everything: a removed account keeps its old
 * `verification_status`, and reporting that would have the card vouching for
 * somebody who has been taken off the platform.
 */
export type VerificationState =
  | 'verified'
  | 'pending'
  | 'unverified'
  | 'rejected'
  | 'suspended'
  | 'unknown';

export interface PublicVerification {
  found: boolean;
  state: VerificationState;
  businessName: string | null;
  slug: string;
  category: string | null;
  area: string | null;
  logoUrl: string | null;
  verifiedAt: string | null;
  memberSince: string | null;
  storeCount: number;
  ratingAvg: number;
  ratingCount: number;
  /** When this answer was produced — shown so a screenshot dates itself. */
  checkedAt: string;
}

export async function fetchPublicVerification(
  db: Client,
  slug: string,
): Promise<PublicVerification> {
  const { data, error } = await db.rpc('verify_business', { p_slug: slug });
  if (error) throw error;

  const r = (Array.isArray(data) ? data[0] : data) as Row | undefined;

  // The RPC always returns exactly one row, including for an unknown slug.
  // This fallback covers only a transport-level surprise, and it fails the
  // safe way: unknown, never verified.
  if (!r) {
    return {
      found: false,
      state: 'unknown',
      businessName: null,
      slug,
      category: null,
      area: null,
      logoUrl: null,
      verifiedAt: null,
      memberSince: null,
      storeCount: 0,
      ratingAvg: 0,
      ratingCount: 0,
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    found: !!r.found,
    state: (r.state ?? 'unknown') as VerificationState,
    businessName: r.business_name ?? null,
    slug: r.slug ?? slug,
    category: r.category ?? null,
    area: r.area ?? null,
    logoUrl: r.logo_url ?? null,
    verifiedAt: r.verified_at ?? null,
    memberSince: r.member_since ?? null,
    storeCount: r.store_count ?? 0,
    ratingAvg: Number(r.rating_avg ?? 0),
    ratingCount: r.rating_count ?? 0,
    checkedAt: r.checked_at ?? new Date().toISOString(),
  };
}

/** How each state is presented. One table so the card and the page agree. */
export const VERIFICATION_PRESENTATION: Record<
  VerificationState,
  { label: string; blurb: string; tone: 'good' | 'wait' | 'bad' | 'neutral' }
> = {
  verified: {
    label: 'Verified business',
    blurb: 'Sync has checked this business and its documents.',
    tone: 'good',
  },
  pending: {
    label: 'Verification in review',
    blurb: 'Documents have been submitted and are with a reviewer.',
    tone: 'wait',
  },
  unverified: {
    label: 'Not verified',
    blurb: 'This business has not completed verification.',
    tone: 'neutral',
  },
  rejected: {
    label: 'Not verified',
    // Deliberately not "rejected". A stranger needs to know the claim does not
    // stand; why it does not is between the business and Sync, and publishing
    // it would be a reputational judgement broadcast to anyone with a camera.
    blurb: 'This business has not completed verification.',
    tone: 'bad',
  },
  suspended: {
    label: 'Suspended',
    blurb: 'This account has been suspended. Do not rely on this card.',
    tone: 'bad',
  },
  unknown: {
    label: 'No such business',
    blurb: 'This code does not match any business on Sync.',
    tone: 'bad',
  },
};
