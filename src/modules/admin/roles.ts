/**
 * Reading the roles a super admin edits.
 *
 * Grants come back as a map rather than a list, because every consumer asks
 * "what is this role's level for THIS area" and a list makes each of them write
 * the same find().
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';
import type { AccessLevel } from '@/modules/access/areas';

/**
 * access_roles, access_grants and access_members postdate the checked-in
 * generated types. REGENERATE once 20260902130000 is applied and this goes.
 */
function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export interface AccessRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** area key → level. A missing key is no access; 'none' is never stored. */
  grants: Record<string, AccessLevel>;
  members: { id: string; name: string }[];
}

/**
 * Every platform-wide role, with its grants and who holds it.
 *
 * Service role because it reads other people's memberships, and the page above
 * it has already established the caller is staff. The RPCs that WRITE any of
 * this check again in the database.
 */
export async function getAccessRoles(): Promise<AccessRole[]> {
  const c = db();

  const { data: roles } = await c
    .from('access_roles')
    .select('id, name, description, is_system')
    .eq('scope', 'admin')
    .order('is_system', { ascending: false })
    .order('name');

  const list = (roles ?? []) as Row[];
  if (list.length === 0) return [];

  const ids = list.map((r) => r.id as string);

  const [{ data: grants }, { data: members }] = await Promise.all([
    c.from('access_grants').select('role_id, area, level').in('role_id', ids),
    c.from('access_members').select('role_id, user_id').in('role_id', ids),
  ]);

  const memberIds = [...new Set(((members ?? []) as Row[]).map((m) => m.user_id as string))];
  const names = new Map<string, string>();
  if (memberIds.length) {
    const { data: people } = await c.from('profiles').select('id, full_name').in('id', memberIds);
    for (const p of (people ?? []) as Row[]) {
      names.set(p.id as string, (p.full_name as string) ?? 'No name set');
    }
  }

  const grantsByRole = new Map<string, Record<string, AccessLevel>>();
  for (const g of (grants ?? []) as Row[]) {
    const map = grantsByRole.get(g.role_id as string) ?? {};
    map[g.area as string] = g.level as AccessLevel;
    grantsByRole.set(g.role_id as string, map);
  }

  const membersByRole = new Map<string, { id: string; name: string }[]>();
  for (const m of (members ?? []) as Row[]) {
    const arr = membersByRole.get(m.role_id as string) ?? [];
    arr.push({ id: m.user_id as string, name: names.get(m.user_id as string) ?? 'No name set' });
    membersByRole.set(m.role_id as string, arr);
  }

  return list.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    isSystem: r.is_system === true,
    grants: grantsByRole.get(r.id as string) ?? {},
    members: membersByRole.get(r.id as string) ?? [],
  }));
}
