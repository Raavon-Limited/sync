/**
 * ROUTE: /landlord/receipts
 * ACCESS: landlord (gated in proxy.ts)
 * PURPOSE: The paperwork for every tenancy on their properties.
 *
 * READ FROM `escrow_holds`, NOT FROM THE LANDLORD'S WALLET.
 *   A landlord wants the receipt for a tenancy the moment the student pays -
 *   that is when the tenancy is real and when a tenant might ask for one. Their
 *   wallet sees nothing until the hold matures a week after move-in, so a
 *   wallet-derived list would leave a landlord with a paid, confirmed tenant
 *   and no document to show for another fortnight.
 *
 *   `escrow_holds_party` scopes the table to payer and payee, so this needs no
 *   landlord_id filter beyond `payee_id` - and could not read somebody else's
 *   even if it tried.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth/queries';
import { PageHeader } from '../(components)/shared/page-header';
import { LandlordReceiptsClient } from './receipts-client';

export const metadata: Metadata = { title: 'Receipts' };

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/landlord/receipts');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Receipts"
        description="Rent collected on your properties, and what Sync took."
      />
      <LandlordReceiptsClient />
    </div>
  );
}
