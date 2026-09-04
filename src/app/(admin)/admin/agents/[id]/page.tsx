/**
 * ROUTE: /admin/agents/[id]
 * ACCESS: staff granted the `agents` area.
 * PURPOSE: One agent's record   who they are, what is on them right now, and
 *          everything they have done, in order.
 *
 * WHY A SEPARATE SCREEN
 *   The roster answers "who have I got and how loaded are they". It cannot
 *   answer "is this one actually working", because that is a sequence of events
 *   and not a number. An agent with three open visits is either mid-round or
 *   has ignored all three for a fortnight, and only the log tells them apart.
 *
 * THE LOG IS READ AS THE STAFF MEMBER, NOT AS THE SERVICE ROLE
 *   `agent_activity` is SECURITY DEFINER over private.audit_log and gates on
 *   `is_staff()`, which reads `auth.uid()`. The service-role client has no
 *   auth.uid(), so it would fail that check   correctly. The session client is
 *   used for that one call, so the function's own guard does real work instead
 *   of being bypassed by a key. Everything else on the page needs the admin
 *   client, because emails live in auth and visit rows span every landlord.
 *
 * NOTHING HERE IS INVENTED
 *   An agent who has done nothing gets an empty log saying so. There is no
 *   completion score and no rating: no column holds one, and a number this
 *   screen made up would be used to decide whether somebody keeps working.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/supabase/row';
import { ActivityLog, type ActivityRow } from '../(components)/activity-log';

export const metadata: Metadata = { title: 'Agent   Admin' };

// A log is worthless cached.
export const dynamic = 'force-dynamic';

/** `agent_activity` postdates the checked-in generated types. REGENERATE. */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

const day = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffArea('agents');
  const { id } = await params;

  const admin = createAdminClient();
  const session = await createClient();

  const [{ data: profile }, { data: authUser }, { data: visits }, { data: inspections }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('id, full_name, phone, role, roles, suspended_at, suspended_reason, created_at')
        .eq('id', id)
        .maybeSingle(),
      admin.auth.admin.getUserById(id),
      admin
        .from('verification_visits')
        .select('id, hostel_id, vendor_id, status, scheduled_for, submitted_at, decided_at, created_at')
        .eq('ambassador_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('hostel_inspections')
        .select('id, hostel_id, status, scheduled_for, report_filed_at, fee_kobo')
        .eq('ambassador_id', id)
        .order('scheduled_for', { ascending: false })
        .limit(100),
    ]);

  if (!profile) notFound();

  const p = profile as Row;
  const isAgent =
    p.role === 'agent' || ((p.roles as string[] | null) ?? []).includes('agent');
  // A person who is not an agent has no agent record to show. Better a 404 than
  // a page of empty panels implying they have simply done nothing.
  if (!isAgent) notFound();

  const email = authUser?.user?.email ?? null;
  const name = (p.full_name as string | null) ?? email ?? 'No name set';

  // Place names for the log and the lists. One query, not one per row.
  const visitRows = (visits ?? []) as Row[];
  const inspectionRows = (inspections ?? []) as Row[];
  const hostelIds = [
    ...new Set(
      [...visitRows, ...inspectionRows].map((v) => v.hostel_id as string | null).filter(Boolean),
    ),
  ] as string[];
  const vendorIds = [
    ...new Set(visitRows.map((v) => v.vendor_id as string | null).filter(Boolean)),
  ] as string[];

  const [{ data: hostels }, { data: vendors }] = await Promise.all([
    hostelIds.length
      ? admin.from('hostels').select('id, name, area').in('id', hostelIds)
      : Promise.resolve({ data: [] }),
    vendorIds.length
      ? admin.from('vendor_profiles').select('id, business_name').in('id', vendorIds)
      : Promise.resolve({ data: [] }),
  ]);

  const placeName = new Map<string, string>();
  for (const h of (hostels ?? []) as Row[]) placeName.set(h.id as string, h.name as string);
  for (const v of (vendors ?? []) as Row[]) {
    placeName.set(v.id as string, v.business_name as string);
  }

  // The log itself. Session client   see the header.
  const { data: activity, error: activityError } = await loose(session).rpc('agent_activity', {
    p_agent: id,
    p_limit: 200,
  });

  const log: ActivityRow[] = ((activity ?? []) as Row[]).map((a) => {
    const summary = (a.summary ?? {}) as Record<string, unknown>;
    const placeId = (summary.hostel ?? summary.vendor ?? null) as string | null;
    return {
      occurredAt: a.occurred_at as string,
      action: a.action as string,
      actorName: (a.actor_name as string | null) ?? null,
      actorRole: (a.actor_role as string | null) ?? null,
      byAgent: a.by_agent === true,
      entityType: a.entity_type as string,
      place: placeId ? (placeName.get(placeId) ?? null) : null,
      detail: summary,
    };
  });

  const open = visitRows.filter(
    (v) => v.status !== 'Verified' && v.status !== 'Rejected',
  ).length;
  const submitted = visitRows.filter((v) => v.submitted_at != null).length;
  const verified = visitRows.filter((v) => v.status === 'Verified').length;
  const rejected = visitRows.filter((v) => v.status === 'Rejected').length;
  const reportsFiled = inspectionRows.filter((i) => i.report_filed_at != null).length;

  return (
    <section className="flex flex-col gap-5">
      <Link
        href="/admin/agents"
        className="text-content-muted hover:text-content flex w-fit items-center gap-2 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" /> All agents
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / AGENTS</h1>
        <h2 className="font-display text-content flex flex-wrap items-center gap-3 text-3xl font-medium">
          {name}
          {p.suspended_at ? (
            <Badge className="bg-coral/10 text-coral">suspended</Badge>
          ) : (
            <Badge className="gap-1 bg-lime-500/10 text-lime-600">
              <ShieldCheck className="size-3" /> active
            </Badge>
          )}
        </h2>
        <p className="text-content-muted text-sm">
          {/* Email first: it is the identifier that always exists, and the one
              that tells two unnamed agents apart. */}
          {email ?? 'no email on the account'}
          {p.phone ? ` · ${p.phone}` : ''} · joined {day(p.created_at as string)}
        </p>
        {p.suspended_at != null && (
          <p className="text-coral text-sm">
            Suspended {day(p.suspended_at as string)}
            {p.suspended_reason ? `: ${p.suspended_reason}` : '.'} They cannot be assigned visits.
          </p>
        )}
      </div>

      {/* What is on them, and what came of it. Five counts, all from rows. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Open visits" value={open} accent={open > 0} />
        <Tile label="Submitted" value={submitted} />
        <Tile label="Verified" value={verified} />
        <Tile label="Rejected" value={rejected} />
        <Tile label="Reports filed" value={reportsFiled} />
      </div>

      <ActivityLog rows={log} agentId={id} error={activityError?.message ?? null} />

      {/* The work itself, so a line in the log can be followed to the place. */}
      <div className="flex flex-col gap-2">
        <span className="text-content-muted text-[11px] tracking-wide uppercase">
          Verification visits
        </span>
        {visitRows.length === 0 ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
            This agent has never been assigned a visit.
          </p>
        ) : (
          <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
            {visitRows.map((v) => (
              <div key={v.id as string} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <p className="text-content min-w-0 flex-1 truncate text-sm">
                  {placeName.get((v.hostel_id ?? v.vendor_id) as string) ?? 'Unknown place'}
                </p>
                <span className="text-content-muted text-xs">
                  {v.scheduled_for ? day(v.scheduled_for as string) : 'no time agreed'}
                </span>
                <Badge className="bg-ink/5 text-content-muted">{v.status as string}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {inspectionRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-content-muted text-[11px] tracking-wide uppercase">
            Student inspections
          </span>
          <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
            {inspectionRows.map((i) => (
              <div key={i.id as string} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <p className="text-content min-w-0 flex-1 truncate text-sm">
                  {placeName.get(i.hostel_id as string) ?? 'Unknown hostel'}
                </p>
                <span className="text-content-muted text-xs">
                  {day(i.scheduled_for as string)}
                </span>
                <span className="text-content-muted text-xs">
                  {i.report_filed_at ? 'report filed' : 'no report'}
                </span>
                <Badge className="bg-ink/5 text-content-muted">{i.status as string}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="border-line/10 bg-panel rounded-xl border p-4">
      <p className="text-content-muted text-xs font-medium">{label}</p>
      <p className={`mt-1 font-mono text-2xl ${accent ? 'text-lime-deep' : 'text-content'}`}>
        {value}
      </p>
    </div>
  );
}
