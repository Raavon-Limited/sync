/**
 * What a landlord can do to a tenancy that is not accepting or declining it.
 *
 * BOTH OF THESE WERE BUTTONS BEFORE THEY WERE ACTIONS. "Send payment reminder"
 * set a boolean in React state and popped a toast saying the reminder had been
 * sent; nothing was sent, and the landlord was handed a receipt for a message
 * the tenant never got. Grace did not exist at all - landlords were extending
 * stays by agreement, with nothing in Sync recording it, so the room read as
 * available while somebody was living in it.
 *
 * THE RULES ARE IN THE DATABASE, NOT HERE. Who owns the property, whether a
 * reminder is warranted, and the three-month cap on grace are all enforced by
 * the RPCs. These wrappers exist to turn a raised exception into a sentence,
 * not to decide anything - a check in this file could be skipped by any other
 * caller.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { userMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export type LandlordActionResult = { ok: true; detail?: string } | { ok: false; error: string };

/** Every landlord screen that shows a tenant or a lease date. */
function refreshLandlordScreens() {
  revalidatePath('/landlord');
  revalidatePath('/landlord/tenants');
  revalidatePath('/landlord/requests');
}

/**
 * Nudge a tenant about unpaid rent, or a lease that is ending.
 *
 * The RPC refuses a paid, mid-term tenancy and refuses a second reminder on the
 * same day, so both of those come back as the database's own sentence rather
 * than a house string - "You have already reminded this tenant today." is the
 * whole answer and there is nothing to add to it.
 */
export async function sendRentReminder(bookingId: string): Promise<LandlordActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('send_rent_reminder', { p_booking: bookingId });

  if (error) {
    return { ok: false, error: userMessage(error, 'We could not send that reminder.') };
  }

  refreshLandlordScreens();
  // 'unpaid' or 'expiring' - which conversation the tenant was actually sent.
  return { ok: true, detail: (data as string) ?? undefined };
}

/**
 * Let a tenant stay past the end of their lease.
 *
 * `until` is a yyyy-mm-dd date. The cap is three months past `end_date` and it
 * is checked in the database: a date picker with a max attribute is a courtesy,
 * not a rule.
 */
export async function grantLeaseGrace(input: {
  bookingId: string;
  until: string;
}): Promise<LandlordActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('grant_lease_grace', {
    p_booking: input.bookingId,
    p_until: input.until,
  });

  if (error) {
    // The RPC's refusals are written for a person and name the actual limit
    // ("Grace runs to at most 11 August 2027..."), so they are passed through.
    return { ok: false, error: userMessage(error, 'We could not extend that stay.') };
  }

  refreshLandlordScreens();
  return { ok: true };
}
