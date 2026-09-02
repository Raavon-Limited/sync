/**
 * ROUTE: /admin/card
 * ACCESS: any staff account. No area is required and that is deliberate   this
 *         page is about the PERSON, not about a part of the console. A reviewer
 *         granted riders alone still knocks on doors.
 * PURPOSE: The staff ID card, and the QR somebody can scan to check it.
 *
 * WHY STAFF NEED ONE MOST
 *   Every other card answers "is this account real". This one answers a
 *   question with a sharper edge: a person is standing in front of a landlord
 *   asking to see their documents, and claiming to be from Sync. Until now the
 *   honest answer to "how do I know that?" was that there wasn't one   which
 *   makes impersonating staff the cheapest attack on the platform, and the one
 *   with the most to steal at the end of it.
 *
 * WHAT THE CARD SAYS AND WHAT IT DOES NOT
 *   It names the console role they hold, because that is the claim being
 *   tested. It does not list areas, permissions or an email address: a card is
 *   handed to strangers, and "which parts of the admin console this person can
 *   open" is not a stranger's business.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MySyncIdCard } from '@/components/account/my-sync-id-card';
import { SettingsSection } from '@/components/account/settings-section';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { isStaffRole } from '@/modules/admin/guard';

export const metadata: Metadata = { title: 'Your staff ID   Admin' };

// The card's status is "are they still staff", which is exactly the thing that
// must not be served from a cache after somebody is removed.
export const dynamic = 'force-dynamic';

/** The named console role, when they hold one. A super admin may hold none. */
async function consoleRole(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('access_members')
    .select('access_roles(name, scope)')
    .eq('user_id', userId);

  const rows = (data ?? []) as Row[];
  for (const r of rows) {
    const role = r.access_roles as Row | null;
    if (role?.scope === 'admin' && role?.name) return role.name as string;
  }
  return null;
}

export default async function Page() {
  const [profile, user] = await Promise.all([getProfile(), getCurrentUser()]);

  // Guarded on being STAFF rather than on an area, for the reason in the
  // header. Everything on the page is about this person's own account.
  if (!profile || !isStaffRole(profile.role)) redirect('/403');

  const roleName = await consoleRole(profile.id);
  const label = roleName ?? (profile.role === 'super_admin' ? 'Super admin' : 'Admin');

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / MY ID</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Your staff <span className="text-lime-deep">ID.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          Show this when you ask somebody for their documents. Whoever scans it gets a live answer
          from Sync   if your access is ever removed, the card stops vouching for you the same
          minute.
        </p>
      </div>

      <SettingsSection
        title="Your Sync ID"
        description="Downloadable, printable, and addressed by a code that appears nowhere else. Reissue it the moment a printed one goes missing."
      >
        <MySyncIdCard
          kind="staff"
          holderName={profile.full_name}
          context={`Sync staff · ${label}`}
          // Staff status is a grant, not a document check: holding console
          // access IS the credential, so the card says so plainly rather than
          // reporting the personal verification_status, which for a staff
          // account is usually 'unverified' and would read as a warning.
          status="verified"
          memberSince={user?.created_at ?? null}
          photoUrl={profile.avatar_url}
          facts={[{ label: 'Console role', value: label }]}
          fileName="staff"
        />
      </SettingsSection>
    </section>
  );
}
