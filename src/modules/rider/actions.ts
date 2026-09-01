/**
 * Everything a rider or a fleet owner does to their own account.
 *
 * WHY THESE ARE SERVER ACTIONS AND NOT DIRECT CLIENT WRITES
 *   Half of what is here goes through RPCs whose whole purpose is to check
 *   something the client cannot be trusted to check — that a delivery is
 *   actually yours, that you are verified before going on the board, that a
 *   status change is a legal move. Routing them through one module keeps the
 *   revalidation in step too: every one of these changes what /rider renders.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { userMessage } from '@/lib/errors';

/** On or off the dispatch board. Going online requires a verified, unsuspended account. */
export async function setRiderOnline(online: boolean) {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('set_rider_online', { p_online: online });
  if (error) throw new Error(userMessage(error, 'We could not change your status.'));
  revalidatePath('/rider');
}

/**
 * Take an unclaimed delivery.
 *
 * The race is settled in the database by delivery_offers_one_accepted_idx, so
 * the loser of a simultaneous tap gets a sentence rather than a stack trace.
 */
export async function claimDelivery(deliveryId: string) {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('claim_delivery', { p_delivery_id: deliveryId });
  if (error) throw new Error(userMessage(error, 'We could not take that delivery.'));
  revalidatePath('/rider');
}

/** Move a delivery you are carrying to its next state. */
export async function advanceDelivery(deliveryId: string, status: string) {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('advance_delivery', {
    p_delivery_id: deliveryId,
    p_status: status,
  });
  if (error) throw new Error(userMessage(error, 'We could not update that delivery.'));
  revalidatePath('/rider');
}

/** Ask staff to review your rider account. */
export async function submitRiderVerification() {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('submit_rider_verification');
  if (error) throw new Error(userMessage(error, 'We could not submit that for review.'));
  revalidatePath('/rider');
}

/** Ask staff to review your fleet. */
export async function submitCompanyVerification(companyId: string) {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('submit_company_verification', { p_company: companyId });
  if (error) throw new Error(userMessage(error, 'We could not submit that for review.'));
  revalidatePath('/rider/fleet');
}

/**
 * Release a rider from the fleet, or attach one to it.
 *
 * Authorisation is the RPC's job, not this module's: set_rider_company allows
 * the fleet owner, the rider themselves (leaving), or staff. Repeating that
 * rule here would be a second copy of it to keep in step.
 */
export async function setRiderCompany(riderId: string, companyId: string | null) {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('set_rider_company', {
    p_rider: riderId,
    // NULL IS A REAL ARGUMENT HERE — it is how a rider is released back to
    // independent, and set_rider_company branches on exactly that. The generated
    // types give every RPC argument a non-null type because PostgREST's schema
    // does not describe argument nullability, so this cast is the type system
    // catching up with the function rather than being worked around.
    p_company: companyId as string,
  });
  if (error) throw new Error(userMessage(error, 'We could not change that.'));
  revalidatePath('/rider/fleet');
  revalidatePath('/rider');
}

export interface RiderOnboardingInput {
  vehicleType: string;
  plateNumber?: string | null;
  /** A fleet operator registers a company alongside their own rider account. */
  mode: 'personal' | 'company';
  companyName?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
}

/** URL-safe, with a short random tail so two "Swift Logistics" can both exist. */
function companySlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'fleet';
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Create a rider account, optionally with the fleet it belongs to, and put it
 * into the review queue.
 *
 * ORDERED, AND THE ORDER IS LOAD-BEARING
 *   1. claim the role, because everything after it is refused without one
 *   2. the rider row, because the company attaches TO it
 *   3. the company, then the employment link
 *   4. the documents, BEFORE submitting — a reviewer opening a submission whose
 *      folder is still landing sees an empty one, and the staff alert fires off
 *      the status change
 *   5. submit
 *
 * A failure at any step leaves the account short of the queue rather than in it
 * under details that never saved. The rider can run the form again: every write
 * here is an upsert or an insert of something that did not exist.
 */
export async function submitRiderOnboarding(
  input: RiderOnboardingInput,
  documents: {
    docType: string;
    subtype?: string | null;
    title: string;
    storagePath: string;
  }[] = [],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You need to be signed in to continue.' };

  const { error: roleError } = await supabase.rpc('claim_role', { p_role: 'rider' });
  if (roleError) {
    return { ok: false, error: userMessage(roleError, 'We could not set up your rider account.') };
  }

  const { error: riderError } = await supabase.from('rider_profiles').upsert({
    id: user.id,
    vehicle_type: input.vehicleType,
    plate_number: input.plateNumber?.trim() || null,
    updated_at: new Date().toISOString(),
  });
  if (riderError) {
    return { ok: false, error: userMessage(riderError, 'We could not save your rider details.') };
  }

  let companyId: string | null = null;
  if (input.mode === 'company') {
    const name = input.companyName?.trim();
    if (!name) return { ok: false, error: 'Your company needs a name.' };

    const { data: company, error: companyError } = await supabase
      .from('logistics_companies')
      .insert({
        owner_id: user.id,
        name,
        slug: companySlug(name),
        business_address: input.companyAddress?.trim() || null,
        contact_phone: input.companyPhone?.trim() || null,
      })
      .select('id')
      .single();

    if (companyError) {
      return { ok: false, error: userMessage(companyError, 'We could not register your company.') };
    }
    companyId = (company?.id as string) ?? null;

    if (companyId) {
      // The owner rides for their own fleet. Without this they would be an
      // independent rider who happens to own a company, and their own
      // deliveries would not count towards it.
      const { error: linkError } = await supabase.rpc('set_rider_company', {
        p_rider: user.id,
        p_company: companyId,
      });
      if (linkError) {
        return { ok: false, error: userMessage(linkError, 'We could not link you to your fleet.') };
      }
    }
  }

  // Best-effort, deliberately: files that uploaded and details that saved must
  // not be stranded by a failure here. The gap shows to staff as a missing
  // document rather than as a lost account.
  if (documents.length) {
    const { error: docsError } = await supabase.from('verification_documents').insert(
      documents.map((d) => ({
        owner_id: user.id,
        doc_type: d.docType,
        doc_subtype: d.subtype ?? null,
        title: d.title,
        storage_path: d.storagePath,
      })),
    );
    if (docsError) console.error('[rider] could not record documents', docsError.message);
  }

  const { error: submitError } = await supabase.rpc('submit_rider_verification');
  if (submitError) {
    return {
      ok: false,
      error: userMessage(submitError, 'We saved your details but could not submit them.'),
    };
  }

  if (companyId) {
    const { error: coSubmitError } = await supabase.rpc('submit_company_verification', {
      p_company: companyId,
    });
    // The rider half is already in the queue; failing the whole submission
    // because the fleet half did not land would be the worse outcome. Staff see
    // an unsubmitted company and the owner can press it again from /fleet.
    if (coSubmitError) console.error('[rider] company not submitted', coSubmitError.message);
  }

  revalidatePath('/rider');
  revalidatePath('/rider/fleet');
  return { ok: true };
}

/**
 * Add a rider to the caller's fleet by the phone number on their profile.
 *
 * TWO STEPS, AND BOTH GUARD SEPARATELY. findRiderByPhone proves the caller owns
 * a fleet before it looks anybody up; set_rider_company proves it again in the
 * database before it writes. That is not redundant — the first stops the lookup
 * being used as a directory of who has an account, the second stops the write
 * regardless of how it was reached.
 */
export async function addRiderToFleet(input: { companyId: string; phone: string }) {
  if (!input.phone.trim()) throw new Error('Enter the number they signed up with.');

  const { findRiderByPhone } = await import('@/modules/rider/fleet');
  const found = await findRiderByPhone(input.phone);
  if ('error' in found) throw new Error(found.error);

  const supabase = await createServerClient();
  const { error } = await supabase.rpc('set_rider_company', {
    p_rider: found.id,
    p_company: input.companyId,
  });
  if (error) throw new Error(userMessage(error, 'We could not add that rider.'));

  revalidatePath('/rider/fleet');
  return found.name;
}
