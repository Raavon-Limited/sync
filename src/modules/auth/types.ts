/**
 * Domain types for the 'auth' module.
 * Cross-module shared types belong in @/types.
 */

/** Account roles. Signup only ever assigns student/vendor/landlord/rider (the
 *  DB trigger derives landlord from vendor_category and clamps everything else
 *  to student); admin/super_admin are granted server-side and are unreachable
 *  from the client whatever metadata it claims. Drives routing + the proxy gate.
 *
 *  Must stay in step with `profiles_role_check` in the database   the constraint
 *  is the authority, this union is the app's mirror of it. */
export type Role =
  | 'student'
  | 'vendor'
  | 'landlord'
  | 'rider'
  // Not open for signup yet   /signup shows both as 'Not yet'. Listed because
  // the proxy, the dashboards and submit_personal_verification all already
  // handle them, and a role legal in the database but absent from this union
  // is one every call site has to cast around.
  | 'event_manager'
  | 'creator'
  | 'admin'
  | 'super_admin';

/** Business (non-student, non-admin) roles - both onboard and get verified the
 *  same way, and both key their handle off `business_name`. */
export const BUSINESS_ROLES = ['vendor', 'landlord'] as const;

/** True for accounts that own a storefront/property listing. */
export function isBusinessRole(role?: string | null): boolean {
  return role === 'vendor' || role === 'landlord';
}

/** Result of an auth mutation. Actions return this instead of throwing, so the
 *  client can surface a friendly message and never sees raw Supabase errors. */
export type AuthResult = { ok: true } | { ok: false; error: string };

/** Signup result. `alreadyRegistered` lets the form send the user to /login
 *  instead of /verify when the email already has a confirmed account. */
export type SignUpResult =
  | {
      ok: true;
      /**
       * True when Supabase returned a SESSION - i.e. "Confirm email" is off in
       * the project's auth settings, so the account is live immediately and no
       * code was emailed.
       *
       * The client must branch on this. Routing to /verify unconditionally
       * strands a user who is already signed in on a page asking for a code
       * that was never sent, which is a dead end with no way out.
       */
      signedIn: boolean;
    }
  | { ok: false; error: string; alreadyRegistered?: boolean };

/** Verify result also carries the role so the client can route to the right
 *  landing (vendors → /onboarding, students → the app). `handle` is the user's
 *  personalised dashboard slug (vendors), so the client can land them on their
 *  own handle root (/<handle>) and let the proxy resolve the per-type dashboard
 *  (vendor vs landlord) instead of hardcoding /vendor. */
export type VerifyResult =
  | {
      ok: true;
      /** The role currently worn - profiles.role. */
      role: Role;
      handle?: string;
      /**
       * Every role this account HOLDS - profiles.roles.
       *
       * Returned so the login form can offer a choice when there is more than
       * one. Signing in wearing whichever hat happened to be last is a coin
       * flip for a multi-role account, and lands half of them on the wrong
       * dashboard. One role means no choice to make and no prompt.
       */
      roles?: Role[];
    }
  | { ok: false; error: string };
