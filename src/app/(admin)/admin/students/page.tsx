/**
 * ROUTE: /admin/students
 * ACCESS: staff granted the `students` area.
 * PURPOSE: The people the platform exists for — find one, see their state,
 *          suspend or archive.
 *
 * IT REUSES THE USERS CONSOLE RATHER THAN GROWING A SECOND ONE
 *   Search, the status filter, the card/table toggle, the detail modal and the
 *   suspend and archive actions are all already built in UsersClient and all
 *   apply unchanged to a student. The only real difference is which rows are on
 *   screen, and that is a `where` clause — a second console would be a copy to
 *   keep in step, and the copy would drift.
 *
 *   The role tab strip is hidden here for the same reason: with the rows
 *   narrowed to students, a "Vendors" tab that can only ever be empty is a
 *   control that lies about what is on the screen.
 *
 * NARROWED IN THE QUERY, NOT THE CLIENT. A campus with ten thousand students
 * should not ship every vendor and landlord to the browser to be filtered out
 * of view.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { AccountTabs } from '@/components/admin/account-tabs';
import { UsersClient } from '../users/user-componenets/UsersClient';
import type { ProfileRow } from '../users/page';

export const metadata: Metadata = { title: 'Students — Admin' };

export default async function Page() {
  const role = await requireStaffArea('students');
  const isSuperAdmin = role === 'super_admin';

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, role, full_name, vendor_category, verification_status, archived_at, created_at')
    .eq('role', 'student')
    .order('created_at', { ascending: false });

  // listUsers is the only way to an email — the Auth admin API has no
  // lookup-by-id in bulk — so it is paged once and joined in memory, exactly as
  // /admin/users does it.
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((list?.users ?? []).map((u) => [u.id, u.email ?? '—']));

  const rows = ((profiles ?? []) as ProfileRow[]).map((r) => ({
    ...r,
    email: emailById.get(r.id) ?? '—',
  }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / ACCOUNTS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          The <span className="text-lime-deep">students.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          {rows.length} student {rows.length === 1 ? 'account' : 'accounts'}. Everyone else lives
          under their own tab, or all together under Users.
        </p>
      </div>

      <AccountTabs active="students" />

      <UsersClient rows={rows} isSuperAdmin={isSuperAdmin} hideRoleTabs />
    </section>
  );
}
