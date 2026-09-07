/**
 * Layout for /landlord - landlord-specific dashboard. Distinct from /vendor
 * because landlords run a fundamentally different flow (long-term tenancy with
 * caution fees) and need their own navigation. Its sidebar nav lives in
 * config/dashboard-nav under the `landlord` key.
 *
 * Authorization is enforced by the proxy, and on HOLDING landlord rather than
 * wearing it   a landlord invited onto staff has an active role of 'admin' and
 * is still the owner of these hostels. Nothing here re-checks the role: these
 * queries are scoped by landlord_id = auth.uid() in RLS, so a viewer gets their
 * own rows whichever hat they have on.
 *
 * AND THE MIRROR OF THE REDIRECT IN /vendor: a business that is not a landlord
 * does not belong on the landlord dashboard, whichever role it happens to be
 * wearing. The two conditions cannot both be true, so the pair cannot loop
 * and an account with no business row at all matches neither and stays where
 * it is, which is what lets an unfinished signup reach its overview.
 */
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layouts/dashboard-shell';
import { getBusinessKind } from '@/modules/vendor/business-kind';

export default async function LandlordLayout({ children }: { children: React.ReactNode }) {
  if ((await getBusinessKind()) === 'vendor') redirect('/vendor');

  return (
    <DashboardShell navKey="landlord" doodle="house">
      {children}
    </DashboardShell>
  );
}
