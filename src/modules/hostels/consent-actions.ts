/**
 * The student agreeing to the tenancy terms.
 *
 * IT IS A SEPARATE ACT FROM PAYING, and that is the entire point. Paying used
 * to be the only thing that happened, so it silently stood in for agreement to
 * terms the student may never have opened. Consent has to be its own recorded
 * act, and it has to come first.
 *
 * THE RULE IS NOT IN THIS FILE. `bookings_require_terms` refuses the move to
 * `confirmed` without it, so a payment attempted without consent aborts the
 * whole transaction - no wallet debit, no escrow row. A check here would only
 * be a courtesy that any other caller could skip.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { userMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export type ConsentResult = { ok: true } | { ok: false; error: string };

export async function acceptTenancyTerms(bookingId: string): Promise<ConsentResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('accept_tenancy_terms', { p_booking: bookingId });

  if (error) {
    return { ok: false, error: userMessage(error, 'We could not record that.') };
  }

  revalidatePath('/user');
  revalidatePath('/user/bookings');
  return { ok: true };
}
