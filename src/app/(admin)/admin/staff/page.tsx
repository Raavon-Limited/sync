/**
 * ROUTE: /admin/staff
 * ACCESS: admin / super_admin can look; only a super admin can change anything.
 * PURPOSE: Who can open this console, and what each of them can do in it.
 *
 * TWO HALVES, ONE ROUTE, TWO TABS
 *   The people, and the roles that decide what those people can reach. They are
 *   the same question read from two ends   "what can Musa do" and "who can do
 *   this"   so they stay on one route: splitting them across two would mean
 *   answering either one needed both URLs.
 *
 *   They were stacked on one scroll for a while, which put the roles editor
 *   below a roster that grows without limit. Tabs keep the single route and the
 *   shared data fetch, and stop the second half being something you have to
 *   scroll past a hiring round to reach.
 *
 * BOTH PANELS ARE FETCHED HERE, not per tab. `getAccessRoles` feeds both   the
 * roles editor lists its members, and the roster shows each person's roles as
 * chips   so fetching per tab would be the same query twice and the two halves
 * could disagree about who holds what.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { getStaff } from '@/modules/admin/staff';
import { getAccessRoles } from '@/modules/admin/roles';
import { getStaffInvites } from '@/modules/admin/invites';
import { StaffConsole } from './(components)/staff-console';
import { RolesConsole } from './(components)/roles-console';
import { StaffTabs } from './(components)/staff-tabs';

export const metadata: Metadata = { title: 'Staff   Admin' };

export default async function Page() {
  const role = await requireStaffArea('staff');
  const isSuperAdmin = role === 'super_admin';

  const [staff, roles, invites] = await Promise.all([
    getStaff(),
    getAccessRoles(),
    getStaffInvites(),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / STAFF</h1>
        {/* Not "Who runs Sync" any more: that is the name of a TAB now, and a
            page titled the same as one of its two tabs reads as the wrong one
            being selected whenever you are on the other. */}
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Staff <span className="text-lime-deep">&amp; access.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          Who can open this console, and what each of them can reach. Every change here is recorded
          against the person who made it.
        </p>
      </div>

      <StaffTabs
        peopleCount={staff.length}
        pendingCount={invites.length}
        roleCount={roles.length}
        people={
          <div className="flex flex-col gap-4">
            <p className="text-content-muted text-sm">
              {staff.length} {staff.length === 1 ? 'person has' : 'people have'} console access
              {invites.length > 0 &&
                `, and ${invites.length} ${
                  invites.length === 1 ? 'invitation is' : 'invitations are'
                } waiting to be accepted`}
              . What each of them can reach is the role they hold   set it here, or build the roles
              themselves under Roles &amp; access.
            </p>
            <StaffConsole
              staff={staff}
              invites={invites}
              roles={roles}
              isSuperAdmin={isSuperAdmin}
            />
          </div>
        }
        roles={
          <div className="flex flex-col gap-4">
            <p className="text-content-muted text-sm">
              A role is a set of areas and what can be done in each. Somebody holding two roles gets
              the higher level of the two   adding a role can only ever add access.
            </p>
            <RolesConsole roles={roles} canManage={isSuperAdmin} />
          </div>
        }
      />
    </section>
  );
}
