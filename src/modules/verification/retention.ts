/**
 * Keeping the verification bucket honest: orphans out, expired files out.
 *
 * TWO JOBS, ONE REASON
 *   A file in `verification-docs` is somebody's face or their government ID.
 *   Both of these exist so that no such file outlives the thing that justified
 *   it — an orphan is justified by nothing at all, and an expired one by a
 *   decision that was made weeks ago.
 *
 * WHY ORPHANS HAPPEN
 *   Uploading is two writes: the object goes to the bucket, then a row goes in
 *   `verification_documents`. They cannot be one transaction — different
 *   systems — so any failure between them leaves a file nothing points at.
 *   That is invisible: not in the admin console, not in a retention sweep that
 *   walks the table, and not removed when an account is deleted.
 *
 * THE GRACE PERIOD IS LOAD-BEARING
 *   A file uploaded seconds ago has not been recorded YET. Deleting anything
 *   younger than the grace window would race the very flow this protects, and
 *   would do it most often on a slow connection — the person least able to
 *   re-upload. Twenty-four hours is far longer than any submission takes.
 *
 * DRY RUN FIRST, ALWAYS. Both functions take `dryRun` and it defaults to true.
 * Deleting somebody's identity documents is not a thing to get wrong quietly.
 */
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';

const BUCKET = 'verification-docs';

/** Never delete an unrecorded file younger than this. See the header. */
const ORPHAN_GRACE_HOURS = 24;

export interface SweepResult {
  dryRun: boolean;
  /** Files with no row, past the grace window. */
  orphans: { path: string; sizeBytes: number }[];
  /** Approved documents past their retention window. */
  expired: { path: string; docType: string; reviewedAt: string }[];
  deleted: number;
  errors: string[];
}

/**
 * Every object in the bucket, as `<owner>/<file>` with its size.
 *
 * Listed per owner folder because Supabase storage `list()` is not recursive —
 * a flat call returns the folders, not what is in them, which is the mistake
 * that makes a reconcile silently find nothing.
 */
async function listAllObjects(): Promise<{ path: string; sizeBytes: number }[]> {
  const admin = createAdminClient();
  const out: { path: string; sizeBytes: number }[] = [];

  const { data: folders, error } = await admin.storage.from(BUCKET).list('', { limit: 1000 });
  if (error) throw new Error(`Could not list ${BUCKET}: ${error.message}`);

  for (const folder of folders ?? []) {
    if (!folder.name) continue;
    const { data: files } = await admin.storage.from(BUCKET).list(folder.name, { limit: 1000 });
    for (const f of files ?? []) {
      if (!f.name) continue;
      out.push({
        path: `${folder.name}/${f.name}`,
        sizeBytes: (f.metadata as { size?: number } | null)?.size ?? 0,
      });
    }
  }
  return out;
}

/**
 * Files in the bucket that no `verification_documents` row points at.
 *
 * Compared against EVERY row including purged ones: a purged row still names
 * the path it used to hold, and re-deleting a file that is already gone is
 * harmless but reporting it as an orphan would be misleading.
 */
export async function reconcileOrphans(dryRun = true): Promise<SweepResult> {
  const admin = createAdminClient();
  const result: SweepResult = { dryRun, orphans: [], expired: [], deleted: 0, errors: [] };

  const { data: rows, error } = await admin.from('verification_documents').select('storage_path');
  if (error) {
    result.errors.push(`Could not read documents: ${error.message}`);
    return result;
  }

  const known = new Set(((rows ?? []) as Row[]).map((r) => r.storage_path as string));
  const objects = await listAllObjects();

  // Age comes from the timestamp the upload path puts in the filename
  // (`<docType>-<epoch-ms>-<i>-<name>`), because storage `created_at` is not
  // returned by `list()` on every version. A name that does not match is
  // treated as OLD rather than new — an unparseable orphan is still an orphan,
  // and the alternative is one that can never be cleaned up.
  const cutoff = Date.now() - ORPHAN_GRACE_HOURS * 3_600_000;
  const uploadedAt = (path: string): number => {
    const m = /-(\d{10,})-/.exec(path);
    return m ? Number(m[1]) : 0;
  };

  result.orphans = objects.filter((o) => !known.has(o.path) && uploadedAt(o.path) < cutoff);

  if (!dryRun && result.orphans.length > 0) {
    const { error: delError } = await admin.storage
      .from(BUCKET)
      .remove(result.orphans.map((o) => o.path));
    if (delError) result.errors.push(`Delete failed: ${delError.message}`);
    else result.deleted += result.orphans.length;
  }

  return result;
}

/**
 * Approved documents whose retention window has passed.
 *
 * The window is the database's rule (`documents_due_for_purge`), not a copy of
 * it here — 3 days for transient proof, 30 for the live photo and government
 * ID. The row survives with `file_purged_at` stamped; only the object goes.
 */
export async function purgeExpiredFiles(dryRun = true): Promise<SweepResult> {
  const admin = createAdminClient();
  const result: SweepResult = { dryRun, orphans: [], expired: [], deleted: 0, errors: [] };

  const rpc = admin.rpc.bind(admin) as unknown as (
    n: string,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  const { data, error } = await rpc('documents_due_for_purge');
  if (error) {
    // Not applied yet is a normal state, not a failure to shout about.
    result.errors.push(`Retention query unavailable: ${error.message}`);
    return result;
  }

  const due = (data ?? []) as Row[];
  result.expired = due.map((d) => ({
    path: d.storage_path as string,
    docType: d.doc_type as string,
    reviewedAt: d.reviewed_at as string,
  }));

  if (dryRun || due.length === 0) return result;

  const { error: delError } = await admin.storage
    .from(BUCKET)
    .remove(due.map((d) => d.storage_path as string));
  if (delError) {
    result.errors.push(`Delete failed: ${delError.message}`);
    return result;
  }

  // Stamped only after the objects are actually gone. The other order would
  // mark a file purged that is still sitting in the bucket, and nothing would
  // ever look at it again.
  // file_purged_at postdates the checked-in generated types. REGENERATE once
  // 20260904120000 is applied and this cast goes.
  const loose = admin as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        in: (c: string, v: string[]) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const { error: stampError } = await loose
    .from('verification_documents')
    .update({ file_purged_at: new Date().toISOString() })
    .in(
      'id',
      due.map((d) => d.id as string),
    );
  if (stampError) result.errors.push(`Could not stamp rows: ${stampError.message}`);

  result.deleted += due.length;
  return result;
}
