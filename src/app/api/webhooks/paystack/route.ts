/**
 * ROUTE: POST /api/webhooks/paystack
 * ACCESS: public (Paystack-only); rejected unless HMAC-SHA512 signature matches.
 * PURPOSE: Process Paystack webhook events - payment success/failure, transfer
 *          updates, refunds - and drive the escrow state machine in
 *          modules/payments/actions.ts.
 *
 * SECURITY:
 *   1. Read raw body BEFORE JSON parsing (signature is over the raw bytes).
 *   2. Verify `x-paystack-signature` (HMAC-SHA512) with PAYSTACK_SECRET_KEY.
 *   3. Reject unsigned/invalid requests with 401. Never throw the raw error
 *      back to the caller - log and respond 200 to acknowledge receipt.
 *   4. Idempotency: persist `event.data.reference` + status before mutating
 *      domain state (TODO once payments table exists).
 *
 * TODO: dispatch verified events to modules/payments/actions.ts handlers.
 */
import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { applyVerifiedCharge } from '@/modules/payments/apply-charge';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    // Don't leak which key is missing - log generically, fail closed.
    console.error('paystack webhook: server misconfigured');
    return NextResponse.json({ error: 'server' }, { status: 500 });
  }

  const signature = req.headers.get('x-paystack-signature');
  const raw = await req.text();

  if (!signature || !verifySignature(raw, signature, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let event: { event?: string; data?: unknown };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad_payload' }, { status: 400 });
  }

  try {
    if (event.event === 'charge.success') {
      await handleChargeSuccess(event.data);
    } else {
      console.info('paystack webhook received', event.event);
    }
  } catch (err) {
    // Acknowledge receipt (200) so Paystack doesn't hammer retries, but log.
    console.error('paystack webhook handler error', err);
  }

  return NextResponse.json({ ok: true });
}

type ChargeData = { reference?: string };

/**
 * WHAT A SUCCESSFUL CHARGE DOES NO LONGER LIVES HERE.
 *
 * It moved to `modules/payments/apply-charge.ts` when `/api/payments/verify`
 * was added, because this route was the ONLY path by which money ever landed -
 * and Paystack can only post to a public URL, so on localhost a successful
 * top-up credited nothing, forever. Two doors now lead to one room; a second
 * copy of the purpose switch would have been two rooms that slowly stop
 * matching.
 *
 * What remains here is the part that is actually about being a webhook: the
 * HMAC. Everything past it is shared.
 */
async function handleChargeSuccess(data: unknown) {
  const reference = (data as ChargeData)?.reference;
  if (!reference) return;
  // Throws on a retryable failure, which the caller turns into a logged 200 -
  // see the note there about Paystack's retry behaviour.
  await applyVerifiedCharge(reference);
}

function verifySignature(raw: string, signature: string, secret: string): boolean {
  const computed = crypto.createHmac('sha512', secret).update(raw).digest('hex');
  if (computed.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}
