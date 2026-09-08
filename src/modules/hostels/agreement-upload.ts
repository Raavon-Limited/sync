/**
 * The landlord's own tenancy agreement.
 *
 * WHY IT IS NOT `uploadListingMedia`. That path compresses images, accepts
 * video, and caps at sizes chosen for photographs. An agreement is a PDF and
 * neither of those rules makes sense for one - compressing it would be
 * meaningless and the accepted-types list would refuse it outright.
 *
 * PDF ONLY, AND SAID SO. A tenancy agreement uploaded as a photograph of a
 * page cannot be searched, is usually unreadable at a phone's exposure, and is
 * the format most likely to hide a clause. Refusing anything else is a small
 * cost paid once by the landlord against every tenant who has to read it.
 *
 * IT GOES IN THE PUBLIC BUCKET, DELIBERATELY. This is a document a prospective
 * tenant must be able to read BEFORE they commit - the whole point of
 * `accept_tenancy_terms` is that they saw it first - so it cannot sit behind a
 * grant that only an existing tenant has. It is the same class of thing as the
 * house rules, which have always been public.
 *
 *   Which means: a landlord must not put anything private in it. The upload
 *   control says so.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { LISTING_BUCKET } from './media';

type Client = SupabaseClient<Database>;

export const AGREEMENT_TYPE = 'application/pdf';
/** Generous for a document, and far under the bucket's own ceiling. */
export const MAX_AGREEMENT_BYTES = 8 * 1024 * 1024;

export function agreementRejectReason(file: File): string | null {
  if (file.type !== AGREEMENT_TYPE) {
    return 'The agreement has to be a PDF, so every tenant can read and search it.';
  }
  if (file.size > MAX_AGREEMENT_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 8MB.`;
  }
  return null;
}

/**
 * Upload it and return the public URL.
 *
 * Same own-folder path rule as listing media - storage policy keys write access
 * on the first path segment being the caller's id, so the shape is not
 * cosmetic.
 */
export async function uploadAgreement(
  db: Client,
  input: { userId: string; file: File },
): Promise<string> {
  const reason = agreementRejectReason(input.file);
  if (reason) throw new Error(reason);

  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const token = crypto.randomUUID().slice(0, 8);
  const path = `${input.userId}/agreements/${token}-${safeName}`;

  const { error } = await db.storage.from(LISTING_BUCKET).upload(path, input.file, {
    contentType: AGREEMENT_TYPE,
    // A new object each time rather than replacing the old one: a tenant who
    // agreed to the previous version agreed to THAT document, and overwriting
    // it would rewrite what they consented to. `agreement_version` on the
    // booking records which one they saw.
    upsert: false,
  });
  if (error) throw error;

  const { data } = db.storage.from(LISTING_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
