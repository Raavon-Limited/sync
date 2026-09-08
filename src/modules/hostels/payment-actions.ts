/**
 * The student's side of a held room: pay it, confirm it, or take the money back.
 *
 * WHY THESE ARE RPCs AND THE ACCEPT WAS NOT. `acceptBookingRequest` is a plain
 * status update because RLS plus `guard_booking_privileged_cols` already narrow
 * it to exactly what a landlord may do. These move money, and money is not
 * something a policy can narrow: paying has to recompute the price, check the
 * hold has not lapsed, debit a wallet and open an escrow row in one transaction
 * that either all happens or none of it does. That is a function in the
 * database, and these are thin calls onto it.
 *
 * NOTHING HERE TRUSTS AN AMOUNT FROM THE CLIENT. `pay_booking_from_wallet`
 * recomputes the total with `quote_rent`, which is also what applies fee_mode.
 * A price is never a parameter.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { userMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export type PayResult = { ok: true } | { ok: false; error: string };

/** Every screen that shows a booking, on both sides of it. */
function refreshBookingScreens() {
  revalidatePath('/user');
  revalidatePath('/user/bookings');
  revalidatePath('/user/wallet');
  revalidatePath('/landlord');
  revalidatePath('/landlord/requests');
  revalidatePath('/landlord/tenants');
}

/**
 * Pay the rent from the wallet and set the move-in date.
 *
 * `moveIn` IS COLLECTED HERE AND NOWHERE ELSE, deliberately. Asking at request
 * time means asking somebody to commit to a date for a room they may not be
 * given; payment is the first moment the tenancy is real. It also dates the
 * escrow: `apply_escrow_settings` releases rent at `move_in + 7 days`, and with
 * a null move_in that silently fell back to seven days from payment.
 */
export async function payBookingFromWallet(input: {
  bookingId: string;
  moveIn: string;
}): Promise<PayResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('pay_booking_from_wallet', {
    p_booking: input.bookingId,
    p_move_in: input.moveIn,
  });

  if (error) {
    // The database raises sentences, not codes: "Your wallet has X but the rent
    // is Y", "That hold has expired". Those are the message, so userMessage
    // passes them through rather than replacing them with a house string.
    return { ok: false, error: userMessage(error, 'We could not take that payment.') };
  }

  refreshBookingScreens();
  return { ok: true };
}

/**
 * "I moved in." Closes the 72-hour refund window early.
 *
 * Only the student can call this. A landlord able to confirm move-in could end
 * the refund window on behalf of the person it exists to protect.
 */
export async function confirmMoveIn(bookingId: string): Promise<PayResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('confirm_move_in', { p_booking: bookingId });
  if (error) return { ok: false, error: userMessage(error, 'We could not confirm that.') };
  refreshBookingScreens();
  return { ok: true };
}

/**
 * Take the money back, inside 72 hours and before confirming move-in.
 *
 * Not a dispute. This is the cooling-off door and it needs no staff: the money
 * is still in escrow, the landlord has not been paid, and the room goes back on
 * the market. After the window, or after confirmation, `disputes` is the route.
 */
export async function refundBooking(bookingId: string): Promise<PayResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('refund_booking', { p_booking: bookingId });
  if (error) return { ok: false, error: userMessage(error, 'We could not refund that.') };
  refreshBookingScreens();
  return { ok: true };
}

/** The landlord's half of the handshake: "this tenant is in." */
export async function markMovedIn(bookingId: string): Promise<PayResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_moved_in', { p_booking: bookingId });
  if (error) return { ok: false, error: userMessage(error, 'We could not mark that.') };
  refreshBookingScreens();
  return { ok: true };
}
