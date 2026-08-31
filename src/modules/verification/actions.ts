/**
 * Server Actions for the 'verification' module.
 * Every action must:
 *   1. Run on the server ('use server').
 *   2. Re-validate input with a zod schema from @/lib/validations.
 *   3. Use the server Supabase client (@/lib/supabase/server).
 *   4. Return a typed result, never throw raw errors to the client.
 */
'use server';

import { createClient } from '@/lib/supabase/server';
import { userMessage } from '@/lib/errors';
import {
  vendorOnboardingSchema,
  vendorVerificationSchema,
  type VendorOnboardingInput,
  type VendorVerificationInput,
} from '@/lib/validations';
import type { VerificationResult } from './types';

/**
 * Submit the full vendor onboarding wizard. Stores profile + business +
 * category + document paths on the user's metadata and flips status to
 * `pending` for admin review (/admin/vendors + /admin/verify-visits).
 *
 * `documentPaths` are Supabase Storage object paths uploaded client-side
 * (best-effort); empty if Storage isn't wired yet.
 *
 * THE CATEGORY GOES TO `profiles`, NOT JUST TO METADATA.
 *   `auth.updateUser` writes user_metadata, and the only trigger that copies
 *   metadata into `profiles` fires AFTER INSERT on auth.users. So for the
 *   whole life of this wizard the category chosen in step 3 went nowhere the
 *   app reads: the proxy gate, current_app_role(), every RLS policy and the
 *   admin verification queue all read `profiles`. Someone who picked landlord
 *   at signup and food here finished onboarding as role='landlord', got sent
 *   to /vendor, and was refused by the gate on the page they had just earned.
 *
 *   `set_vendor_category` is the write that counts, and it moves the business
 *   role along with the category. The metadata write is kept because
 *   /onboarding prefills from it, but it is now the copy, not the original.
 *
 * TODO: when the identity provider (Smile ID / Dojah) is live, verify ID
 * server-side here, and persist to a `vendor_verifications` table.
 */
export async function submitVendorOnboarding(
  input: VendorOnboardingInput,
  documentPaths: string[] = [],
): Promise<VerificationResult> {
  const parsed = vendorOnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid details' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You need to be signed in to continue.' };

  const { fullName, phone, businessName, sells, vendorCategory, trade, businessAddress, area } =
    parsed.data;
  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: fullName,
      phone,
      verification_status: 'pending',
      business_name: businessName,
      sells,
      vendor_category: vendorCategory,
      trade: vendorCategory === 'tradesman' ? (trade ?? null) : null,
      business_address: businessAddress,
      area: area ?? null,
      documents: documentPaths,
    },
  });
  if (error) {
    return { ok: false, error: userMessage(error, 'We could not save your details. Try again.') };
  }

  // Ordered deliberately: metadata first, then the row that decides what this
  // account IS. If the category write fails the submission is refused outright
  // rather than left half-applied - a vendor sitting in `pending` under the
  // wrong category is reviewed, and approved, as the wrong kind of business.
  const { data: role, error: categoryError } = await supabase.rpc('set_vendor_category', {
    p_category: vendorCategory,
    p_trade: vendorCategory === 'tradesman' ? (trade ?? null) : null,
  });
  if (categoryError) {
    return {
      ok: false,
      error: userMessage(
        categoryError,
        'We could not finish setting up your business. Try again in a moment.',
      ),
    };
  }

  // THE DETAILS HAVE TO LAND IN A TABLE, NOT JUST IN METADATA.
  //
  // Everything in the metadata write above goes to
  // `auth.users.raw_user_meta_data`, which is read exactly once — by
  // handle_new_user, at signup. So the business name and address a vendor
  // typed here reached nothing the app queries, and Settings (which reads
  // `vendor_profiles`) opened with empty boxes asking for all of it again.
  //
  // AFTER set_vendor_category AND BEFORE submit_verification, and both halves
  // of that matter:
  //   - after, because this calls ensure_vendor_profile(), which refuses an
  //     account with no business role — and the category write is what grants
  //     it. Someone signing up as a student and becoming a vendor here has no
  //     business role until the call above returns.
  //   - before, because claiming the name can legitimately fail (somebody
  //     already trades under it), and a vendor already moved into the review
  //     queue under a business that does not exist is the worse failure.
  const { error: businessError } = await supabase.rpc('save_onboarding_business', {
    p_business_name: businessName,
    p_business_address: businessAddress,
    p_phone: phone,
    p_area: area ?? null,
    p_bio: sells,
  });
  if (businessError) {
    return {
      ok: false,
      error: userMessage(businessError, 'We could not save your business details. Try again.'),
    };
  }

  // THE WRITE THAT ACTUALLY PUTS THEM IN THE QUEUE.
  //
  // `verification_status` in the metadata above reaches nothing: it is read
  // exactly once, by handle_new_user, at signup. Setting it here left both
  // `profiles` and `vendor_profiles` on 'unverified', so a vendor who had just
  // submitted their documents saw "verify your account" as though the
  // submission had been lost, and the admin queue never listed them.
  //
  // `submit_verification` writes vendor_profiles — the authority — and its
  // mirror trigger carries the value to profiles, which is what the dashboard
  // gate reads. See 20260901100000.
  const { error: submitError } = await supabase.rpc('submit_verification');
  if (submitError) {
    return {
      ok: false,
      error: userMessage(
        submitError,
        'We saved your details but could not submit them for review. Try again in a moment.',
      ),
    };
  }

  return { ok: true, role: role ?? undefined };
}

/**
 * Submit a vendor's verification details. Flips their status to `pending` for
 * an admin to approve (see /admin/vendors + /admin/verify-visits) and stores
 * the business details on the user's metadata.
 *
 * `locationPhotoPath` is the Storage object path of the business-location photo
 * uploaded client-side (best-effort); null if Storage isn't wired yet.
 *
 * TODO: when the identity provider (Smile ID / Dojah) is live, verify the
 * liveness result server-side here instead of trusting the client flag, and
 * persist the submission to a `vendor_verifications` table rather than metadata.
 */
export async function submitVendorVerification(
  input: VendorVerificationInput,
  locationPhotoPath?: string | null,
): Promise<VerificationResult> {
  const parsed = vendorVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid details' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You need to be signed in to verify your business.' };

  const { businessName, sells, businessAddress } = parsed.data;
  const { error } = await supabase.auth.updateUser({
    data: {
      // `liveness_confirmed: true` was here and is gone. It came from a
      // checkbox in the form, which means it was the applicant asserting a
      // fact about their own face — see the note in the zod schema. Nothing
      // reads it, and leaving it would let a future reader mistake it for
      // evidence.
      //
      // `verification_status` stays only because /onboarding prefills from
      // metadata. It is NOT the status: submit_verification() below is, and it
      // is the only thing that moves the column a reviewer looks at.
      verification_status: 'pending',
      business_name: businessName,
      sells,
      business_address: businessAddress,
      business_location_photo: locationPhotoPath ?? null,
    },
  });
  if (error) {
    return {
      ok: false,
      error: userMessage(error, 'We could not submit your details. Try again.'),
    };
  }

  // Same reason as the wizard above: the metadata write is a record of what
  // they typed, not a status change. This is the status change.
  const { error: submitError } = await supabase.rpc('submit_verification');
  if (submitError) {
    return {
      ok: false,
      error: userMessage(
        submitError,
        'We saved your details but could not submit them for review. Try again in a moment.',
      ),
    };
  }

  return { ok: true };
}
