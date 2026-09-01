/**
 * ROUTE: /admin/staff
 * ACCESS: admin / super_admin can look; only a super admin can change anything.
 * PURPOSE: Who can open this console, and the one place that changes.
 *
 * VISIBLE TO EVERY ADMIN, EDITABLE BY ONE
 *   An admin who cannot see who else has access cannot tell whether an account
 *   they do not recognise is a colleague or a problem. Hiding the page from
 *   them would make the console less accountable, not more secure — the
 *   security is that `set_account_role` refuses them, in the database.
 */
import type { Metadata } from 'next';
import { requireStaff } from '@/modules/admin/guard';
import { getStaff } from '@/modules/admin/staff';
import { StaffConsole } from './(components)/staff-console';

export const metadata: Metadata = { title: 'Staff — Admin' };

export default async function Page() {
  const role = await requireStaff();
  const staff = await getStaff();

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / STAFF</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Who runs <span className="text-lime-deep">Sync.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          {staff.length} {staff.length === 1 ? 'person has' : 'people have'} console access. Every
          change here is recorded against the person who made it.
        </p>
      </div>

      <StaffConsole staff={staff} isSuperAdmin={role === 'super_admin'} />
    </section>
  );
}
