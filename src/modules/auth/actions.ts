/**
 * Server Actions for the 'auth' module.
 * Every action must:
 *   1. Run on the server ('use server').
 *   2. Re-validate input with a zod schema from @/lib/validations.
 *   3. Use the server Supabase client (@/lib/supabase/server).
 *   4. Return a typed result, never throw raw errors to the client.
 *
 * Flow: signUp (creates the user + emails a 6-digit OTP) → /verify enters the
 * code → verifySignupOtp confirms it and establishes the session. signIn is the
 * email+password login. The session cookies are written by the server client,
 * which is allowed to set them from within a Server Action.
 */
'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { adminRoleForEmail } from '@/lib/admin-emails';
import { resolveHandle } from '@/lib/handle';
import { userMessage } from '@/lib/errors';
import type { Row } from '@/lib/supabase/row';
import {
  email as emailRule,
  loginSchema,
  signupSchema,
  verifyOtpSchema,
  type LoginInput,
  type SignupInput,
  type VerifyOtpInput,
} from '@/lib/validations';
import type { AuthResult, Role, SignUpResult, VerifyResult } from './types';

/** First zod issue message, or a sensible fallback. */
function firstIssue(error: { issues: { message: string }[] }, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/**
 * The signed-in user's personalised dashboard handle, derived from the SAME
 * inputs the proxy uses (business/full name + email) so login lands them on
 * `/<handle>` and the proxy rewrites it to the right per-type dashboard
 * (vendor vs landlord). Returns undefined when no handle can be formed.
 */
function handleFor(
  user: { email?: string; user_metadata?: Record<string, unknown> } | null,
  /**
   * The SERVER-TRUSTED role, from profiles.role. Not optional in practice, and
   * passing the metadata role here is the bug this parameter exists to prevent.
   *
   * This read `meta.role` - the editable user_metadata - while the proxy
   * computes the same handle from profiles.role. resolveHandle branches on that
   * role (business accounts key off business_name, everyone else off
   * full_name), so the two disagreed the moment the two roles diverged.
   *
   * They diverge routinely: `claim_role` and `switch_role` change profiles.role
   * and never touch user_metadata, so ANY multi-role account has a stale
   * metadata role. Login then sent them to /<handle-from-full-name> while the
   * proxy would only rewrite /<handle-from-business-name>, no rewrite fired,
   * and Next 404'd on a URL we had just generated ourselves.
   */
  trustedRole: string | undefined,
): string | undefined {
  const meta = user?.user_metadata ?? {};
  const handle = resolveHandle({
    role: trustedRole,
    full_name: meta.full_name as string | undefined,
    business_name: meta.business_name as string | undefined,
    email: user?.email,
  });
  return handle ?? undefined;
}

/**
 * Create an account. Stores name/phone/role in user_metadata and triggers the
 * confirmation OTP email. Does NOT sign the user in - they must verify first.
 */
export async function signUp(input: SignupInput): Promise<SignUpResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'Invalid details') };

  const { email, password, fullName, phone, role, vendorCategory, trade, campusId, campusOther } =
    parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        phone,
        role,
        // Vendor specialisation - null for students. A `landlord` category is
        // promoted to role='landlord' by the signup trigger (see migration
        // 0005); the rest scope the vendor's listings. The gate reads the
        // resulting profiles.role, never this editable metadata.
        vendor_category: role === 'vendor' ? (vendorCategory ?? null) : null,
        trade: role === 'vendor' && vendorCategory === 'tradesman' ? (trade ?? null) : null,
        // Students only. handle_new_user() looks this up against `campuses` and
        // ignores anything that is not a real, ACTIVE row, so a tampered value
        // costs the account a campus rather than naming one we do not serve.
        campus_id: role === 'student' ? (campusId ?? null) : null,
        // The typed university, when it is not one we have. The trigger keeps
        // it only if campus_id did not resolve, so the two never disagree.
        campus_other: role === 'student' ? (campusOther ?? null) : null,
      },
    },
  });
  if (error) {
    const alreadyRegistered = /already registered|already exists/i.test(error.message);
    return { ok: false, error: error.message, alreadyRegistered };
  }
  // Supabase obfuscates an existing confirmed account: it returns a user with an
  // empty `identities` array and sends no email. Treat that as already-registered
  // so the form can route to login instead of a dead-end /verify.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return {
      ok: false,
      error: 'An account with this email already exists. Please log in.',
      alreadyRegistered: true,
    };
  }
  // A session here means the project has "Confirm email" turned OFF: the
  // account is already usable and nothing was emailed. Reported so the form can
  // skip /verify, which would otherwise ask for a code that does not exist.
  return { ok: true, signedIn: Boolean(data.session) };
}

/**
 * Confirm a signup with the 6-digit OTP. On success the session is established
 * (cookies set) and we return the role so the caller can route appropriately.
 */
export async function verifySignupOtp(input: VerifyOtpInput): Promise<VerifyResult> {
  const parsed = verifyOtpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'Invalid code') };

  const { email, code } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' });
  if (error) return { ok: false, error: error.message };

  // Prefer the server-trusted profiles.role: the signup trigger promotes a
  // landlord-category signup to role='landlord', so the editable metadata
  // (which still says 'vendor') would route them to the wrong dashboard.
  let role = (data.user?.user_metadata?.role as Role | undefined) ?? 'student';
  if (data.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profile?.role) role = profile.role as Role;
  }
  return { ok: true, role };
}

/** Resend the signup confirmation OTP. */
export async function resendSignupOtp(rawEmail: string): Promise<AuthResult> {
  const parsed = emailRule.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'Enter a valid email') };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: 'signup', email: parsed.data });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Email + password sign-in. Establishes the session and returns the role so
 *  the form can route vendors to their dashboard. */
export async function signIn(input: LoginInput): Promise<VerifyResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'Invalid credentials') };

  const { email, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };

  let role = (data.user?.user_metadata?.role as Role | undefined) ?? 'student';
  // Every hat this account holds, for the login role chooser. Stays empty when
  // the multi-role migration has not run, which the form reads as "no choice".
  let roles: Role[] = [];

  // Archive lifecycle: <30d → self-restore on login; 30–60d → blocked, admin
  // must restore; >60d → account is purged (so it usually won't get here).
  try {
    const admin = createAdminClient();
    const res = await admin
      .from('profiles')
      .select('role, roles, archived_at')
      .eq('id', data.user.id)
      .maybeSingle();
    // `roles` postdates types/database.types.ts, which is generated FROM the
    // database. REGENERATE THE TYPES once 20260830090000 is applied and this
    // cast can go.
    const prof = res.data as unknown as Row | null;
    if (prof?.role) role = prof.role as Role;
    if (Array.isArray(prof?.roles)) roles = prof.roles as Role[];
    if (prof?.archived_at) {
      const days = (Date.now() - new Date(prof.archived_at).getTime()) / 86_400_000;
      if (days < 30) {
        await admin
          .from('profiles')
          .update({ archived_at: null, archived_reason: null })
          .eq('id', data.user.id);
      } else {
        await supabase.auth.signOut();
        return {
          ok: false,
          error:
            days < 60
              ? 'Your account is archived. Contact support to restore it.'
              : 'This account is no longer available.',
        };
      }
    }
  } catch {
    // profiles table not migrated yet - fall back to the metadata role.
  }

  return { ok: true, role, handle: handleFor(data.user, role) };
}

/** Which input the login form should show for an email: admins/super_admins are
 *  passwordless ('otp'), everyone else uses a password. Defaults to 'password'
 *  for unknown emails (and when Supabase isn't reachable) so we don't reveal
 *  whether an account exists. Backed by the env allowlist + the `login_method`
 *  SQL function. */
export async function getLoginMethod(rawEmail: string): Promise<{ method: 'password' | 'otp' }> {
  const parsed = emailRule.safeParse(rawEmail);
  if (!parsed.success) return { method: 'password' };
  if (adminRoleForEmail(parsed.data)) return { method: 'otp' };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('login_method', { p_email: parsed.data });
    if (error) return { method: 'password' };
    return { method: data === 'otp' ? 'otp' : 'password' };
  } catch {
    return { method: 'password' };
  }
}

/** Send a passwordless sign-in code to an existing account (used by the OTP
 *  login flow — e.g. admins / super_admins who have no password). Won't create
 *  a new user. */
export async function sendLoginOtp(rawEmail: string): Promise<AuthResult> {
  const parsed = emailRule.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'Enter a valid email') };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Verify a passwordless login OTP and establish the session. Returns the
 *  trusted role so the form can route. */
export async function verifyLoginOtp(input: VerifyOtpInput): Promise<VerifyResult> {
  const parsed = verifyOtpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'Invalid code') };

  const { email, code } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) return { ok: false, error: error.message };

  let role = (data.user?.user_metadata?.role as Role | undefined) ?? 'student';
  try {
    const admin = createAdminClient();
    const { data: prof } = await admin
      .from('profiles')
      .select('role, archived_at')
      .eq('id', data.user!.id)
      .maybeSingle();
    if (prof?.role) role = prof.role as Role;

    // Bootstrap: a founding admin (env allowlist) lands as admin even if
    // profiles.role wasn't seeded - self-heal it so the proxy + /admin pages
    // recognise them on this and future logins.
    const bootstrap = adminRoleForEmail(email);
    if (bootstrap && role !== 'admin' && role !== 'super_admin') {
      role = bootstrap;
      await admin.from('profiles').upsert({ id: data.user!.id, role }, { onConflict: 'id' });
    }
    if (prof?.archived_at) {
      const days = (Date.now() - new Date(prof.archived_at).getTime()) / 86_400_000;
      if (days < 30) {
        await admin
          .from('profiles')
          .update({ archived_at: null, archived_reason: null })
          .eq('id', data.user!.id);
      } else {
        await supabase.auth.signOut();
        return {
          ok: false,
          error:
            days < 60
              ? 'Your account is archived. Contact support to restore it.'
              : 'This account is no longer available.',
        };
      }
    }
  } catch {
    // profiles table not migrated yet.
  }
  return { ok: true, role, handle: handleFor(data.user, role) };
}

/** Sign out the current user. Clears the session cookies. */
export async function signOut(): Promise<AuthResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Wear a different hat.
 *
 * The authorisation lives in `switch_role`, which refuses any role not in the
 * caller's own `profiles.roles`. Doing that check here instead would put a
 * privilege boundary in a client-callable action, where the only thing between
 * a student and `admin` would be this file.
 */
export async function switchRole(role: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('switch_role', { p_role: role });
  if (error) throw new Error(error.message);
}

/**
 * Add a second kind of account to the one you are already signed in to.
 *
 * WHY THIS EXISTS
 *   Signing up again with the same email cannot work — Supabase auth is keyed
 *   on email, so a second signup is refused as "already registered" and the
 *   form sends you to /login. That is correct and also a dead end: there was
 *   no way, anywhere in the app, to become a vendor once you were a student.
 *
 * CLAIM THEN WEAR
 *   `claim_role` adds the hat, `switch_role` puts it on. Both are checked in
 *   the database: claim refuses staff roles and a second business profile,
 *   switch refuses anything you do not hold. If the switch half fails the
 *   claim still stands — you hold the role and are simply not wearing it,
 *   which the account switcher can fix. The reverse order could grant a role
 *   nobody asked for, so it is deliberately claim-first.
 *
 * The caller sends business roles on to /onboarding, which is where the
 * vendor_profiles row is actually created. Holding the role is permission to
 * set a business up, not a business.
 */
export async function claimRole(role: string): Promise<void> {
  const supabase = await createClient();

  const { error: claimError } = await supabase.rpc('claim_role', { p_role: role });
  if (claimError) throw new Error(claimError.message);

  const { error: switchError } = await supabase.rpc('switch_role', { p_role: role });
  if (switchError) throw new Error(switchError.message);
}

// ── Password reset ──────────────────────────────────────────────────────────

/**
 * Start a password reset.
 *
 * ALWAYS REPORTS SUCCESS, even for an address with no account. Answering
 * "no such user" here would turn this form into an account-enumeration oracle
 * — type addresses, watch which ones error — which is the same disclosure
 * `getLoginMethod` already refuses to make. The person who owns the mailbox
 * finds out by receiving the email, or by not receiving one.
 *
 * HOW LONG THE LINK LASTS IS A SUPABASE SETTING, not a value we can pass here:
 * recovery links expire after the project's email OTP expiry
 * (Authentication → Emails → "Email OTP Expiration"). Set it to 600 seconds
 * for the 10-minute window this flow is written around. The copy in the UI
 * says "10 minutes", so if that setting changes, change the copy with it.
 */
export async function requestPasswordReset(rawEmail: string): Promise<AuthResult> {
  const parsed = emailRule.safeParse(rawEmail);
  // Even an invalid address gets the same answer, for the reason above.
  if (!parsed.success) return { ok: true };

  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://www.letsyncyou.com';

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${site}/reset-password`,
    });
    // Logged, not surfaced: a misconfigured mailer is our problem to see, and
    // telling the visitor would leak whether the address exists.
    if (error) console.error('[reset] resetPasswordForEmail failed:', error);
  } catch (e) {
    console.error('[reset] threw:', e);
  }

  return { ok: true };
}

/**
 * Finish a password reset.
 *
 * Runs against the session Supabase established from the recovery link, so
 * there is no token to pass and no way to change someone else's password:
 * `updateUser` acts on whoever the recovery session belongs to. An expired or
 * already-used link means there is no session, which is the error surfaced.
 */
export async function completePasswordReset(password: string): Promise<AuthResult> {
  if (!password || password.length < 8) {
    return { ok: false, error: 'Choose a password of at least 8 characters.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: 'This reset link has expired or was already used. Request a new one.',
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: userMessage(error, 'We could not set your password.') };

  return { ok: true };
}
