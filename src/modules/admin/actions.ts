/**
 * Staff-only mutations, run on the server with the service-role client.
 *
 * WHY SERVICE ROLE AND NOT RLS
 *   Admin work is cross-tenant by definition: approving a vendor means writing
 *   a row that belongs to someone else. Rather than add staff-bypass policies
 *   to every table, admin screens use the service-role client — which is why
 *   every function here re-checks the caller's role FIRST. The guard is the
 *   only thing standing between a signed-in student and the whole database, so
 *   it is repeated per action rather than assumed from the route.
 *
 * WHAT THE SCHEMA DOES NOT SUPPORT
 *   The admin UI was designed around NIN checks, liveness selfies, business
 *   photos and store inspections. None of those exist as tables. Verification
 *   here is what the schema models: documents with a status, and a vendor with
 *   a verification status derived from them.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { adminRoleForEmail } from '@/lib/admin-emails';
import { userMessage } from '@/lib/errors';

export type DocDecision = 'approved' | 'needs_action';
export type VendorDecision = 'verified' | 'rejected' | 'pending';

/** Throws unless the caller is staff. Every action calls this first. */
async function assertStaff(): Promise<string> {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  const role = profile?.role ?? adminRoleForEmail(user?.email);
  if (role !== 'admin' && role !== 'super_admin') {
    throw new Error('Not authorised');
  }
  if (!user?.id) throw new Error('Not authenticated');
  return user.id;
}

/**
 * Approve or bounce a single document.
 *
 * `action_message` is required when bouncing: "needs action" without saying
 * what action is the most common way a verification queue stalls.
 */
export async function reviewDocument(input: {
  documentId: string;
  decision: DocDecision;
  message?: string;
}) {
  const reviewerId = await assertStaff();

  if (input.decision === 'needs_action' && !input.message?.trim()) {
    throw new Error('Say what needs fixing');
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('verification_documents')
    .update({
      status: input.decision,
      action_message: input.decision === 'needs_action' ? input.message!.trim() : null,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', input.documentId);

  if (error) throw new Error(userMessage(error, 'We could not save that decision.'));
  revalidatePath('/admin/vendors');
}

/**
 * Set a vendor's overall verification status.
 *
 * Deliberately NOT automatic on the last document being approved: a human
 * decides a vendor is real. The screen shows how many documents are approved so
 * that decision is informed, but it does not make it for them.
 */
export async function setVendorVerification(input: { vendorId: string; decision: VendorDecision }) {
  await assertStaff();

  // THROUGH THE RPC, NOT A COLUMN WRITE.
  //
  // This used to update `vendor_profiles.verification_status` directly with the
  // service-role client, and it never worked: `guard_vendor_profile_cols`
  // reverts that column whenever `current_user` is 'authenticated', which — as
  // 20260830100000 documents — is every PostgREST request, service-role
  // included. The approval returned success and changed nothing, which is why
  // verified vendors stayed locked out of their own dashboards.
  //
  // `set_verification_status` raises the transaction-local flag the guard
  // honours, re-checks `is_staff()` inside the database rather than trusting
  // that we checked out here, and writes an audit row naming the reviewer.
  //
  // CALLED WITH THE USER'S SESSION, NOT THE SERVICE ROLE — the RPC's own
  // is_staff() reads auth.uid(), and the service-role client has no user
  // session, so auth.uid() would be NULL and the call refused. Same reasoning
  // as resolveDispute below.
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('set_verification_status', {
    p_vendor: input.vendorId,
    p_status: input.decision,
  });

  if (error) throw new Error(userMessage(error, 'We could not update this verification.'));
  revalidatePath('/admin/vendors');
}

/**
 * A time-limited link to a document in the private bucket.
 *
 * `verification-docs` is private and holds ID documents. Nothing here returns a
 * permanent URL — the link expires so a leaked admin screenshot does not become
 * a leaked passport.
 */
export async function getDocumentUrl(storagePath: string): Promise<string> {
  await assertStaff();
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from('verification-docs')
    .createSignedUrl(storagePath, 60 * 5);
  if (error) throw new Error(userMessage(error, 'We could not open that document.'));
  return data.signedUrl;
}

/**
 * Resolve a dispute.
 *
 * CALLED WITH THE USER'S SESSION, NOT THE SERVICE ROLE.
 *   `resolve_dispute` is SECURITY DEFINER and gates on `is_staff()`, which
 *   reads `auth.uid()`. The service-role client has no user session, so
 *   auth.uid() is NULL, is_staff() is false, and every call would be refused.
 *   Using the request-scoped client means the RPC's own guard does its job —
 *   defence in depth rather than a guard that can never fire.
 */
export async function resolveDispute(input: {
  disputeId: string;
  resolution: 'refund_full' | 'refund_partial' | 'release_vendor' | 'no_action' | string;
  refundKobo?: number;
  notes?: string;
}) {
  await assertStaff();

  const db = await createServerClient();
  const { error } = await db.rpc('resolve_dispute', {
    p_dispute_id: input.disputeId,
    p_resolution: input.resolution,
    p_refund_kobo: input.refundKobo,
    p_notes: input.notes,
  });
  if (error) throw new Error(userMessage(error, 'We could not resolve this dispute.'));
  revalidatePath('/admin/disputes');
}

/**
 * Decide a hostel verification visit.
 *
 * The visit row records what an ambassador saw; `hostels.verified` is what
 * students see. They are updated together because a verified visit that leaves
 * the hostel unverified is a decision nobody can act on — and an unverified
 * hostel with a "Verified" visit reads as a bug to whoever looks next.
 */
export async function decideHostelVisit(input: {
  visitId: string;
  hostelId: string;
  decision: 'Verified' | 'Rejected';
  notes?: string;
}) {
  const reviewerId = await assertStaff();
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error: visitErr } = await admin
    .from('hostel_verification_visits')
    .update({
      status: input.decision,
      decided_by: reviewerId,
      decided_at: now,
      notes: input.notes?.trim() || undefined,
      updated_at: now,
    })
    .eq('id', input.visitId);
  if (visitErr) throw new Error(userMessage(visitErr, 'We could not save that visit.'));

  const { error: hostelErr } = await admin
    .from('hostels')
    .update({ verified: input.decision === 'Verified', updated_at: now })
    .eq('id', input.hostelId);
  if (hostelErr) {
    throw new Error(userMessage(hostelErr, 'The visit was saved, but the hostel was not updated.'));
  }

  revalidatePath('/admin/verify-visits');
}

/** Assign an ambassador and put a visit on the calendar. */
export async function scheduleHostelVisit(input: {
  hostelId: string;
  ambassadorId: string | null;
  scheduledFor: string;
}) {
  await assertStaff();
  const admin = createAdminClient();

  // One live visit per hostel: scheduling again updates the existing row rather
  // than leaving two open visits nobody knows which to act on.
  const { data: existing } = await admin
    .from('hostel_verification_visits')
    .select('id')
    .eq('hostel_id', input.hostelId)
    .not('status', 'in', '("Verified","Rejected")')
    .maybeSingle();

  const payload = {
    hostel_id: input.hostelId,
    ambassador_id: input.ambassadorId,
    scheduled_for: input.scheduledFor,
    status: 'Visit Scheduled' as const,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await admin.from('hostel_verification_visits').update(payload).eq('id', existing.id)
    : await admin.from('hostel_verification_visits').insert(payload);

  if (error) throw new Error(userMessage(error, 'We could not schedule that visit.'));
  revalidatePath('/admin/verify-visits');
}

/**
 * Platform settings.
 *
 * `app_settings.value` is jsonb, so a number and a string are both valid and
 * indistinguishable at the column. The caller says which it is, because writing
 * `"10"` where `10` was expected silently breaks `private.setting_int` — it
 * falls back to the default and nobody finds out until the money is wrong.
 */
export async function updateSetting(input: {
  key: string;
  value: number | string;
  kind: 'number' | 'string';
}) {
  const editorId = await assertStaff();

  if (input.kind === 'number') {
    const n = Number(input.value);
    if (!Number.isFinite(n) || n < 0) throw new Error('Must be a number, zero or more');
    // Percentages are the settings most likely to be fat-fingered, and a 1000%
    // commission would empty every vendor payout before anyone noticed.
    if (input.key.endsWith('_pct') && n > 100) throw new Error('A percentage cannot exceed 100');
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('app_settings')
    .update({
      value: input.kind === 'number' ? Number(input.value) : String(input.value),
      updated_by: editorId,
      updated_at: new Date().toISOString(),
    })
    .eq('key', input.key);

  if (error) throw new Error(userMessage(error, 'We could not save that setting.'));
  revalidatePath('/admin/settings');
}

/** Toggle a feature flag, or move its rollout percentage. */
export async function updateFeatureFlag(input: {
  key: string;
  enabled?: boolean;
  rolloutPct?: number;
}) {
  const editorId = await assertStaff();

  if (input.rolloutPct != null && (input.rolloutPct < 0 || input.rolloutPct > 100)) {
    throw new Error('Rollout must be between 0 and 100');
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('feature_flags')
    .update({
      ...(input.enabled != null ? { enabled: input.enabled } : {}),
      ...(input.rolloutPct != null ? { rollout_pct: input.rolloutPct } : {}),
      updated_by: editorId,
      updated_at: new Date().toISOString(),
    })
    .eq('key', input.key);

  if (error) throw new Error(userMessage(error, 'We could not save that flag.'));
  revalidatePath('/admin/settings');
}
