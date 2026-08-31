/**
 * The public side of verification — what a stranger scanning a card can see.
 *
 * Separate from `queries.ts` because the audience is different in a way that
 * matters: everything here is readable by `anon`, and adding a field is a
 * disclosure decision rather than a convenience. Keeping the two files apart
 * means nobody widens the public answer by editing what looked like a private
 * query.
 *
 * ADDRESSED BY AN UNGUESSABLE CODE, NOT A SLUG. The page shows a photograph of
 * a person, and a slug derived from a business name could be walked to harvest
 * faces. See 20260901190000 for why that, rather than trying to detect a
 * camera, is what "only reachable by scanning" actually means.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;
/* eslint-disable @typescript-eslint/no-explicit-any -- see lib/query/helpers.ts */
type Row = any;

/**
 * What Sync currently says about a card holder.
 *
 * `suspended` outranks everything: a removed account keeps its old
 * `verification_status`, and reporting that would have the card vouching at
 * somebody's front door for a person who has been taken off the platform.
 */
export type VerificationState =
  | 'verified'
  | 'pending'
  | 'unverified'
  | 'rejected'
  | 'suspended'
  | 'unknown';

/** One thing the platform checked, and whether it passed. Never the document. */
export interface VerificationRequirement {
  key: string;
  label: string;
  met: boolean;
}

export interface PublicVerification {
  found: boolean;
  state: VerificationState;
  businessName: string | null;
  /** The person, when the account has a name on it. */
  holderName: string | null;
  /** The face to compare against whoever is standing there. */
  photoUrl: string | null;
  category: string | null;
  area: string | null;
  verifiedAt: string | null;
  memberSince: string | null;
  storeCount: number;
  ratingAvg: number;
  ratingCount: number;
  requirements: VerificationRequirement[];
  /** When this answer was produced — shown so a screenshot dates itself. */
  checkedAt: string;
}

/** Fails CLOSED: anything unexpected renders as `unknown`, never as verified. */
const NOT_FOUND: Omit<PublicVerification, 'checkedAt'> = {
  found: false,
  state: 'unknown',
  businessName: null,
  holderName: null,
  photoUrl: null,
  category: null,
  area: null,
  verifiedAt: null,
  memberSince: null,
  storeCount: 0,
  ratingAvg: 0,
  ratingCount: 0,
  requirements: [],
};

export async function fetchCardVerification(
  db: Client,
  code: string,
): Promise<PublicVerification> {
  const { data, error } = await db.rpc('verify_card', { p_code: code });
  if (error) throw error;

  const r = (Array.isArray(data) ? data[0] : data) as Row | undefined;

  // The RPC always returns exactly one row, including for an unknown code.
  // This covers only a transport-level surprise.
  if (!r) return { ...NOT_FOUND, checkedAt: new Date().toISOString() };

  return {
    found: !!r.found,
    state: (r.state ?? 'unknown') as VerificationState,
    businessName: r.business_name ?? null,
    holderName: r.holder_name ?? null,
    photoUrl: r.photo_url ?? null,
    category: r.category ?? null,
    area: r.area ?? null,
    verifiedAt: r.verified_at ?? null,
    memberSince: r.member_since ?? null,
    storeCount: r.store_count ?? 0,
    ratingAvg: Number(r.rating_avg ?? 0),
    ratingCount: r.rating_count ?? 0,
    requirements: Array.isArray(r.requirements) ? (r.requirements as VerificationRequirement[]) : [],
    checkedAt: r.checked_at ?? new Date().toISOString(),
  };
}

/**
 * How each state is presented.
 *
 * The copy is written for somebody standing at their own front door deciding
 * whether to let a stranger in — so it says what to DO, not just what the
 * status is. "Not verified" on its own reads as a technicality; "do not let
 * them in on the strength of this card" is the actual advice.
 */
export const VERIFICATION_PRESENTATION: Record<
  VerificationState,
  { label: string; blurb: string; tone: 'good' | 'wait' | 'bad' | 'neutral' }
> = {
  verified: {
    label: 'Verified',
    blurb: 'Sync has checked this person’s identity and documents.',
    tone: 'good',
  },
  pending: {
    label: 'Not verified yet',
    blurb:
      'Documents have been submitted but not approved. Sync has not confirmed who this is.',
    tone: 'wait',
  },
  unverified: {
    label: 'Not verified',
    blurb: 'Sync has not checked this person. Do not rely on this card.',
    tone: 'neutral',
  },
  rejected: {
    label: 'Not verified',
    // Deliberately not "rejected". The person holding the phone needs to know
    // the claim does not stand; WHY it does not is between the account and
    // Sync, and publishing it broadcasts a judgement to anyone with a camera.
    blurb: 'Sync has not verified this person. Do not rely on this card.',
    tone: 'bad',
  },
  suspended: {
    label: 'Suspended',
    blurb:
      'This account has been suspended by Sync. Do not let them in on the strength of this card.',
    tone: 'bad',
  },
  unknown: {
    label: 'Not a valid card',
    blurb: 'This code does not match any card on Sync. Treat it as unverified.',
    tone: 'bad',
  },
};
