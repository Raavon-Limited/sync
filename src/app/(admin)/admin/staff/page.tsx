/**
 * ROUTE: /admin/staff
 * ACCESS: admin / super_admin can look; only a super admin can change anything.
 * PURPOSE: Who can open this console, and what each of them can do in it.
 *
 * TWO HALVES, DELIBERATELY ON ONE PAGE
 *   The people, and the roles that decide what those people can reach. They are
 *   the same question read from two ends — "what can Musa do" and "who can do
 *   this" — and splitting them across two routes means answering either one
 *   requires both tabs.
 */
import type { Metadata } from 'next';
import { requireStaff } from '@/modules/admin/guard';
import { getStaff } from '@/modules/admin/staff';
import { getAccessRoles } from '@/modules/admin/roles';
import { StaffConsole } from './(components)/staff-console';
import { RolesConsole } from './(components)/roles-console';

export const metadata: Metadata = { title: 'Staff — Admin' };

export default async function Page() {
  const role = await requireStaff();
  const isSuperAdmin = role === 'super_admin';

  const [staff, roles] = await Promise.all([getStaff(), getAccessRoles()]);

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
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

        <StaffConsole staff={staff} isSuperAdmin={isSuperAdmin} />
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-content text-2xl font-medium">
            Roles <span className="text-lime-deep">&amp; access.</span>
          </h2>
          <p className="text-content-muted mt-2 text-sm">
            A role is a set of areas and what can be done in each. Somebody holding two roles gets
            the higher level of the two — adding a role can only ever add access.
          </p>
        </div>

        <RolesConsole roles={roles} canManage={isSuperAdmin} />
      </div>
    </section>
  );
}
