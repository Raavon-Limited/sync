/**
 * ROUTE: /admin/agents
 * ACCESS: staff granted the `agents` area.
 * PURPOSE: The people who go and look   who they are, who is outstanding, and
 *          sending one somewhere.
 *
 * WHY THE ASSIGN FORM LIVES BESIDE THE ROSTER
 *   Assigning is the only reason this screen exists. Everything else on it
 *   answers the questions that assignment raises: who is available, which
 *   places have never been visited, and whether the agent I am about to send
 *   has actually accepted their invite yet.
 *
 * EVERYTHING UNVISITED, NOT EVERYTHING
 *   The hostel and vendor lists are filtered to what has no visit on it. A
 *   dropdown of every listing on the platform is a dropdown nobody can find
 *   anything in, and re-sending an agent to a place already verified is the
 *   mistake this makes hard rather than the one it makes easy.
 */
import type { Metadata } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';
import {
  AgentsConsole,
  type AgentRow,
  type InviteRow,
  type PlaceRow,
} from './(components)/agents-console';

export const metadata: Metadata = { title: 'Agents   Admin' };

// Who has accepted, and what is still unvisited, both change under you.
export const dynamic = 'force-dynamic';

/** agent_invites postdates the checked-in generated types. REGENERATE. */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

export default async function Page() {
  await requireStaffArea('agents');

  const admin = createAdminClient();

  const [
    { data: people },
    { data: invites },
    { data: visits },
    { data: hostels },
    { data: vendors },
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, role, roles, campus_id, suspended_at, created_at')
      .is('archived_at', null),
    loose(admin)
      .from('agent_invites')
      .select('id, email, invited_by, expires_at, accepted_at, revoked_at, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('verification_visits').select('id, hostel_id, ambassador_id, status'),
    admin.from('hostels').select('id, name, area').is('archived_at', null).limit(500),
    admin
      .from('vendor_profiles')
      .select('id, business_name, category, area')
      .is('archived_at', null)
      .limit(500),
  ]);

  const rows = (people ?? []) as Row[];

  // An agent is anyone HOLDING the role, not only anyone currently wearing it:
  // an admin who also does visits is both, and leaving them out of the list
  // would make them unassignable.
  const agents: AgentRow[] = rows
    .filter((p) => p.role === 'agent' || (p.roles as string[] | null)?.includes('agent'))
    .map((p) => ({
      id: p.id as string,
      name: (p.full_name as string) ?? 'No name set',
      suspended: p.suspended_at != null,
      // Their current load, so nobody is handed a tenth visit while somebody
      // else has none.
      open: ((visits ?? []) as Row[]).filter(
        (v) => v.ambassador_id === p.id && v.status !== 'Verified' && v.status !== 'Rejected',
      ).length,
    }));

  const nameById = new Map(rows.map((p) => [p.id as string, (p.full_name as string) ?? null]));

  const pending: InviteRow[] = ((invites ?? []) as Row[])
    .filter((i) => !i.accepted_at && !i.revoked_at)
    .map((i) => ({
      id: i.id as string,
      email: i.email as string,
      invitedBy: nameById.get(i.invited_by as string) ?? 'A staff account',
      expiresAt: i.expires_at as string,
    }));

  const visited = new Set(((visits ?? []) as Row[]).map((v) => v.hostel_id as string));

  const places: PlaceRow[] = [
    ...((hostels ?? []) as Row[])
      .filter((h) => !visited.has(h.id as string))
      .map((h) => ({
        id: h.id as string,
        kind: 'hostel' as const,
        label: (h.name as string) ?? 'Unnamed hostel',
        detail: (h.area as string) ?? 'No area',
      })),
    ...((vendors ?? []) as Row[]).map((v) => ({
      id: v.id as string,
      kind: 'vendor' as const,
      label: (v.business_name as string) ?? 'Unnamed business',
      detail: [(v.category as string) ?? null, (v.area as string) ?? null]
        .filter(Boolean)
        .join(' · '),
    })),
  ];

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / AGENTS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Agents <span className="text-lime-deep">on the ground.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          Agents visit hostels and shops and photograph what is actually there. Assigning one tells
          the landlord or vendor who is coming, by name.
        </p>
      </div>

      <AgentsConsole agents={agents} invites={pending} places={places} />
    </section>
  );
}
