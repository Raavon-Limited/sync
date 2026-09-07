/**
 * What a room costs a student, and what the landlord takes home.
 *
 * THIS MIRRORS `public.quote_rent` (20260909090000) EXACTLY
 *   Same rate, same rounding, same branch. The database is the authority   it
 *   is what freezes `escrow_holds.commission_kobo`   and this exists so a
 *   listing card can itemise the charge without an RPC per card. If the two
 *   ever disagree, the SQL is right and this is the bug.
 *
 * ROUNDING FAVOURS THE PAYER. Integer division floors, matching
 * `private.rent_charge`, so the fee is never rounded up against whoever bears
 * it. At most one kobo per booking, in the student's or landlord's favour.
 *
 * WHAT IS NOT IN HERE
 *   The inspection fee. A visit is a separate purchase that most students never
 *   make, it is paid to the AGENT and not to the landlord, and Sync takes no
 *   commission on it. Adding it to a rent total   which the listing page used
 *   to do, under the heading "Mandatory Inspection Fee"   overstates the cost
 *   of every room by the price of a service nobody has bought.
 */
import type { FeeMode } from './types';

/** Sync's share of rent, in basis points. `rent_charge_pct` = 2.5 in app_settings. */
export const RENT_CHARGE_BPS = 250;

export interface RentQuote {
  /** The landlord's listed price for a session. */
  rentKobo: number;
  /** Sync's 2.5%, always computed on the rent and never on the total. */
  feeKobo: number;
  /** What the student is actually charged. */
  totalKobo: number;
  /** What reaches the landlord when the rent releases, a week after move-in. */
  landlordNetKobo: number;
  feeMode: FeeMode;
}

/**
 * Itemise a session of rent.
 *
 * Both modes charge Sync the same 2.5% of the rent; the only difference is
 * which side of the transaction it comes out of.
 */
export function rentQuote(rentKobo: number, feeMode: FeeMode = 'absorb'): RentQuote {
  const rent = Math.max(0, Math.trunc(rentKobo));
  const fee = Math.floor((rent * RENT_CHARGE_BPS) / 10_000);
  const passedOn = feeMode === 'pass_on';

  return {
    rentKobo: rent,
    feeKobo: fee,
    totalKobo: passedOn ? rent + fee : rent,
    landlordNetKobo: passedOn ? rent : rent - fee,
    feeMode,
  };
}

/** 30000000 -> "₦300,000". Whole naira: rent is never quoted in kobo. */
export function naira(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;
}
