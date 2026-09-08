/**
 * Keeping a room for another term.
 *
 * BOTH SIDES CAN START IT, and whoever did not start it is the one who
 * answers - `respond_to_renewal` refuses an accept from the person who asked,
 * because accepting your own request would commit the other party to a term
 * they never agreed to. Withdrawing is the verb available to the asker.
 *
 * NOTHING HERE DECIDES ANYTHING. The window, who may call, one-open-request,
 * and the rule about answering your own request all live in the RPCs; these
 * wrappers turn a raised exception into a sentence. A check in this file could
 * be skipped by any other caller.
 *
 * AND NOTHING HERE CREATES A BOOKING. The follow-on booking is made by
 * `complete_ended_tenancies` at the moment the old tenancy ends, in one
 * transaction, because the per-room unique index will not hold two live
 * bookings on one room and any gap between the two statements is a gap another
 * student can book into. See 20260914120000.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { userMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export type RenewalResult = { ok: true; detail?: string } | { ok: false; error: string };

function refreshBoth() {
  revalidatePath('/user');
  revalidatePath('/user/bookings');
  revalidatePath('/landlord');
  revalidatePath('/landlord/tenants');
}

/** Ask to continue this tenancy. Either party may call it. */
export async function requestRenewal(bookingId: string): Promise<RenewalResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('request_renewal', { p_booking: bookingId });
  if (error) {
    // The RPC's refusals name the actual date renewal opens, so they are
    // passed through rather than replaced with a house string.
    return { ok: false, error: userMessage(error, 'We could not send that renewal request.') };
  }
  refreshBoth();
  return { ok: true };
}

/**
 * Answer one. `accept: false` from the other party declines it; from the person
 * who asked, it withdraws it - the RPC distinguishes them and returns which.
 */
export async function respondToRenewal(input: {
  bookingId: string;
  accept: boolean;
}): Promise<RenewalResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('respond_to_renewal', {
    p_booking: input.bookingId,
    p_accept: input.accept,
  });
  if (error) {
    return { ok: false, error: userMessage(error, 'We could not record that answer.') };
  }
  refreshBoth();
  return { ok: true, detail: (data as string) ?? undefined };
}
