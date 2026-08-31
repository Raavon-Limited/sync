/**
 * Data access for the 'verification' module.
 *
 * WHAT THIS REPLACES
 * Verification state currently lives in `auth.users.user_metadata` —
 * `verification_status`, `business_name`, `documents[]`. A user can PATCH their
 * own `user_metadata` through the Auth API with nothing but their access token,
 * which means **a vendor can currently self-mark as verified**. That is the
 * "single biggest structural risk" in BACKEND_BLUEPRINT §01.
 *
 * `verification_documents` and `vendor_profiles.verification_status` close it:
 * both are protected by column guards that revert any client write, so status is
 * a staff decision and nothing else. Migrate the onboarding wizard onto these
 * and stop writing verification state to metadata.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { unwrap, unwrapList } from '@/lib/query/helpers';

/* eslint-disable @typescript-eslint/no-explicit-any -- see lib/query/helpers.ts */
type Row = any;
type Client = SupabaseClient<Database>;

/** Mirrors `DocStatus` in src/modules/vendor/types.ts. */
export type DocStatus = 'approved' | 'under_review' | 'needs_action' | 'not_uploaded';

export interface VerificationDocument {
  id: string;
  ownerId: string;
  docType: string;
  title: string;
  storagePath: string;
  status: DocStatus;
  /** Set by staff when a document is rejected — shown to the uploader. */
  actionMessage: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
}

const toDoc = (r: Row): VerificationDocument => ({
  id: r.id,
  ownerId: r.owner_id,
  docType: r.doc_type,
  title: r.title,
  storagePath: r.storage_path,
  status: r.status,
  actionMessage: r.action_message,
  reviewedAt: r.reviewed_at,
  uploadedAt: r.uploaded_at,
});

/** RLS scopes this to the caller's own documents. */
export async function fetchMyDocuments(db: Client): Promise<VerificationDocument[]> {
  const rows = unwrapList<Row>(
    await db
      .from('verification_documents')
      .select('*')
      .order('uploaded_at', { ascending: false }),
  );
  return rows.map(toDoc);
}

/**
 * `status` is omitted deliberately — it defaults to 'under_review' and
 * `guard_verification_document_cols` reverts any attempt to set it. An uploader
 * cannot mark their own document approved.
 */
export async function uploadDocument(
  db: Client,
  input: { ownerId: string; docType: string; title: string; storagePath: string },
): Promise<VerificationDocument> {
  const row = unwrap<Row>(
    await db
      .from('verification_documents')
      .insert({
        owner_id: input.ownerId,
        doc_type: input.docType,
        title: input.title,
        storage_path: input.storagePath,
      })
      .select()
      .single(),
  );
  return toDoc(row);
}

/** Replacing a rejected file. Status stays staff-controlled. */
export async function replaceDocument(
  db: Client,
  id: string,
  storagePath: string,
): Promise<VerificationDocument> {
  const row = unwrap<Row>(
    await db
      .from('verification_documents')
      .update({ storage_path: storagePath, uploaded_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single(),
  );
  return toDoc(row);
}

export async function deleteDocument(db: Client, id: string) {
  const { error } = await db.from('verification_documents').delete().eq('id', id);
  if (error) throw error;
}

// ── The ID card's address ───────────────────────────────────────────────────

/**
 * The caller's own card code.
 *
 * A CAPABILITY, not an identifier. Anyone holding it can open the card page,
 * which shows a photograph — so the column is revoked from `anon` and
 * `authenticated` at the table and only reachable through this owner-scoped
 * function. Never put it in a list, a log, or a URL that is not the card.
 */
export async function fetchMyVerificationCode(db: Client): Promise<string | null> {
  const { data, error } = await db.rpc('my_verification_code');
  if (error) throw error;
  return (data as string | null) ?? null;
}

/**
 * Issue a new code, invalidating every card already printed.
 *
 * This is the "my card was lost" button, and it is destructive in a way worth
 * confirming first: the old code stops resolving the moment this returns.
 */
export async function rotateVerificationCode(db: Client): Promise<string> {
  const { data, error } = await db.rpc('rotate_verification_code');
  if (error) throw error;
  return data as string;
}
