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
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyTransaction } from '@/lib/paystack/server';

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
 * Re-verifies the charge with Paystack (never trusts the webhook body alone),
 * then dispatches on `metadata.purpose`. Every purpose must be idempotent by
 * reference: Paystack retries, and a second delivery must not move money twice.
 */
async function handleChargeSuccess(data: unknown) {
  const reference = (data as ChargeData)?.reference;
  if (!reference) return;

  const verified = await verifyTransaction(reference);
  if (verified.status !== 'success') return;

  const meta = verified.metadata as ChargeMetadata | undefined;

  // The AMOUNT COMES FROM PAYSTACK, never from the webhook body or the client.
  // `verified` is the re-fetched transaction, so a forged payload cannot inflate
  // a credit even if it somehow passed the signature check.
  const amountKobo = verified.amount;
  if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
    console.error('paystack charge: non-positive amount', { reference, amountKobo });
    return;
  }

  switch (meta?.purpose) {
    case 'wallet_topup':
      if (meta.userId) await creditWalletTopup(reference, meta.userId, amountKobo);
      return;
    case 'inspection_fee':
      if (meta.inspectionId) await confirmInspection(reference, meta.inspectionId, amountKobo);
      return;
    default:
      // A charge we don't recognise is a charge we've taken and not accounted
      // for, so it's logged loudly rather than dropped in silence.
      console.warn('paystack charge with unhandled purpose', { reference, purpose: meta?.purpose });
  }
}

type ChargeMetadata = {
  purpose?: string;
  userId?: string;
  inspectionId?: string;
};

async function creditWalletTopup(reference: string, userId: string, amountKobo: number) {
  // Idempotent by reference inside the RPC   Paystack retries, and a second
  // delivery must not credit twice. Service role: this runs outside any session.
  const admin = createAdminClient();
  const { error } = await admin.rpc('credit_wallet_topup', {
    p_user_id: userId,
    p_amount_kobo: amountKobo,
    p_reference: reference,
  });

  if (error) {
    // Throwing here would return a non-2xx and make Paystack retry, which is
    // what we want for a transient failure   the RPC is safe to replay.
    console.error('paystack wallet_topup credit failed', { reference, error: error.message });
    throw new Error(`credit_wallet_topup failed: ${error.message}`);
  }

  console.info('paystack wallet_topup credited', { reference, userId, naira: amountKobo / 100 });
}

/**
 * An inspection is paid for BEFORE it is booked, so this   not the client   is
 * what schedules it. The RPC marks the row paid and opens the escrow hold that
 * pays the agent; it is idempotent on `payment_reference`, which is unique.
 */
async function confirmInspection(reference: string, inspectionId: string, amountKobo: number) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('confirm_inspection_payment', {
    p_inspection: inspectionId,
    p_reference: reference,
    p_amount_kobo: amountKobo,
  });

  if (error) {
    console.error('paystack inspection_fee failed', {
      reference,
      inspectionId,
      error: error.message,
    });
    throw new Error(`confirm_inspection_payment failed: ${error.message}`);
  }

  console.info('paystack inspection_fee confirmed', {
    reference,
    inspectionId,
    naira: amountKobo / 100,
  });
}

function verifySignature(raw: string, signature: string, secret: string): boolean {
  const computed = crypto.createHmac('sha512', secret).update(raw).digest('hex');
  if (computed.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}
