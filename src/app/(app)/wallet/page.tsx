/**
 * ROUTE: /wallet
 * ACCESS: authenticated student
 *
 * REDIRECT, NOT A SECOND IMPLEMENTATION
 *   The student wallet already exists at /user/wallet, wired to the ledger. A
 *   second wallet screen would be two places to fix every balance bug, and two
 *   screens that can disagree about how much money someone has. This route is
 *   kept because links to it exist; it points at the real one.
 */
import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/user/wallet');
}
