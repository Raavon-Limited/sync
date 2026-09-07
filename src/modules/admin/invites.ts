/**
 * Reading pending console invitations.
 *
 * THE TOKEN IS NEVER SELECTED HERE, and the column list is written out rather
 * than `select('*')` for exactly that reason. Postgres has no column-level
 * select policy, so "staff can read this table" means staff can read every
 * column of it   including a live invite token, which is a way into the
 * console for whoever holds it. A `*` in this file would hand every admin a
 * usable link to every outstanding invitation.
 *
 * The token is returned exactly once, by `create_staff_invite`, to the super
 * admin who created it. If it is lost, the invite is re-sent rather than
 * looked up.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';

/**
 * staff_invites postdates the checked-in generated types. Same escape hatch as
 * modules/admin/roles   REGENERATE once 20260903090000 is applied and this
 * goes.
 */
function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export interface StaffInvite {
  id: string;
  email: string;
  /** The role they will land in, already resolved to its name. */
  roleName: string | null;
  /** The same role as an id, so "send again" can recreate the invitation
   *  with it rather than silently dropping to no role. */
  roleId: string | null;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
  /** True once the deadline has passed. The row stays, so it can be re-sent. */
  expired: boolean;
}

/**
 * Every invitation still waiting to be accepted.
 *
 * Accepted and revoked ones are left out: this list exists to be acted on, and
 * a history of everybody ever invited would bury the two rows that need
 * chasing. The audit log keeps the history.
 *
 * RETURNS AN EMPTY LIST IF THE TABLE IS NOT THERE. The staff page renders the
 * roster, the roles and this; a project that has not yet run
 * 20260903090000 should still get the first two rather than a 500 on the
 * screen that would tell them what to run.
 */
export async function getStaffInvites(): Promise<StaffInvite[]> {
  const c = db();

  const { data, error } = await c
    .from('staff_invites')
    .select('id, email, role_id, invited_by, created_at, expires_at')
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[staff] invites unavailable:', error.message);
    return [];
  }

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const roleIds = [...new Set(rows.map((r) => r.role_id).filter(Boolean))] as string[];
  const inviterIds = [...new Set(rows.map((r) => r.invited_by).filter(Boolean))] as string[];

  const [roles, people] = await Promise.all([
    roleIds.length
      ? c.from('access_roles').select('id, name').in('id', roleIds)
      : Promise.resolve({ data: [] }),
    inviterIds.length
      ? c.from('profiles').select('id, full_name').in('id', inviterIds)
      : Promise.resolve({ data: [] }),
  ]);

  const roleName = new Map(
    ((roles.data ?? []) as Row[]).map((r) => [r.id as string, r.name as string]),
  );
  const personName = new Map(
    ((people.data ?? []) as Row[]).map((p) => [
      p.id as string,
      (p.full_name as string) ?? 'Someone',
    ]),
  );

  const now = Date.now();
  return rows.map((r) => ({
    id: r.id as string,
    email: r.email as string,
    roleName: r.role_id ? (roleName.get(r.role_id as string) ?? null) : null,
    roleId: (r.role_id as string) ?? null,
    invitedByName: personName.get(r.invited_by as string) ?? 'Someone',
    createdAt: r.created_at as string,
    expiresAt: r.expires_at as string,
    expired: new Date(r.expires_at as string).getTime() <= now,
  }));
}
