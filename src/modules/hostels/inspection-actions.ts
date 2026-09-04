/**
 * The student's half of a paid viewing.
 *
 * SEPARATE FROM actions.ts because that file is the LANDLORD's: it owns
 * saveHostel, archiveHostel and the listing schema, and is server-only for
 * those. These two are the student's, they share none of that machinery, and
 * putting them there would mean a student action importing a landlord's zod
 * schema to reach a two-line RPC call.
 *
 * NEITHER OF THESE SETTLES A NO-SHOW. `settle_inspection` permits exactly one
 * self-service outcome - the student confirming their own visit as 'completed' -
 * and refuses everything else from a non-staff caller. That rule is right and is
 * why "nobody came" goes through `dispute_inspection`, which moves no money at
 * all: it clears `release_after` so the sweep cannot pay out, and fetches staff.
 */
'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { userMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export type InspectionResult = { ok: true } | { ok: false; error: string };

/** These RPCs postdate the checked-in generated types. REGENERATE. */
function rpc(c: unknown) {
  return (c as SupabaseClient).rpc.bind(c as SupabaseClient) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string; code?: string } | null }>;
}

/**
 * "Yes, we viewed it."
 *
 * Pays the agent immediately rather than waiting out the 24-hour auto-release.
 * The RPC checks that the caller IS the student on the row, so this cannot be
 * used to confirm somebody else's viewing.
 */
export async function confirmViewing(inspectionId: string): Promise<InspectionResult> {
  const supabase = await createClient();
  const { error } = await rpc(supabase)('settle_inspection', {
    p_inspection: inspectionId,
    p_outcome: 'completed',
  });

  if (error) {
    return { ok: false, error: userMessage(error, 'We could not confirm that viewing.') };
  }
  revalidatePath('/user/bookings');
  return { ok: true };
}

/**
 * "Nobody came."
 *
 * Deliberately not a settlement. It holds the fee and tells staff; an
 * accusation must not move money in either direction on its own.
 */
export async function disputeViewing(input: {
  inspectionId: string;
  reason?: string;
}): Promise<InspectionResult> {
  const supabase = await createClient();
  const { error } = await rpc(supabase)('dispute_inspection', {
    p_inspection: input.inspectionId,
    p_reason: input.reason?.trim() || null,
  });

  if (error) {
    return { ok: false, error: userMessage(error, 'We could not send that to staff.') };
  }
  revalidatePath('/user/bookings');
  return { ok: true };
}
