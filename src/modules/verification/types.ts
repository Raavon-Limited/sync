/**
 * Domain types for the 'verification' module.
 * Cross-module shared types belong in @/types.
 */

/**
 * Vendor verification lifecycle:
 *   unverified → pending (submitted, awaiting admin) → verified (or rejected).
 * Stored on the auth user's metadata as `verification_status`.
 */
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

/**
 * `role` is the business role the submission left the account on - 'landlord'
 * for the landlord category, 'vendor' for every other. Returned because the
 * category chosen in the wizard decides which dashboard exists for them, and
 * the caller used to guess '/vendor' and be wrong for every landlord.
 */
export type VerificationResult = { ok: true; role?: string } | { ok: false; error: string };
