/**
 * ROUTE: POST /api/payments/verify  (Route Handler - server)
 * ACCESS: the signed-in payer, for their OWN reference.
 *
 * THE SECOND DOOR. `/api/webhooks/paystack` was the only thing that ever
 * credited a wallet or scheduled an inspection, and Paystack can only reach a
 * public URL - so on a dev machine nothing was ever credited at all, and in
 * production a late or missed delivery left the payer watching a balance that
 * did not move under the words "your wallet will update shortly".
 *
 * When the popup closes successfully the browser posts its reference here, and
 * this applies exactly what the webhook would have. Both go through
 * `applyVerifiedCharge`, which re-verifies with Paystack and whose effects are
 * idempotent by reference, so whichever arrives second changes nothing.
 *
 * OWNERSHIP IS CHECKED, THOUGH IT BARELY NEEDS TO BE. The worst a caller could
 * do by posting a stranger's reference is cause that stranger's own paid-for
 * effect to happen slightly sooner than the webhook would have caused it. It is
 * still refused: an endpoint that acts on any reference handed to it is an
 * oracle for whether a reference exists, and `metadata.userId` is already
 * carried on every charge this app starts.
 *
 * NOT A REPLACEMENT FOR THE WEBHOOK. A payer who closes the tab, loses their
 * connection, or pays by transfer never gets here. The webhook remains the one
 * that always eventually runs; this is what makes the common case immediate.
 */
import { createClient } from '@/lib/supabase/server';
import { applyVerifiedCharge } from '@/modules/payments/apply-charge';
import { verifyTransaction } from '@/lib/paystack/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { reference?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const reference = typeof body.reference === 'string' ? body.reference : '';
  if (!reference) return Response.json({ error: 'Missing reference' }, { status: 400 });

  try {
    // Read the charge once to check whose it is, before doing anything with it.
    // `applyVerifiedCharge` re-reads it - two calls to Paystack rather than
    // threading a half-verified object through the ownership check, which is
    // the shape that invites somebody to skip the check later.
    const probe = await verifyTransaction(reference);
    const ownerId = (probe.metadata as { userId?: string } | undefined)?.userId;
    if (ownerId && ownerId !== user.id) {
      return Response.json({ error: 'That payment is not yours.' }, { status: 403 });
    }

    const result = await applyVerifiedCharge(reference);
    if (!result.ok) {
      // 'not_successful' covers abandoned and failed attempts. Reported as a
      // normal answer, not an error: the payer closing the card form is not a
      // fault, and the caller shows "not completed" rather than "went wrong".
      return Response.json({ applied: false, reason: result.reason });
    }
    return Response.json({ applied: true, purpose: result.purpose, amountKobo: result.amountKobo });
  } catch (err) {
    // Paystack unreachable, or the RPC failed. Both are worth retrying, and
    // the webhook is still coming, so this is explicitly not "your money is
    // gone" - see the copy the wallet panel shows on this branch.
    console.error('[payments/verify] failed', { reference, err });
    return Response.json(
      { error: 'We could not confirm that payment yet. It will land shortly.' },
      { status: 502 },
    );
  }
}
