/**
 * Who is staff, answered in one place.
 *
 * THE ROW IS THE ANSWER. NOTHING ELSE IS.
 *   This used to be `profile?.role ?? adminRoleForEmail(user.email)`, repeated
 *   in fifteen pages, with the proxy resolving the same question the other way
 *   round — `adminRoleForEmail(email) ?? profile?.role`. So the env allowlist
 *   and the database could disagree, and which one won depended on whether you
 *   were being routed or rendered.
 *
 *   It was worse than inconsistent. `is_staff()` in the database has always
 *   read profiles.role alone, so an "admin" who existed only in ADMIN_EMAILS
 *   could open every screen and have every write refused by RLS — access that
 *   looked real until the moment it mattered.
 *
 *   Now there is one source: `profiles.role`. Granting and revoking staff is
 *   `set_account_role`, which is audited and takes effect immediately, rather
 *   than an env var and a redeploy.
 */
import 'server-only';
import { redirect } from 'next/navigation';
import { getProfile } from '@/modules/auth/queries';

export type StaffRole = 'admin' | 'super_admin';

export function isStaffRole(role?: string | null): role is StaffRole {
  return role === 'admin' || role === 'super_admin';
}

/**
 * The caller's staff role, or a redirect to /403.
 *
 * Every admin page calls this first. It is not the only guard — every action in
 * modules/admin re-checks server-side, because a page guard protects a render
 * and says nothing about what a request can do.
 */
export async function requireStaff(): Promise<StaffRole> {
  const profile = await getProfile();
  if (!isStaffRole(profile?.role)) redirect('/403');
  return profile!.role as StaffRole;
}

/** Stricter: appointing and removing staff is a super admin's job alone. */
export async function requireSuperAdmin(): Promise<'super_admin'> {
  const profile = await getProfile();
  if (profile?.role !== 'super_admin') redirect('/403');
  return 'super_admin';
}
