/**
 * ROUTE: /admin/students
 * ACCESS: staff granted the `students` area.
 * PURPOSE: The people the platform exists for - find one, see where they stand,
 *          open them to decide their documents.
 *
 * IT RENDERS THROUGH THE SHARED ACCOUNT BROWSER, like every other tab in the
 * Accounts strip. It used to render the Users console, which is a different
 * shape with its own search, its own filters and stat tiles whose deltas were
 * hardcoded - so one tab behaved unlike the six beside it and showed numbers
 * that were not computed from anything.
 *
 * NARROWED IN THE QUERY, NOT THE CLIENT. A campus with ten thousand students
 * should not ship every vendor and landlord to the browser to be filtered out
 * of view.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { selfieUrlsFor } from '@/modules/admin/selfies';
import { AccountTabs } from '@/components/admin/account-tabs';
import { getStudentIdentities } from '@/modules/students';
import { StudentsBrowser, type StudentRow } from './(components)/students-browser';
import type { Row } from '@/lib/supabase/row';

export const metadata: Metadata = { title: 'Students - Admin' };

export default async function Page() {
  await requireStaffArea('students');

  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, campus_id, campus_other, suspended_at, created_at')
    .eq('role', 'student')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  const students = (profiles ?? []) as Row[];
  const ids = students.map((s) => s.id as string);

  if (ids.length === 0) {
    return <Shell rows={[]} />;
  }

  const campusIds = [...new Set(students.map((s) => s.campus_id).filter(Boolean))] as string[];

  const [{ data: campuses }, { data: docs }, selfieByOwner, { data: authList }, identities] =
    await Promise.all([
      campusIds.length
        ? admin.from('campuses').select('id, name').in('id', campusIds)
        : Promise.resolve({ data: [] }),
      // Every document for these students in one query, counted per owner. One
      // request per student is what makes a queue feel slow.
      admin.from('verification_documents').select('owner_id, role, status').in('owner_id', ids),
      selfieUrlsFor(ids),
      admin.auth.admin.listUsers({ perPage: 1000 }),
      // The STUDENT status, from student_profiles. profiles.verification_status
      // is the vendor mirror, so for a student who also sells it reports the
      // business decision - see modules/students.
      getStudentIdentities(ids),
    ]);

  const campusName = new Map(
    ((campuses ?? []) as Row[]).map((c) => [c.id as string, c.name as string]),
  );
  const emailById = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? '-']));

  /*
   * THE STUDENT'S OWN DOCUMENTS, NOT THE PERSON'S.
   *
   * verification_documents is keyed on the owner, so a student who also lets a
   * room had their landlord's four counted here too   a card reading "7/7
   * approved" against a three-document requirement list, on a queue whose
   * entire job is to say how far along each student is. The detail screen was
   * fixed for this; the card that leads to it was still counting the pile.
   *
   * Null is counted in, and only here: it means "applies to any application"
   * for rows written before 20260905210000, and leaving them out would make an
   * old, complete folder read as empty.
   */
  const tally = new Map<string, { total: number; approved: number }>();
  for (const d of (docs ?? []) as Row[]) {
    const role = (d.role as string | null) ?? null;
    if (role !== null && role !== 'student') continue;
    const id = d.owner_id as string;
    const t = tally.get(id) ?? { total: 0, approved: 0 };
    t.total++;
    if (d.status === 'approved') t.approved++;
    tally.set(id, t);
  }

  const rows: StudentRow[] = students.map((s) => {
    const t = tally.get(s.id as string) ?? { total: 0, approved: 0 };
    return {
      id: s.id as string,
      name: (s.full_name as string) ?? 'No name set',
      email: emailById.get(s.id as string) ?? '-',
      // The named campus wins; `campus_other` is the free text somebody typed
      // when their school was not in the list, and is better than nothing.
      campus: campusName.get(s.campus_id as string) ?? (s.campus_other as string) ?? null,
      verificationStatus: identities.get(s.id as string)?.verificationStatus ?? 'unverified',
      matricNumber: identities.get(s.id as string)?.matricNumber ?? null,
      department: identities.get(s.id as string)?.department ?? null,
      docs: t.total,
      approvedDocs: t.approved,
      suspended: Boolean(s.suspended_at),
      selfieUrl: selfieByOwner.get(s.id as string),
    };
  });

  return <Shell rows={rows} />;
}

function Shell({ rows }: { rows: StudentRow[] }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / ACCOUNTS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          The <span className="text-lime-deep">students.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          {rows.length} student {rows.length === 1 ? 'account' : 'accounts'}. Open one to review
          what they have uploaded.
        </p>
      </div>

      <AccountTabs active="students" />

      <StudentsBrowser rows={rows} />
    </section>
  );
}
