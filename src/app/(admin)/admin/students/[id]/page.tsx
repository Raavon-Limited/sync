/**
 * ROUTE: /admin/students/[id]
 * ACCESS: staff granted the `students` area.
 * PURPOSE: One student - who they say they are, what they uploaded, and the
 *          decision.
 *
 * KEYED ON THE PROFILE ID, like riders. A student is a person, not a business
 * with a public page, so there is no slug to key on.
 *
 * THE DECISION WRITES student_profiles, NOT profiles
 *   Handled by the shared VerificationReview with `kind="student"`, which calls
 *   setStudentVerification. Writing profiles.verification_status here would be
 *   writing the vendor MIRROR: for a student who also sells, the next business
 *   decision would overwrite whatever a reviewer decided on this screen. See
 *   20260903180000.
 *
 * THE IDENTITY IS SHOWN BESIDE THE DOCUMENTS ON PURPOSE. The school ID is only
 * evidence if it can be read against something - the matric number and
 * department are that something, and a reviewer comparing them should not have
 * to hold one of them in their head from another screen.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStudentIdentities } from '@/modules/students';
import { emailFor } from '@/modules/admin/emails';
import { mailCount } from '@/modules/admin/mail';
import { Badge } from '@/components/ui';
import { STATUS_BADGE } from '@/components/admin/account-queue';
import type { AdminVendor } from '@/components/admin/verification-review';
import { RoleReviewTabs, type RoleReviewTab } from '@/components/admin/role-review-tabs';
import type { Row } from '@/lib/supabase/row';

export const metadata: Metadata = { title: 'Student - Admin' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await requireStaffArea('students');

  const admin = createAdminClient();

  const { data: profileRow } = await admin
    .from('profiles')
    .select(
      'id, full_name, phone, role, roles, campus_id, campus_other, suspended_at, suspended_reason, created_at',
    )
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle();

  const p = profileRow as Row | null;
  if (!p) notFound();

  const [{ data: docs }, identities, { data: campus }, email, asked, { data: business }] =
    await Promise.all([
      admin
        .from('verification_documents')
        .select('id, role, doc_type, title, status, storage_path, action_message, uploaded_at')
        .eq('owner_id', id)
        .order('uploaded_at', { ascending: false }),
      getStudentIdentities([id]),
      p.campus_id
        ? admin.from('campuses').select('name').eq('id', p.campus_id).maybeSingle()
        : Promise.resolve({ data: null }),
      // The address a reviewer would actually write to. It lives in auth.users,
      // not profiles   see modules/admin/emails.
      emailFor(id),
      // How many times somebody has already been asked for the missing half.
      mailCount(id, 'verification_request'),
      // The business half of the same person, when there is one. Its documents
      // live in the same pile and its decision is a different column   see
      // RoleReviewTabs for why they must not share a Verify button.
      admin
        .from('vendor_profiles')
        .select('id, business_name, slug, category, area, verification_status, created_at')
        .eq('id', id)
        .is('archived_at', null)
        .maybeSingle(),
    ]);

  const identity = identities.get(id);
  const campusName = (campus as Row | null)?.name ?? (p.campus_other as string) ?? null;

  // The shape VerificationReview reads. `slug` and the business fields are not
  // a student's, so they carry the person's own values rather than being faked.
  const subject: AdminVendor = {
    id,
    businessName: (p.full_name as string) ?? 'No name set',
    slug: id,
    category: 'student',
    area: campusName,
    verificationStatus: identity?.verificationStatus ?? 'unverified',
    createdAt: p.created_at as string,
    docs: ((docs ?? []) as Row[]).map((d) => ({
      id: d.id as string,
      role: (d.role as string | null) ?? null,
      docType: d.doc_type as string,
      title: d.title as string,
      status: d.status as string,
      storagePath: d.storage_path as string,
      actionMessage: (d.action_message as string) ?? null,
      uploadedAt: d.uploaded_at as string,
    })),
  };

  /*
   * WHAT IS MISSING THAT IS NOT A DOCUMENT.
   *
   * A school ID is only evidence if it can be read against something, and the
   * matric number and department are that something. Verifying a student whose
   * profile says "Not given" for both is approving half a check - which is why
   * set_student_verification refuses it (20260904180000) and why the button
   * says so here rather than letting the click come back as an error.
   *
   * Level is listed for the email but does not block: it changes every year and
   * is on few cards, so a reviewer cannot check it anyway.
   */
  const missingIdentity: string[] = [];
  if (!identity?.matricNumber) missingIdentity.push('Your matric number');
  if (!identity?.department) missingIdentity.push('Your department');
  if (!identity?.level) missingIdentity.push('Your level (e.g. 200 level)');

  const blocksVerify = !identity?.matricNumber || !identity?.department;

  /*
   * THIS SCREEN DECIDES THE STUDENT, AND ONLY THE STUDENT.
   *
   * It briefly carried a second tab for the business half of a dual-role
   * account, on the reasoning that the documents are one pile and a reviewer
   * should see both halves in one place. In practice that tab was the worst of
   * both: it duplicated a screen that already exists and works
   * (/admin/landlord/<slug>, which also shows the properties this one has no
   * column for), and it put two Verify buttons writing two different tables on
   * one page.
   *
   * The other half is a link now, not a tab. One screen, one decision, one
   * table   and the note below says where the other one lives.
   */
  const biz = business as Row | null;

  const tabs: RoleReviewTab[] = [
    {
      key: 'student',
      label: 'Student',
      role: 'student',
      kind: 'student',
      subject,
      blockVerify: blocksVerify
        ? 'This student has not given their matric number and department, so the school ID has nothing to be checked against. Ask for them first.'
        : null,
      extraMissing: missingIdentity,
      notifyPath: '/user/settings',
      mailsSent: asked.count,
    },
  ];

  // Every role this account holds. A student who also sells has a SECOND,
  // independent verification on the business screen, and a reviewer deciding
  // this one should know that rather than assume they are looking at the whole
  // person.
  const roles = ((p.roles as string[]) ?? [p.role as string]).filter(Boolean);
  const alsoBusiness = roles.some((r) => r === 'vendor' || r === 'landlord' || r === 'rider');

  return (
    <section className="flex flex-col gap-4">
      <Link
        href="/admin/students"
        className="text-content-muted hover:text-content inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All students
      </Link>

      <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-content flex flex-wrap items-center gap-2 text-lg font-medium">
              {(p.full_name as string) ?? 'No name set'}
              <Badge
                className={STATUS_BADGE[subject.verificationStatus] ?? STATUS_BADGE.unverified}
              >
                {subject.verificationStatus}
              </Badge>
              {p.suspended_at != null && (
                <Badge className="bg-rose-500/10 text-rose-600">suspended</Badge>
              )}
            </p>
            <p className="text-content-muted text-xs">
              {campusName ?? 'No campus set'}
              {email ? ` · ${email}` : ''}
              {p.phone ? ` · ${p.phone}` : ''}
              {' · joined '}
              {new Date(p.created_at as string).toLocaleDateString('en-NG', {
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>

        <dl className="border-line/10 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-3">
          <Fact label="Matric number" value={identity?.matricNumber} />
          <Fact label="Department" value={identity?.department} />
          <Fact label="Level" value={identity?.level} />
        </dl>

        {p.suspended_reason != null && (
          <p className="text-coral text-xs">Suspended: {p.suspended_reason as string}</p>
        )}

        {alsoBusiness && (
          <p className="border-line/15 bg-surface-deep text-content-muted flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border px-3 py-2 text-xs">
            <span>
              This account also holds {roles.filter((r) => r !== 'student').join(', ')}. That is a
              separate decision, made on its own screen against its own documents nothing you do
              here changes it.
            </span>
            {biz?.slug != null && (
              <Link
                href={`/admin/${biz.category === 'landlord' ? 'landlord' : 'vendors'}/${biz.slug as string}`}
                className="text-accent-fg font-medium hover:underline"
              >
                Open {(biz.business_name as string) ?? 'the business'}
              </Link>
            )}
          </p>
        )}
      </div>

      <RoleReviewTabs tabs={tabs} />
    </section>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-content-muted font-mono text-[11px] tracking-wide uppercase">{label}</dt>
      {/* Named plainly when absent: a blank cell reads as a bug, and "not
          given" is the fact a reviewer needs before bouncing a school ID. */}
      <dd className="text-content truncate text-sm">{value || 'Not given'}</dd>
    </div>
  );
}
