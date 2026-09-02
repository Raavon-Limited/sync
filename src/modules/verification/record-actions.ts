/**
 * Writing the `verification_documents` rows for files that have already been
 * uploaded to storage.
 *
 * WHY THIS EXISTS AS ITS OWN THING
 *   `uploadQueuedDocuments` puts files in the bucket and returns their paths.
 *   It does NOT write the rows - it never has - and every caller was expected
 *   to do that itself. submitVendorOnboarding does. The verify screen did not,
 *   so an organiser's files landed in storage, no row was ever written, and
 *   `submit_personal_verification` counted zero documents and refused the
 *   submission with "Upload your photo and ID" to somebody who just had.
 *
 *   A shared step is the fix. A rule that says "remember to also insert the
 *   rows" is a rule that gets forgotten by the next caller, and the symptom is
 *   invisible: the upload succeeds, the files are really there, and only the
 *   count is wrong.
 *
 * BEST-EFFORT, DELIBERATELY - the same call submitVendorOnboarding makes.
 * RLS lets an owner insert their own rows, and a failure here must not strand
 * somebody whose files uploaded: the gap shows to staff as a missing document
 * rather than as a lost account. The caller decides whether to continue.
 */
'use server';

import type { VerificationRole } from '@/modules/verification/requirements';
import { createClient } from '@/lib/supabase/server';
import type { UploadedDocument } from '@/components/verification/upload-documents';

export type RecordResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * WHICH APPLICATION THESE BELONG TO IS NOT OPTIONAL.
 *
 * One person can hold three of these roles and each is asked for its own
 * evidence. Before the role was stored, a live photo taken for a student
 * application and one taken for a landlord application were the same row-shape
 * about the same owner   so the newer read as having REPLACED the older, and a
 * reviewer deciding one role was shown the other role's photograph. See
 * 20260905210000.
 */
export async function recordVerificationDocuments(
  documents: UploadedDocument[],
  role: VerificationRole,
): Promise<RecordResult> {
  if (documents.length === 0) return { ok: true, count: 0 };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Your session expired. Sign in and try again.' };

  const { error } = await supabase.from('verification_documents').insert(
    documents.map((d) => ({
      owner_id: user.id,
      role,
      doc_type: d.docType,
      doc_subtype: d.subtype ?? null,
      title: d.title,
      storage_path: d.storagePath,
    })),
  );

  if (error) {
    console.error('[verification] could not record documents', error.message);
    return { ok: false, error: 'Your files uploaded but we could not record them. Try again.' };
  }

  return { ok: true, count: documents.length };
}
