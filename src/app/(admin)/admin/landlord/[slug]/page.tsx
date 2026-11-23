/**
 * ROUTE: /admin/landlord/[slug]
 * ACCESS: admin / super_admin only.
 * PURPOSE: One landlord   their details, their hostels, and the state of each.
 *
 * `slug` is `vendor_profiles.slug`. Landlords have no slug of their own because
 * they are not a separate table; see the note on /admin/landlord.
 */
import type { Metadata } from 'next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Mail, MapPin, Phone, ShieldCheck, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { emailFor } from '@/modules/admin/emails';
import { mailCount } from '@/modules/admin/mail';
import { VerificationReview, type AdminDoc } from '@/components/admin/verification-review';

import type { Row } from '@/lib/supabase/row';

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug}   Landlord` };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStaffArea('landlords');

  const admin = createAdminClient();

  const { data: landlord } = await admin
    .from('vendor_profiles')
    .select(
      'id, slug, business_name, area, business_address, public_phone, verification_status, created_at',
    )
    .eq('slug', slug)
    .maybeSingle();

  if (!landlord) notFound();

  const [{ data: hostels }, { data: owner }, { data: docs }, email, asked] = await Promise.all([
    admin
      .from('hostels')
      .select('id, slug, name, area, room_type, price_per_session_kobo, verified')
      .eq('landlord_id', (landlord as Row).id)
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    // The person behind the business. `profiles` is own-row-only under RLS,
    // so the service role is the only way to read it   and only here.
    admin
      .from('profiles')
      .select('full_name, role, phone')
      .eq('id', (landlord as Row).id)
      .maybeSingle(),
    // The documents behind the badge in the heading. Fetched separately rather
    // than embedded: verification_documents has no FK to vendor_profiles (it
    // points at profiles), and an embed that cannot resolve fails the page.
    admin
      .from('verification_documents')
      .select('id, role, doc_type, title, status, storage_path, action_message, uploaded_at')
      .eq('owner_id', (landlord as Row).id)
      .order('uploaded_at', { ascending: false }),
    // The address a reviewer would write to. auth.users, not profiles   see
    // modules/admin/emails.
    emailFor((landlord as Row).id as string),
    mailCount((landlord as Row).id as string, 'verification_request'),
  ]);

  // Scoped to this landlord's hostels. Reading the whole availability and visit
  // tables to render one landlord's page works today and gets slower with every
  // hostel anyone else lists.
  const hostelIds = ((hostels ?? []) as Row[]).map((h) => h.id);
  const [{ data: availability }, { data: visits }] = hostelIds.length
    ? await Promise.all([
        admin.from('hostel_availability').select('*').in('hostel_id', hostelIds),
        admin
          .from('verification_visits')
          .select('hostel_id, status, scheduled_for, created_at')
          .in('hostel_id', hostelIds)
          // Oldest first, so the last write into the map below is the newest
          // verdict. A hostel can be visited more than once.
          .order('created_at', { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];

  const availById = new Map(((availability ?? []) as Row[]).map((a) => [a.hostel_id, a]));
  const visitByHostel = new Map(((visits ?? []) as Row[]).map((v) => [v.hostel_id, v]));

  const l = landlord as Row;

  const reviewDocs: AdminDoc[] = ((docs ?? []) as Row[]).map((d) => ({
    id: d.id,
    role: (d.role as string) ?? null,
    docType: d.doc_type,
    title: d.title,
    status: d.status,
    storagePath: d.storage_path,
    actionMessage: d.action_message ?? null,
    uploadedAt: d.uploaded_at,
  }));

  return (
    <section className="flex flex-col gap-6">
      <Link
        href="/admin/landlord"
        className="text-content-muted hover:text-content inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft className="size-4" /> All landlords
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-content flex flex-wrap items-center gap-2 text-3xl">
          {l.business_name ?? 'Unnamed'}
          <Badge
            className={
              l.verification_status === 'verified'
                ? 'bg-lime/15 text-accent-fg'
                : 'bg-ink/5 text-content-muted'
            }
          >
            {l.verification_status}
          </Badge>
        </h1>
        <p className="text-content-muted text-sm">
          {(owner as Row)?.full_name ?? 'Name not set'} · role {(owner as Row)?.role ?? ' '}
        </p>
        <p className="text-content-muted flex flex-wrap items-center gap-3 text-sm">
          <span className="flex items-center gap-1">
            <MapPin className="size-4" />
            {l.business_address ?? l.area ?? 'No address'}
          </span>
          {email && (
            <span className="flex items-center gap-1">
              <Mail className="size-4" />
              {email}
            </span>
          )}
          {(l.public_phone || (owner as Row)?.phone) && (
            <span className="flex items-center gap-1">
              <Phone className="size-4" />
              {l.public_phone ?? (owner as Row)?.phone}
            </span>
          )}
        </p>
      </div>

      {/* TABS, BECAUSE THIS PAGE ANSWERS TWO DIFFERENT QUESTIONS.
          "Is this person who they say they are" and "what have they listed"
          are separate jobs done at separate times, and stacking both made a
          column long enough that the hostels fell below the fold behind four
          document cards. Defaults to Verification: an unverified landlord is
          the reason somebody opens this page.

          Adding a third   payouts, bookings   is a TabsTrigger and a
          TabsContent, which is the point of doing it now rather than at three. */}
      <Tabs defaultValue="verification" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="verification">
            Verification{l.verification_status ? ` · ${l.verification_status}` : ''}
          </TabsTrigger>
          <TabsTrigger value="hostels">Hostels · {hostels?.length ?? 0}</TabsTrigger>
        </TabsList>

        <TabsContent value="verification">
          {/* THE DECISION, ON THE PAGE THAT SHOWS THE BADGE.
          The status above used to be the end of it: an admin saw PENDING here
          and had to know, from nowhere, that the review lived under a nav item
          called "Vendors". Same component as the queue, so the two surfaces
          cannot drift into disagreeing about what a reviewer may do. */}
          <section className="flex flex-col gap-3">
            <h2 className="text-content-muted font-mono text-sm tracking-wide">
              VERIFICATION · {l.verification_status}
            </h2>
            <VerificationReview
              showHeader={false}
              vendor={{
                id: l.id,
                businessName: l.business_name ?? 'Unnamed',
                slug: l.slug,
                category: 'landlord',
                area: l.area ?? null,
                verificationStatus: l.verification_status ?? 'unverified',
                createdAt: l.created_at,
                docs: reviewDocs,
              }}
              mailsSent={asked.count}
              notifyPath="/landlord/settings"
            />
          </section>
        </TabsContent>

        <TabsContent value="hostels">
          <section className="flex flex-col gap-3">
            {(hostels?.length ?? 0) === 0 ? (
              <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-sm">
                This landlord has not listed any hostels.
              </p>
            ) : (
              ((hostels ?? []) as Row[]).map((h) => {
                const a = availById.get(h.id);
                const visit = visitByHostel.get(h.id);
                return (
                  <Link
                    key={h.id}
                    href={`/admin/landlord/${slug}/hostels/${h.slug}`}
                    className="border-line/10 bg-panel hover:border-line/25 flex items-center gap-3 rounded-xl border p-4 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-content flex items-center gap-2 font-medium">
                        {h.name}
                        {h.verified && (
                          <Badge className="bg-lime/15 text-accent-fg gap-1">
                            <ShieldCheck className="size-3" /> verified
                          </Badge>
                        )}
                      </p>
                      <p className="text-content-muted flex flex-wrap items-center gap-3 text-xs">
                        <span>{h.area}</span>
                        <span>{h.room_type}</span>
                        <span>{naira(h.price_per_session_kobo)} / session</span>
                        <span>
                          {a ? `${a.rooms_available}/${a.rooms_total} free` : 'no rooms listed'}
                        </span>
                        {/* The visit is how a hostel becomes verified, so its state
                        belongs next to the verified badge. */}
                        <span>visit: {visit?.status ?? 'Not Visited'}</span>
                      </p>
                    </div>
                    <ChevronRight className="text-content-muted size-4 shrink-0" />
                  </Link>
                );
              })
            )}
          </section>
        </TabsContent>
      </Tabs>
    </section>
  );
}
