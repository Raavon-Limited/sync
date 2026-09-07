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
/**
 * One uploaded file, already in Storage, described well enough for a reviewer
 * to know what they are opening.
 *
 * `subtype` is the specific document   'nin', 'passport'   and it is the whole
 * reason this replaced a bare `string[]` of paths. `doc_type: 'gov_id'` alone
 * told the review queue that SOME identity document had arrived and nothing
 * about which, so a reviewer had to open every file to find out what it was
 * meant to be.
 */
export interface UploadedDocument {
  /** Matches a `key` in modules/verification/requirements. */
  docType: string;
  /** A `doc_subtype` value from that requirement's `options`. */
  subtype?: string | null;
  /** What the reviewer sees in the queue, e.g. "NIN slip or card (front)". */
  title: string;
  storagePath: string;
}

export async function submitVendorOnboarding(
  input: VendorOnboardingInput,
  documents: UploadedDocument[] = [],
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
      documents: documents.map((d) => d.storagePath),
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
    // `undefined`, not `null`: p_trade has a SQL default, so the generated type
    // is optional and an explicit null is a type error (see docs/DATA_LAYER).
    p_trade: vendorCategory === 'tradesman' ? (trade ?? undefined) : undefined,
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
  // `auth.users.raw_user_meta_data`, which is read exactly once   by
  // handle_new_user, at signup. So the business name and address a vendor
  // typed here reached nothing the app queries, and Settings (which reads
  // `vendor_profiles`) opened with empty boxes asking for all of it again.
  //
  // AFTER set_vendor_category AND BEFORE submit_verification, and both halves
  // of that matter:
  //   - after, because this calls ensure_vendor_profile(), which refuses an
  //     account with no business role   and the category write is what grants
  //     it. Someone signing up as a student and becoming a vendor here has no
  //     business role until the call above returns.
  //   - before, because claiming the name can legitimately fail (somebody
  //     already trades under it), and a vendor already moved into the review
  //     queue under a business that does not exist is the worse failure.
  const { error: businessError } = await supabase.rpc('save_onboarding_business', {
    p_business_name: businessName,
    p_business_address: businessAddress,
    p_phone: phone,
    p_area: area ?? undefined,
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
  // `submit_verification` writes vendor_profiles   the authority   and its
  // mirror trigger carries the value to profiles, which is what the dashboard
  // gate reads. See 20260901100000.
  // THE DOCUMENTS HAVE TO LAND IN A TABLE TOO, and until now they did not.
  //
  // The uploaded paths went into `user_metadata.documents` and nowhere else.
  // `verification_documents` is what /admin/vendors reads, so every vendor who
  // uploaded an ID reached a reviewer showing "0 of 0 documents"   and since
  // set_verification_status refuses to verify an account with nothing
  // approved, the submission could not be actioned at all. The files existed in
  // Storage with nothing pointing at them.
  //
  // BEFORE submit_verification, so the queue entry a reviewer opens already has
  // its documents attached. The staff notification fires off the status change;
  // arriving at an empty folder because the rows landed a moment later is the
  // race worth avoiding.
  //
  // Best-effort, deliberately. RLS lets an owner insert their own rows, but a
  // failure here must not strand somebody whose files uploaded and whose
  // details saved   the submission still goes through and the gap is visible
  // to staff as a missing document rather than as a lost account.
  //
  // AND THEY CARRY THE APPLICATION THEY BELONG TO.
  //
  // This insert was the last write path still leaving `role` null, and null
  // means "applies to every role" (20260905210000). So a landlord finishing
  // this wizard filed their live photo and their NIN against the PERSON, and
  // they surfaced in the student folder of the same account: newer than the
  // student's own approved copies, which the review screen then marked
  // REPLACED   one application's evidence superseding another's.
  //
  // The category chosen in this very wizard is the answer, so there is nothing
  // to infer. 'landlord' is its own application; every other category is a
  // business one.
  if (documents.length) {
    const documentRole = vendorCategory === 'landlord' ? 'landlord' : 'vendor';
    const { error: docsError } = await supabase.from('verification_documents').insert(
      documents.map((d) => ({
        owner_id: user.id,
        role: documentRole,
        doc_type: d.docType,
        doc_subtype: d.subtype ?? null,
        title: d.title,
        storage_path: d.storagePath,
      })),
    );
    if (docsError) {
      console.error('[verification] could not record documents', docsError.message);
    }
  }

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
      // fact about their own face   see the note in the zod schema. Nothing
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

/**
 * Put an account with no authority table into the review queue   a student
 * today, a creator or event manager once those roles open.
 *
 * There is nothing to save first, which is the whole difference from the
 * vendor path above. A business submits a name, what it sells and an address
 * alongside its documents; a student's details were all collected at signup,
 * so the documents are the submission and this is only the status change.
 *
 * THE RPC IS A DIFFERENT ONE, DELIBERATELY. `submit_verification` writes
 * `vendor_profiles` and calls `ensure_vendor_profile()` on the way   a student
 * calling it would be handed a business row they never asked for, and the
 * category trigger would start treating them as one. See 20260903120000.
 *
 * It also refuses an empty submission, so the queue never fills with folders a
 * reviewer can only bounce.
 */
export async function submitPersonalVerification(): Promise<VerificationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You need to be signed in to submit your documents.' };

  /**
   * Cast, because the checked-in generated types predate 20260903120000.
   * Same escape hatch as modules/admin/roles and modules/access/guard
   * REGENERATE once the migration is applied and this goes.
   */
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
  ) => Promise<{ error: { message: string; code?: string } | null }>;
  const { error } = await rpc('submit_personal_verification');
  if (error) {
    return {
      ok: false,
      error: userMessage(error, 'We could not submit your documents. Try again in a moment.'),
    };
  }

  return { ok: true };
}
