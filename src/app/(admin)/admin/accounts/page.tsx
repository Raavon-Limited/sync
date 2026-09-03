/**
 * ROUTE: /admin/accounts
 * ACCESS: staff granted the `users` area.
 * PURPOSE: Everybody on the platform, what they are, and whether they passed
 *          verification.
 *
 * IT REPLACES "ALL BUSINESSES" AS THE FIRST TAB
 *   That tab was the vendor queue wearing the word "all", which was only true
 *   if you thought of the platform as businesses. Students outnumber every
 *   other role and were absent from it; so were riders and organisers. "All"
 *   should mean all.
 *
 * THE HARD PART IS THAT VERIFICATION LIVES IN FOUR TABLES
 *   vendor_profiles for a vendor or landlord, rider_profiles for a rider,
 *   student_profiles for a student, profiles for an organiser or creator. That
 *   is not sprawl - it is what lets one person be a verified student and a
 *   rejected vendor at the same time, which a single column cannot express.
 *
 *   So this page resolves each person's status from the table that is the
 *   authority FOR THE ROLE THEY ARE WEARING. Reading `profiles` alone would
 *   report the business decision for anyone who is both, which is the exact bug
 *   those tables exist to prevent.
 *
 * ADMINS HAVE NO VERIFICATION and are shown as such rather than as unverified.
 * Staff are not accounts that trade; "unverified" would read as an outstanding
 * task that nobody can ever complete.
 */
import type { Metadata } from 'next';
import { requireStaff } from '@/modules/admin/guard';
import { visibleAreas } from '@/modules/access/guard';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { selfieUrlsFor } from '@/modules/admin/selfies';
import { AccountTabs } from '@/components/admin/account-tabs';
import { AccountsBrowser, type AccountRow } from './(components)/accounts-browser';
import type { Row } from '@/lib/supabase/row';
import type { SupabaseClient } from '@supabase/supabase-js';

export const metadata: Metadata = { title: 'All accounts - Admin' };

/** student_profiles postdates the checked-in generated types. REGENERATE later. */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

const ROLE_LABEL: Record<string, string> = {
  student: 'Student',
  vendor: 'Vendor',
  landlord: 'Landlord',
  rider: 'Rider',
  event_manager: 'Event organiser',
  creator: 'Content creator',
  admin: 'Admin',
  super_admin: 'Super admin',
};

/** Staff do not trade, so they have nothing to verify. */
const STAFF = new Set(['admin', 'super_admin']);

/**
 * Which grant lets somebody see a row, by the role that row is wearing.
 *
 * THIS PAGE USED TO NEED THE 'users' GRANT AND SHOW EVERYTHING, which was
 * workable only while a second tab   "Businesses"   existed for reviewers who
 * did not hold it. That tab was the same list under the wrong name, so it is
 * gone, and this page absorbed its job: it opens for anyone who can review ANY
 * kind of account and shows them exactly the kinds they can open.
 *
 * A reviewer granted `vendors` alone therefore sees the businesses and nothing
 * else, which is the list the removed tab was supposed to be. 'users' is still
 * meaningful   it is the only grant that shows every kind at once, staff
 * included   but it is no longer the price of admission.
 *
 * Mirrors ACCOUNT_AREA in modules/admin/account-types, which does the same job
 * for the flattened queue. Two maps because they are keyed differently: that
 * one by AccountKind, this one by the role on the profile row.
 */
const ROLE_AREA: Record<string, string> = {
  student: 'students',
  vendor: 'vendors',
  landlord: 'landlords',
  rider: 'riders',
  event_manager: 'events',
  creator: 'events',
  admin: 'users',
  super_admin: 'users',
};

async function loadAccounts(): Promise<AccountRow[]> {
  const admin = createAdminClient();

  const { data: profileRows } = await admin
    .from('profiles')
    .select('id, full_name, role, roles, verification_status, suspended_at, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  const profiles = (profileRows ?? []) as Row[];
  if (profiles.length === 0) return [];

  const ids = profiles.map((p) => p.id as string);

  const [{ data: vendors }, { data: riders }, students, selfieByOwner, { data: authList }] =
    await Promise.all([
      admin.from('vendor_profiles').select('id, slug, verification_status').in('id', ids),
      admin.from('rider_profiles').select('id, verification_status').in('id', ids),
      loose(admin)
        .from('student_profiles')
        .select('id, verification_status')
        .in('id', ids)
        .then((r) => (r.error ? [] : ((r.data ?? []) as Row[]))),
      selfieUrlsFor(ids),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);

  const vendorById = new Map(((vendors ?? []) as Row[]).map((v) => [v.id as string, v]));
  const riderById = new Map(((riders ?? []) as Row[]).map((r) => [r.id as string, r]));
  const studentById = new Map((students as Row[]).map((s) => [s.id as string, s]));
  const emailById = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? '-']));

  return profiles.map((p) => {
    const id = p.id as string;
    const role = (p.role as string) ?? 'student';
    const vendor = vendorById.get(id);
    const rider = riderById.get(id);
    const student = studentById.get(id);

    // The authority for the role being WORN. See the header.
    let status = 'unverified';
    let href = '/admin/users';
    if (STAFF.has(role)) {
      status = 'n/a';
      href = '/admin/staff';
    } else if (role === 'vendor' || role === 'landlord') {
      status = (vendor?.verification_status as string) ?? 'unverified';
      href = vendor?.slug
        ? `/admin/${role === 'landlord' ? 'landlord' : 'vendors'}/${vendor.slug as string}`
        : '/admin/users';
    } else if (role === 'rider') {
      status = (rider?.verification_status as string) ?? 'unverified';
      href = `/admin/riders/${id}`;
    } else if (role === 'student') {
      status = (student?.verification_status as string) ?? 'unverified';
      href = `/admin/students/${id}`;
    } else if (role === 'event_manager' || role === 'creator') {
      // No authority table of their own: profiles IS the authority, because
      // neither role can hold a business row. READ it   hardcoding 'unverified'
      // here showed a pending organiser as if they had never applied.
      status = (p.verification_status as string) ?? 'unverified';
      href = `/admin/events/${id}`;
    }

    /*
     * EVERY ROLE THIS ACCOUNT HOLDS, EACH WITH ITS OWN DECISION.
     *
     * The card used to show ONE status   the worn role's   and name the others
     * as "+LANDLORD", a hat with no state attached. So a verified student who
     * is a pending landlord read as VERIFIED +LANDLORD, which is the one thing
     * that is not true about them: nobody has decided the landlord half.
     *
     * The status is resolved per role from the table that is the authority FOR
     * THAT ROLE   the same rule the header of this file sets out, applied once
     * per hat instead of once per person.
     */
    const statusFor = (r: string): string => {
      if (STAFF.has(r)) return 'n/a';
      if (r === 'vendor' || r === 'landlord')
        return (vendor?.verification_status as string) ?? 'unverified';
      if (r === 'rider') return (rider?.verification_status as string) ?? 'unverified';
      if (r === 'student') return (student?.verification_status as string) ?? 'unverified';
      // event_manager and creator hold no table of their own: profiles IS the
      // authority for them, because neither can hold a business row.
      return (p.verification_status as string) ?? 'unverified';
    };

    const heldRoles = [role, ...((p.roles as string[]) ?? [])].filter(
      (r, i, a) => r && ROLE_LABEL[r] && a.indexOf(r) === i,
    );
    const credentials = heldRoles.map((r) => ({
      role: r,
      label: ROLE_LABEL[r] ?? r,
      status: statusFor(r),
    }));

    const held = ((p.roles as string[]) ?? []).filter((r) => r !== role && ROLE_LABEL[r]);

    return {
      id,
      name: (p.full_name as string) ?? 'No name set',
      email: emailById.get(id) ?? '-',
      role,
      roleLabel: ROLE_LABEL[role] ?? role,
      alsoRoles: held.map((r) => ROLE_LABEL[r] ?? r),
      verificationStatus: status,
      credentials,
      href,
      suspended: Boolean(p.suspended_at),
      selfieUrl: selfieByOwner.get(id),
    };
  });
}

export default async function Page() {
  await requireStaff();

  // null is a super admin: every kind. Otherwise the list is cut to the kinds
  // this reviewer is allowed to open, and somebody holding none of them is not
  // shown an empty page   they are refused, because "no accounts" and "not your
  // screen" are different answers.
  const areas = await visibleAreas();
  if (areas && !Object.values(ROLE_AREA).some((a) => areas.includes(a))) redirect('/403');

  const all = await loadAccounts();
  const rows = areas ? all.filter((r) => areas.includes(ROLE_AREA[r.role] ?? 'users')) : all;
  const waiting = rows.filter((r) => r.verificationStatus === 'pending').length;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / ACCOUNTS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Everyone on <span className="text-lime-deep">Sync.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          {rows.length} {rows.length === 1 ? 'account' : 'accounts'}
          {waiting > 0 && `, ${waiting} waiting on a verification decision`}. Each row shows the
          role being worn and that role&rsquo;s own verification.
        </p>
      </div>

      <AccountTabs active="all" />

      <AccountsBrowser rows={rows} />
    </section>
  );
}
