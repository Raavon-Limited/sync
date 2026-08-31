/**
 * Verification schemas - the details a vendor submits to get verified
 * (business identity + what they offer + where they operate). Used by the
 * vendor onboarding wizard and the matching server action in
 * modules/verification.
 */
import { z } from 'zod';
import { displayName, nigerianPhone } from './primitives';
import { TRADES, VENDOR_CATEGORIES } from './auth';

export const vendorVerificationSchema = z.object({
  /**
   * `livenessConfirmed: z.boolean()` USED TO BE HERE, AND IT WAS A LIE THE
   * CLIENT TOLD US.
   *
   * A boolean posted by the browser saying "I completed the liveness check"
   * confirms nothing — the browser is the thing being checked. It was written
   * straight to user metadata as `liveness_confirmed: true`, which is the same
   * class of hole `modules/verification/queries.ts` already documents about
   * vendors self-marking as verified.
   *
   * A liveness result is a fact about a face, and only the thing that saw the
   * face can assert it. Until Smile ID / Dojah is wired in, what we actually
   * have is a SELFIE the vendor uploads and a human compares against their ID
   * — so that is what the schema asks for: a stored artefact a reviewer looks
   * at, not a checkbox the applicant ticks about themselves.
   */
  businessName: displayName,
  /** Free-text description of what the vendor sells / offers. */
  sells: z.string().trim().min(10, 'Tell us a bit more about what you offer').max(500),
  businessAddress: z.string().trim().min(6, 'Enter your business address').max(200),
});
export type VendorVerificationInput = z.infer<typeof vendorVerificationSchema>;

/**
 * Full vendor onboarding wizard input: profile → business → category →
 * (documents handled client-side) → review.
 */
export const vendorOnboardingSchema = z
  .object({
    fullName: displayName,
    phone: nigerianPhone,
    businessName: displayName,
    sells: z.string().trim().min(10, 'Tell us a bit more about what you offer').max(500),
    vendorCategory: z.enum(VENDOR_CATEGORIES, { message: 'Select what you offer' }),
    trade: z.enum(TRADES).optional(),
    businessAddress: z.string().trim().min(6, 'Enter your business address').max(200),
    /**
     * Optional, but it is the field discovery actually runs on: a business with
     * no area is left out of the campus board and cannot be ranked by distance,
     * so students simply never see it. Asked here so Settings opens filled in
     * rather than asking again — see save_onboarding_business.
     */
    area: z.string().trim().max(80).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.vendorCategory === 'tradesman' && !d.trade) {
      ctx.addIssue({ code: 'custom', message: 'Select your trade', path: ['trade'] });
    }
  });
export type VendorOnboardingInput = z.infer<typeof vendorOnboardingSchema>;
