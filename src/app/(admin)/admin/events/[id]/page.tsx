/**
 * ROUTE: /admin/events/[id]
 * ACCESS: staff granted the `events` area.
 * PURPOSE: One event organiser - their documents, the decision, and what they
 *          have listed.
 *
 * BUILT LIKE THE LANDLORD PAGE, ON PURPOSE
 *   Display name and status badge, the contact line, then VERIFICATION with the
 *   shared review component, then what they own. A reviewer moving between a
 *   landlord, a rider and an organiser is doing the same job three times, and
 *   the screen should not make them relearn where things are. The only thing
 *   that differs is the last section: hostels there, events here.
 *
 * THE DECISION WRITES profiles.verification_status, VIA set_personal_verification
 *   An organiser has no authority table of its own, because the role cannot
 *   co-exist with a business row today - so for them `profiles` IS the
 *   authority rather than the vendor mirror. The RPC refuses any role that DOES
 *   have one, which stops this screen writing a vendor's mirror by mistake.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, ChevronRight, Mail, Phone } from 'lucide-react';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui';
import { VerificationReview } from '@/components/admin/verification-review';
import type { Row } from '@/lib/supabase/row';

export const metadata: Metadata = { title: 'Organiser - Admin' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await requireStaffArea('events');

  const admin = createAdminClient();

  const { data: profileRow } = await admin
    .from('profiles')
    .select(
      'id, full_name, phone, role, verification_status, suspended_at, suspended_reason, created_at',
    )
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle();

  const p = profileRow as Row | null;
  // Not found rather than forbidden: a 403 confirms the id exists, which is a
  // thing worth not confirming to somebody guessing.
  if (!p || !['event_manager', 'creator'].includes(p.role as string)) notFound();

  const [{ data: docs }, { data: events }, { data: authList }] = await Promise.all([
    admin
      .from('verification_documents')
      .select('id, doc_type, title, status, storage_path, action_message, uploaded_at')
      .eq('owner_id', id)
      .order('uploaded_at', { ascending: false }),
    admin
      .from('events')
      .select('id, name, slug, venue, starts_at')
      .eq('organizer_id', id)
      .order('starts_at', { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const email = (authList?.users ?? []).find((u) => u.id === id)?.email ?? null;
  const listed = (events ?? []) as Row[];
  const status = (p.verification_status as string) ?? 'unverified';
  const name = (p.full_name as string) ?? 'Name not set';

  return (
    <section className="flex flex-col gap-6">
      <Link
        href="/admin/events"
        className="text-content-muted hover:text-content inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft className="size-4" /> All organisers
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-content flex flex-wrap items-center gap-2 text-3xl">
          {name}
          <Badge
            className={
              status === 'verified'
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-ink/5 text-content-muted'
            }
          >
            {status}
          </Badge>
          {p.suspended_at != null && (
            <Badge className="bg-rose-500/10 text-rose-600">suspended</Badge>
          )}
        </h1>
        <p className="text-content-muted text-sm">
          {(p.role as string) === 'creator' ? 'Content creator' : 'Event organiser'} · joined{' '}
          {new Date(p.created_at as string).toLocaleDateString('en-NG', {
            month: 'short',
            year: 'numeric',
          })}
        </p>
        <p className="text-content-muted flex flex-wrap items-center gap-3 text-sm">
          {email && (
            <span className="flex items-center gap-1">
              <Mail className="size-4" />
              {email}
            </span>
          )}
          {p.phone != null && (
            <span className="flex items-center gap-1">
              <Phone className="size-4" />
              {p.phone as string}
            </span>
          )}
        </p>
        {p.suspended_reason != null && (
          <p className="text-coral text-sm">Suspended: {p.suspended_reason as string}</p>
        )}
      </div>

      {/* Same component and same placement as the landlord and rider pages, so
          the three surfaces cannot drift into disagreeing about what a reviewer
          may do. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">
          VERIFICATION · {status}
        </h2>
        <VerificationReview
          showHeader={false}
          kind="organiser"
          vendor={{
            id,
            businessName: name,
            slug: id,
            category: (p.role as string) === 'creator' ? 'content creator' : 'event organiser',
            area: null,
            verificationStatus: status,
            createdAt: p.created_at as string,
            docs: ((docs ?? []) as Row[]).map((d) => ({
              id: d.id as string,
              docType: d.doc_type as string,
              title: d.title as string,
              status: d.status as string,
              storagePath: d.storage_path as string,
              actionMessage: (d.action_message as string) ?? null,
              uploadedAt: d.uploaded_at as string,
            })),
          }}
        />
      </section>

      {/* Where the landlord page lists hostels. A reviewer deciding whether
          somebody should take ticket money wants to see what they propose to
          sell: three events already up and none are different judgements. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">
          EVENTS · {listed.length}
        </h2>
        {listed.length === 0 ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
            Nothing listed yet &mdash; they cannot publish an event until this decision is made.
          </p>
        ) : (
          listed.map((e) => (
            <a
              key={e.id as string}
              href={`/events/${e.slug as string}`}
              target="_blank"
              rel="noreferrer"
              className="border-line/10 bg-panel hover:border-line/25 flex items-center gap-3 rounded-xl border p-4 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-content font-medium">{(e.name as string) ?? 'Untitled event'}</p>
                <p className="text-content-muted flex flex-wrap items-center gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    {new Date(e.starts_at as string).toLocaleString('en-NG', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                  {e.venue != null && <span>{e.venue as string}</span>}
                </p>
              </div>
              <ChevronRight className="text-content-muted size-4 shrink-0" />
            </a>
          ))
        )}
      </section>
    </section>
  );
}
