/**
 * Put a completed document set into Storage and describe what landed.
 *
 * EXTRACTED BECAUSE THERE ARE NOW TWO WIZARDS
 *   The vendor wizard and the rider signup collect different fields and submit
 *   through different actions, but the upload between them is identical and
 *   every line of it is a correctness detail somebody already got wrong once:
 *
 *   - THE PATH MUST START WITH THE UPLOADER'S ID. `vdocs_insert_own`
 *     (20260819180000) checks `(storage.foldername(name))[1] = auth.uid()`, so a
 *     flat filename is refused by RLS no matter which bucket it names.
 *   - THE BUCKET IS `verification-docs`. It read `vendor-verification` once   a
 *     name nothing ever created   so every upload failed, and because the
 *     failure was swallowed the wizard submitted an empty document list. The
 *     review step said "4 files" while the reviewer got "0 of 0 documents".
 *   - `upsert: false`, because the bucket grants INSERT and DELETE but not
 *     UPDATE. An upsert onto an existing object is an update and is refused.
 *   - THE INDEX BREAKS TIES. Front and back upload within the same millisecond,
 *     so a timestamp alone had them overwrite each other.
 *
 *   A second copy of that list is a second chance to lose somebody's documents.
 *
 * IT STOPS ON THE FIRST FAILURE, and says which file. Skipping a failed upload
 * and carrying on is what produced submissions that looked complete to the
 * applicant and empty to staff. A half-submitted verification is worse than one
 * that plainly did not go.
 */
import { createClient } from '@/lib/supabase/client';
import { userMessage } from '@/lib/errors';
import { queueForUpload, type DocumentState } from '@/components/verification/document-upload';
import type { VerificationRole } from '@/modules/verification/requirements';

export interface UploadedDocument {
  docType: string;
  subtype?: string | null;
  title: string;
  storagePath: string;
}

export interface UploadProgress {
  done: number;
  total: number;
  label: string;
}

export type UploadResult =
  | { ok: true; uploaded: UploadedDocument[] }
  | { ok: false; error: string };

export async function uploadQueuedDocuments(
  role: VerificationRole,
  state: DocumentState,
  onProgress?: (p: UploadProgress | null) => void,
): Promise<UploadResult> {
  // Each file is described BEFORE it is uploaded, so what reaches
  // verification_documents says WHICH document and WHICH side rather than just
  // naming a path in a bucket.
  const queued = queueForUpload(role, state);
  if (queued.length === 0) return { ok: true, uploaded: [] };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: 'Your session has expired. Sign in again and retry   nothing was submitted.',
    };
  }

  const uploaded: UploadedDocument[] = [];

  for (const [i, item] of queued.entries()) {
    onProgress?.({ done: i, total: queued.length, label: item.title });

    const safe = item.file.name.replace(/[^\w.-]/g, '_');
    const path = `${user.id}/${item.docType}-${Date.now()}-${i}-${safe}`;

    const { error } = await supabase.storage
      .from('verification-docs')
      .upload(path, item.file, { upsert: false });

    if (error) {
      onProgress?.(null);
      return {
        ok: false,
        error: `"${item.title}" did not upload. ${userMessage(
          error,
          'Check your connection and try again.',
        )} Nothing has been submitted.`,
      };
    }

    uploaded.push({
      docType: item.docType,
      subtype: item.subtype,
      title: item.title,
      storagePath: path,
    });
  }

  onProgress?.({ done: queued.length, total: queued.length, label: 'Saving your submission' });
  return { ok: true, uploaded };
}
