/**
 * ROUTE: POST /api/inspections/pay  (Route Handler - server)
 *
 * PAYING IS WHAT BOOKS THE VISIT, and until now nothing could pay.
 *
 * The webhook has always known how to finish this - `charge.success` with
 * `purpose: 'inspection_fee'` calls `confirm_inspection_payment`, which flips
 * the row to 'scheduled' and opens the agent's escrow hold. But no code
 * anywhere ever STARTED such a charge. `/hostels` collected a name, a phone and
 * a time, ran a 1000ms `setTimeout`, and showed an `alert()` saying an agent
 * would call; nothing was inserted and nothing was charged. So the inspection
 * half of the product was a form that wrote to nowhere.
 *
 * That matters more than a normal dead button because of how the board works:
 * `open_inspection_board` lists only inspections that are 'scheduled' with no
 * agent yet, and only payment sets 'scheduled'. An unpaid request is invisible
 * to every agent on Sync, so a student who filled that form was waiting for
 * somebody who was never going to see it.
 *
 * THE AMOUNT IS READ HERE, NOT SENT. The client posts an inspection id and
 * nothing else. The fee is `hostel_inspections.fee_kobo`, snapshotted at
 * booking from the hostel's own `inspection_fee_kobo` so a later price change
 * cannot reprice a booked visit - and a browser cannot decide what a visit
 * costs.
 *
 * RLS DOES THE OWNERSHIP CHECK. This reads through the caller's session, and
 * the student's own policy on `hostel_inspections` is what makes somebody
 * else's inspection come back as "not found" rather than as a row we then have
 * to remember to compare student ids on.
 */
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { initializeTransaction, paystackConfigured } from '@/lib/paystack/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { inspectionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const inspectionId = typeof body.inspectionId === 'string' ? body.inspectionId : '';
  if (!inspectionId) return Response.json({ error: 'Missing inspectionId' }, { status: 400 });

  const { data: inspection } = await supabase
    .from('hostel_inspections')
    .select('id, fee_kobo, status, paid_at, hostel:hostels(name)')
    .eq('id', inspectionId)
    .maybeSingle();

  if (!inspection) return Response.json({ error: 'No such viewing.' }, { status: 404 });

  // Already paid is not an error worth a 4xx to the student - it means the
  // webhook beat this tab. Tell the client so it can move on rather than open
  // a second checkout for a visit that is already on the board.
  if (inspection.paid_at || inspection.status !== 'pending_payment') {
    return Response.json({ alreadyPaid: true });
  }

  const amountKobo = Number(inspection.fee_kobo ?? 0);
  if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
    return Response.json({ error: 'This viewing has no fee set.' }, { status: 409 });
  }

  // No keys yet. Said plainly rather than pretending: unlike a wallet top-up
  // there is no dev credit path for this, and a silent "mock" would leave the
  // student believing an agent is coming.
  if (!paystackConfigured) {
    return Response.json(
      { error: 'Payments are not switched on yet, so viewings cannot be booked.' },
      { status: 503 },
    );
  }

  const reference = `INSPECT_${inspectionId}_${crypto.randomUUID()}`;
  try {
    const data = await initializeTransaction({
      email: user.email,
      amountKobo,
      reference,
      // `purpose` and `inspectionId` are exactly what the webhook switches on.
      // Change either name and the charge succeeds, the money is taken, and
      // `confirm_inspection_payment` is never called - see the webhook's own
      // "unhandled purpose" warning, which is the only trace that would leave.
      metadata: {
        userId: user.id,
        purpose: 'inspection_fee',
        inspectionId,
        naira: amountKobo / 100,
      },
    });
    return Response.json({
      reference: data.reference,
      accessCode: data.access_code,
      authorizationUrl: data.authorization_url,
      publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
    });
  } catch {
    return Response.json(
      { error: 'Could not start the payment. Please try again.' },
      { status: 502 },
    );
  }
}
