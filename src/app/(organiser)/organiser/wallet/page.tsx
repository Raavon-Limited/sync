/**
 * ROUTE: /organiser/wallet
 * ACCESS: role=event_manager, enforced by the proxy.
 * PURPOSE: The balance, and every movement in and out of it.
 *
 * IT IS THE SAME PANEL THE STUDENT WALLET USES, and that is not laziness.
 * `WalletPanel` reads the CALLER'S wallet through useWallet() - there is one
 * wallets row per person, whatever roles they hold - so an organiser opening
 * this sees their own balance and their own ledger with no role-specific
 * behaviour to get wrong. A second copy would be a second thing to fix the next
 * time a ledger kind is added.
 *
 * WHAT IS NOT HERE YET: released ticket money lands in this balance through
 * release_event_escrow, but there is no payout-to-bank flow for an organiser -
 * `payout_requests` rows can be created and no Paystack Transfer exists
 * anywhere in the codebase. Money can arrive; it cannot yet leave.
 */
import type { Metadata } from 'next';
import { WalletPanel } from '@/app/user/wallet/(components)/wallet-panel';

export const metadata: Metadata = { title: 'Wallet' };

export default function Page() {
  return <WalletPanel />;
}
