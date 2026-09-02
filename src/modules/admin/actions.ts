/**
 * Staff-only mutations, run on the server with the service-role client.
 *
 * WHY SERVICE ROLE AND NOT RLS
 *   Admin work is cross-tenant by definition: approving a vendor means writing
 *   a row that belongs to someone else. Rather than add staff-bypass policies
 *   to every table, admin screens use the service-role client   which is why
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
import { isStaffRole } from '@/modules/admin/guard';
import { accessLevel, assertArea } from '@/modules/access/guard';
import { userMessage } from '@/lib/errors';
import { notifyVerification } from '@/modules/admin/verification-mail';
import { mailCount } from '@/modules/admin/mail';
import type { Row } from '@/lib/supabase/row';

export type DocDecision = 'approved' | 'needs_action';
export type VendorDecision = 'verified' | 'rejected' | 'pending';

/**
 * Tell the person what was decided.
 *
 * FIRE AND FORGET, ON PURPOSE. The decision is already written by the time
 * this runs. Throwing here would put an error on the screen over work that
 * succeeded, and the natural response   click Verify again   would send the
 * mail twice. A failure is logged in modules/admin/verification-mail; the
 * status is the record, the email is the courtesy.
 *
 * Only a FINAL decision is announced. Moving somebody back to pending is a
 * reviewer working, not news   nothing is being asked of them and nothing has
 * been settled.
 */
async function announce(userId: string, decision: VendorDecision, subject: string, path: string) {
  if (decision === 'pending') return;
  await notifyVerification({
    userId,
    outcome: decision === 'verified' ? 'verified' : 'rejected',
    subject,
    path,
  });
}

/**
 * Throws unless the caller is staff. Every action calls this first.
 *
 * Reads profiles.role and nothing else. It used to fall back to the
 * ADMIN_EMAILS allowlist, which meant an env var could authorise a write that
 * is_staff() in the database would then refuse - access that looked real right
 * up to the moment it mattered.
 */
async function assertStaff(): Promise<string> {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  if (!isStaffRole(profile?.role)) throw new Error('Not authorised');
  if (!user?.id) throw new Error('Not authenticated');
  return user.id;
}

/**
 * Staff, AND granted this area   the check every write below starts with.
 *
 * WHY IT IS NOT ENOUGH TO GUARD THE PAGE
 *   Everything in this file uses the service-role client, which is above RLS by
 *   construction. So for these writes there is no database policy waiting
 *   underneath to catch a caller who never loaded the page: this line IS the
 *   enforcement. A reviewer who cannot see Settings can still POST to the
 *   action behind it, and until this landed, that worked.
 *
 * The level check runs as the CALLER (the server client, their session), not
 * as the service role, so `access_level` sees the person and not the key.
 */
async function assertStaffArea(area: string, needed: 'read' | 'write' = 'write'): Promise<string> {
  const userId = await assertStaff();
  await assertArea(area, needed);
  return userId;
}

/**
 * The same, for a write that legitimately belongs to more than one area.
 *
 * Document review is the honest case: one queue reviews vendors, landlords and
 * riders, and somebody granted only `riders` should be able to decide a rider's
 * documents without also being handed vendors. Requiring all three would make
 * the narrow grant useless; requiring none would make it decorative.
 */
async function assertStaffAnyArea(
  areas: string[],
  needed: 'read' | 'write' = 'write',
): Promise<string> {
  const userId = await assertStaff();
  const levels = await Promise.all(areas.map((a) => accessLevel(a)));
  const ok = levels.some((l) => (needed === 'read' ? l !== 'none' : l === 'write'));
  if (!ok) throw new Error('You do not have access to do that');
  return userId;
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
  const reviewerId = await assertStaffAnyArea(['vendors', 'landlords', 'riders', 'students']);

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
  // VerificationReview renders on the landlord page too, and a decision made
  // there was writing to the database without ever refreshing the screen it was
  // made on: the document sat at "under review" until a manual reload. A
  // dynamic segment needs the route PATTERN plus a type, not a filled-in slug.
  revalidatePath('/admin/landlord/[slug]', 'page');
}

/**
 * Set a vendor's overall verification status.
 *
 * Deliberately NOT automatic on the last document being approved: a human
 * decides a vendor is real. The screen shows how many documents are approved so
 * that decision is informed, but it does not make it for them.
 */
export async function setVendorVerification(input: {
  vendorId: string;
  decision: VendorDecision;
  /**
   * Fraud, not a blurry photo. A permanent rejection is the only decision that
   * stops a business re-submitting; every other outcome lifts it again, so a
   * reviewer who blocks in error can undo it by deciding again.
   */
  permanent?: boolean;
}) {
  await assertStaffArea('vendors');

  // THROUGH THE RPC, NOT A COLUMN WRITE.
  //
  // This used to update `vendor_profiles.verification_status` directly with the
  // service-role client, and it never worked: `guard_vendor_profile_cols`
  // reverts that column whenever `current_user` is 'authenticated', which   as
  // 20260830100000 documents   is every PostgREST request, service-role
  // included. The approval returned success and changed nothing, which is why
  // verified vendors stayed locked out of their own dashboards.
  //
  // `set_verification_status` raises the transaction-local flag the guard
  // honours, re-checks `is_staff()` inside the database rather than trusting
  // that we checked out here, and writes an audit row naming the reviewer.
  //
  // CALLED WITH THE USER'S SESSION, NOT THE SERVICE ROLE   the RPC's own
  // is_staff() reads auth.uid(), and the service-role client has no user
  // session, so auth.uid() would be NULL and the call refused. Same reasoning
  // as resolveDispute below.
  const supabase = await createServerClient();
  // `p_permanent` IS SENT ONLY WHEN TRUE, and that is not tidiness.
  //
  // PostgREST resolves an RPC by the exact set of argument names it is given.
  // Before 20260901260000 landed, the function was still the two-argument form
  // and naming a third made the call resolve to nothing   so sending
  // `p_permanent: false` on every decision would have broken Verify and Reject
  // against an un-migrated database. That migration is applied now, but the
  // shape is worth keeping: it is what makes an ordinary decision independent
  // of whether the fraud-block signature exists.
  const { error } = await supabase.rpc('set_verification_status', {
    p_vendor: input.vendorId,
    p_status: input.decision,
    ...(input.permanent ? { p_permanent: true } : {}),
  });

  if (error) throw new Error(userMessage(error, 'We could not update this verification.'));

  // A landlord and a shop get different words and different dashboards, and
  // vendorId IS the owner profile id, so one lookup answers both.
  const admin = createAdminClient();
  const { data: biz } = await admin
    .from('vendor_profiles')
    .select('category')
    .eq('id', input.vendorId)
    .maybeSingle();
  const isLandlord = ((biz as Row | null)?.category as string) === 'landlord';
  await announce(
    input.vendorId,
    input.decision,
    isLandlord ? 'landlord' : 'business',
    isLandlord ? '/landlord/settings' : '/vendor/settings',
  );

  revalidatePath('/admin/vendors');
  revalidatePath('/admin/landlord/[slug]', 'page');
}

/**
 * A time-limited link to a document in the private bucket.
 *
 * `verification-docs` is private and holds ID documents. Nothing here returns a
 * permanent URL   the link expires so a leaked admin screenshot does not become
 * a leaked passport.
 */
export async function getDocumentUrl(storagePath: string): Promise<string> {
  await assertStaffAnyArea(['vendors', 'landlords', 'riders', 'students', 'verification'], 'read');
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from('verification-docs')
    .createSignedUrl(storagePath, 60 * 5);
  if (error) throw new Error(userMessage(error, 'We could not open that document.'));
  return data.signedUrl;
}

/**
 * Signed links for a whole folder at once, keyed by storage path.
 *
 * ONE ROUND TRIP, BECAUSE THE REVIEW SCREEN NEEDS THEM ALL AT ONCE. The point
 * of that screen is comparing a live photo against an ID   you cannot compare
 * two things you have to open one at a time, so every document is rendered
 * inline and every one needs a URL before first paint. Calling the single
 * version in a loop would be four server actions per business and a visible
 * cascade of images popping in.
 *
 * A MISSING FILE IS OMITTED, NOT THROWN. One unreadable object must not blank
 * the entire review   the reviewer still needs to see the other three, and a
 * tile with no preview says "this one is missing" far more usefully than an
 * error page does.
 *
 * The links expire in 5 minutes, same as the single version: long enough to
 * review, short enough that a leaked admin screenshot is not a leaked passport.
 */
export async function getDocumentUrls(storagePaths: string[]): Promise<Record<string, string>> {
  await assertStaffAnyArea(['vendors', 'landlords', 'riders', 'verification'], 'read');
  if (storagePaths.length === 0) return {};

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from('verification-docs')
    .createSignedUrls(storagePaths, 60 * 5);

  if (error) {
    console.error('[verification] could not sign documents', error.message);
    return {};
  }

  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    // `path` comes back null on the entries that failed; those are the missing
    // objects and they are simply left out of the map.
    if (row.signedUrl && row.path) out[row.path] = row.signedUrl;
  }
  return out;
}

/**
 * Resolve a dispute.
 *
 * CALLED WITH THE USER'S SESSION, NOT THE SERVICE ROLE.
 *   `resolve_dispute` is SECURITY DEFINER and gates on `is_staff()`, which
 *   reads `auth.uid()`. The service-role client has no user session, so
 *   auth.uid() is NULL, is_staff() is false, and every call would be refused.
 *   Using the request-scoped client means the RPC's own guard does its job
 *   defence in depth rather than a guard that can never fire.
 */
export async function resolveDispute(input: {
  disputeId: string;
  resolution: 'refund_full' | 'refund_partial' | 'release_vendor' | 'no_action' | string;
  refundKobo?: number;
  notes?: string;
}) {
  await assertStaffArea('disputes');

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
 * the hostel unverified is a decision nobody can act on   and an unverified
 * hostel with a "Verified" visit reads as a bug to whoever looks next.
 */
export async function decideHostelVisit(input: {
  visitId: string;
  hostelId: string;
  decision: 'Verified' | 'Rejected';
  notes?: string;
}) {
  const reviewerId = await assertStaffArea('verify_visits');
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
  await assertStaffArea('verify_visits');
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
 * `"10"` where `10` was expected silently breaks `private.setting_int`   it
 * falls back to the default and nobody finds out until the money is wrong.
 */
export async function updateSetting(input: {
  key: string;
  value: number | string;
  kind: 'number' | 'string';
}) {
  const editorId = await assertStaffArea('settings');

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
  const editorId = await assertStaffArea('settings');

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

/**
 * Decide a rider's verification.
 *
 * A separate action from setVendorVerification because it is a separate RPC
 * writing a separate table   see the header on 20260901270000 for why the
 * database does not take an entity-type argument and switch on it.
 *
 * Called with the USER'S session for the same reason as every other RPC here:
 * `set_rider_verification` checks `is_staff()` against `auth.uid()`, which is
 * NULL on the service-role client.
 */
export async function setRiderVerification(input: {
  riderId: string;
  decision: VendorDecision;
  /** Fraud. Blocks re-application until a later decision lifts it. */
  permanent?: boolean;
}) {
  await assertStaffArea('riders');

  const supabase = await createServerClient();
  const { error } = await supabase.rpc('set_rider_verification', {
    p_rider: input.riderId,
    p_status: input.decision,
    ...(input.permanent ? { p_permanent: true } : {}),
  });

  if (error) throw new Error(userMessage(error, 'We could not update this rider.'));
  await announce(input.riderId, input.decision, 'rider', '/rider');
  revalidatePath('/admin/riders');
  revalidatePath('/admin/verification');
}

/** Decide a logistics company's verification. Its documents live on the owner's profile. */
export async function setCompanyVerification(input: {
  companyId: string;
  decision: VendorDecision;
  permanent?: boolean;
}) {
  await assertStaffArea('riders');

  const supabase = await createServerClient();
  const { error } = await supabase.rpc('set_company_verification', {
    p_company: input.companyId,
    p_status: input.decision,
    ...(input.permanent ? { p_permanent: true } : {}),
  });

  if (error) throw new Error(userMessage(error, 'We could not update this company.'));
  revalidatePath('/admin/riders');
  revalidatePath('/admin/verification');
}

/**
 * Freeze or unfreeze an account's ability to trade.
 *
 * NOT a verification decision, and deliberately not modelled as one: a vendor
 * behaving badly still has real papers. Suspension says "not right now" and is
 * reversible; a permanent rejection says "these documents are forged" and is
 * not. Conflating them would mean lifting a suspension re-opens a fraud case.
 */
/**
 * Decide a verification for an account whose status lives in `profiles` -
 * today a student, later a creator or event manager.
 *
 * A SEPARATE ACTION BECAUSE IT IS A SEPARATE TABLE. setVendorVerification
 * writes vendor_profiles and setRiderVerification writes rider_profiles; a
 * student has neither, and writing the profiles column by hand would be
 * writing a MIRROR for the roles that have one - a decision the next trigger
 * would quietly undo. See 20260903120000.
 *
 * Called with the user's session, not the service role: the RPC reads
 * auth.uid() to check the caller is staff.
 */
/**
 * Decide verification for a role whose status lives in `profiles` - an event
 * organiser today, a content creator when that opens.
 *
 * A THIRD FUNCTION, AND THAT IS THE MODEL WORKING RATHER THAN SPRAWL.
 * setVendorVerification writes vendor_profiles, setRiderVerification writes
 * rider_profiles, setStudentVerification writes student_profiles. These roles
 * have no table of their own because neither can hold a business row today, so
 * profiles IS their authority. The RPC refuses any role that has one, which is
 * what stops this writing the vendor mirror by mistake.
 */
export async function setPersonalVerification(input: { userId: string; decision: VendorDecision }) {
  await assertStaffArea('events');

  const supabase = await createServerClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;

  const { error } = await rpc('set_personal_verification', {
    p_user: input.userId,
    p_status: input.decision,
  });

  if (error) throw new Error(userMessage(error, 'We could not save that decision.'));
  await announce(input.userId, input.decision, 'organiser', '/organiser');
  revalidatePath('/admin/events');
  revalidatePath('/admin/verification');
}

export async function setStudentVerification(input: { userId: string; decision: VendorDecision }) {
  await assertStaffArea('students');

  const supabase = await createServerClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;

  const { error } = await rpc('set_student_verification', {
    p_user: input.userId,
    // The queue speaks in 'verified' | 'rejected' | 'pending', which is exactly
    // what the function accepts.
    p_status: input.decision,
  });

  if (error) throw new Error(userMessage(error, 'We could not save that decision.'));
  await announce(input.userId, input.decision, 'student', '/me/verify');
  revalidatePath('/admin/students');
  revalidatePath('/admin/verification');
}

export async function setAccountSuspension(input: {
  userId: string;
  suspended: boolean;
  /** Required when suspending   support reads it back to the person asking why. */
  reason?: string;
}) {
  await assertStaffArea('users');

  if (input.suspended && !input.reason?.trim()) {
    throw new Error('Say why this account is being suspended');
  }

  const supabase = await createServerClient();
  const { error } = await supabase.rpc('set_account_suspension', {
    p_user: input.userId,
    p_suspended: input.suspended,
    // `undefined`, not `null`: p_reason has a SQL default, so the generated
    // type makes it optional and an explicit null is a type error. Omitting it
    // lets the default apply, which is the same thing.
    p_reason: input.suspended ? input.reason!.trim() : undefined,
  });

  if (error) throw new Error(userMessage(error, 'We could not change that account.'));
  revalidatePath('/admin/riders');
  revalidatePath('/admin/verification');
  revalidatePath('/admin/users');
}

export type AccountRole =
  | 'student'
  | 'vendor'
  | 'landlord'
  | 'rider'
  // Not open for signup   granted deliberately by a super admin, which is the
  // only way to reach /organiser before the signup card goes live.
  | 'event_manager'
  | 'creator'
  | 'admin'
  | 'super_admin';

/**
 * Change what somebody is.
 *
 * CALLED WITH THE USER'S SESSION, not the service role: `set_account_role`
 * reads auth.uid() to check the caller is a super admin, and the service-role
 * client has no user session, so auth.uid() would be NULL and the call refused.
 *
 * Every rule that matters   super admin only, not yourself, not the last one
 * lives in the function. This does not restate them; it would be a second copy
 * to keep in step, and the one that could be bypassed.
 */
export async function setAccountRole(input: { userId: string; role: AccountRole }) {
  await assertStaffArea('staff');

  const supabase = await createServerClient();
  const { error } = await supabase.rpc('set_account_role', {
    p_user: input.userId,
    p_role: input.role,
  });

  if (error) throw new Error(userMessage(error, 'We could not change that role.'));
  revalidatePath('/admin/staff');
  revalidatePath('/admin/users');
}

/**
 * Give console access to somebody by the email they signed up with.
 *
 * BY EMAIL, BECAUSE THAT IS WHAT YOU KNOW ABOUT A COLLEAGUE. A picker of every
 * account on the platform would be thousands of students deep, and the person
 * you are looking for is one you can already name.
 *
 * The account has to exist. Sync does not create logins from this screen
 * inviting somebody who has never signed up is a different feature with a
 * different failure mode, and quietly creating an account here would mean staff
 * access arriving before the person knew they had it.
 */
export async function addStaffByEmail(input: { email: string; role: 'admin' | 'super_admin' }) {
  await assertStaffArea('staff');

  if (!input.email.trim()) throw new Error('Enter an email address');

  const { findAccountByEmail } = await import('@/modules/admin/staff');
  const found = await findAccountByEmail(input.email);
  if (!found) throw new Error('No account with that email. They need to sign up first.');

  await setAccountRole({ userId: found.id, role: input.role });
  return found.name;
}

// ── Access roles ────────────────────────────────────────────────────────────
//
// Authorisation for all four lives in the database: private.may_manage_roles
// allows a super admin for platform roles and a branch owner for their own.
// These do not restate it   a second copy would be one more thing to keep in
// step, and the one that could be bypassed by a request that never came
// through this module.
//
// REGENERATE THE TYPES once 20260902130000 is applied and `rpcUntyped` can go.

async function rpcUntyped(name: string, args: Record<string, unknown> = {}) {
  const supabase = await createServerClient();
  const call = supabase.rpc.bind(supabase) as unknown as (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  return call(name, args);
}

/** A new platform-wide role, with no grants until somebody sets them. */
export async function createAccessRole(input: { name: string; description?: string }) {
  await assertStaffArea('staff');

  const { data, error } = await rpcUntyped('create_access_role', {
    p_name: input.name,
    p_description: input.description ?? null,
    p_scope: 'admin',
  });

  if (error) throw new Error(userMessage(error, 'We could not create that role.'));
  revalidatePath('/admin/staff');
  return data as string;
}

/**
 * Set one area on one role. `level: null` removes the grant, which is how "no
 * access" is expressed   see 20260902130000 for why 'none' is not stored.
 */
export async function setRoleGrant(input: {
  roleId: string;
  area: string;
  level: 'read' | 'write' | null;
}) {
  await assertStaffArea('staff');

  const { error } = await rpcUntyped('set_role_grant', {
    p_role: input.roleId,
    p_area: input.area,
    p_level: input.level,
  });

  if (error) throw new Error(userMessage(error, 'We could not change that permission.'));
  revalidatePath('/admin/staff');
}

/** Put somebody in a role, or take them out of it. */
export async function setRoleMembership(input: {
  roleId: string;
  userId: string;
  member: boolean;
}) {
  await assertStaffArea('staff');

  const { error } = await rpcUntyped(input.member ? 'assign_access_role' : 'revoke_access_role', {
    p_role: input.roleId,
    p_user: input.userId,
  });

  if (error) throw new Error(userMessage(error, 'We could not change that.'));
  revalidatePath('/admin/staff');
}

/**
 * Ask somebody for what is missing, by email, from the screen the reviewer is
 * already looking at.
 *
 * THE GAP THIS FILLS
 *   A reviewer who opens a folder and finds a blurry ID and no matric number
 *   had two options: verify anyway, or reject. Both are wrong   the submission
 *   is not fraudulent, it is incomplete, and the person has no way of learning
 *   which part. Bouncing a single document (reviewDocument) says something to
 *   a screen they may never open again; this says it to their inbox.
 *
 * IT DOES NOT DECIDE ANYTHING
 *   No status is written. The account stays exactly where the reviewer found
 *   it, because "we asked for more" is not a verification outcome and pretending
 *   it is would move somebody out of the queue they still belong in.
 *
 * WHAT COUNTS AS MISSING IS THE CALLER'S JUDGEMENT
 *   The screen computes the obvious list   requirements with nothing uploaded,
 *   documents bounced, profile details left blank   and the reviewer edits it.
 *   A list assembled here from the database alone could never include "the
 *   photo is too dark to read", which is the most common thing a person needs
 *   to be told.
 */
export async function requestVerificationInfo(input: {
  userId: string;
  /** What they are being verified as, for the wording: 'student', 'business'. */
  subject: string;
  /** Outstanding items, in the words the person will recognise. */
  missing: string[];
  /** The reviewer's own note. Optional, but it is usually the useful part. */
  note?: string;
  /** Where to send them to fix it. */
  path?: string;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const reviewerId = await assertStaffAnyArea([
    'vendors',
    'landlords',
    'riders',
    'students',
    'events',
  ]);

  const missing = input.missing.map((m) => m.trim()).filter(Boolean);
  const note = input.note?.trim();

  // An email that lists nothing and says nothing is worse than no email: it
  // tells somebody they are blocked and gives them no way forward.
  if (missing.length === 0 && !note) {
    return { ok: false, error: 'Say what is missing, or write a note. An empty ask helps nobody.' };
  }

  const result = await notifyVerification({
    userId: input.userId,
    outcome: 'needs_info',
    subject: input.subject,
    missing,
    note: note ?? null,
    path: input.path,
    sentBy: reviewerId,
  });

  if (!result.ok) return result;

  // The new total, handed straight back: the button that sent this becomes
  // "Resend" and has to say how many times, without a round trip or a reload
  // the reviewer did not ask for.
  const { count } = await mailCount(input.userId, 'verification_request');
  return { ok: true, count };
}
