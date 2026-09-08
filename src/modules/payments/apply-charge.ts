/**
 * What a successful Paystack charge DOES, in one place.
 *
 * THE WEBHOOK WAS THE ONLY WAY MONEY EVER LANDED, and that is a single point of
 * failure that fails silently and completely. Paystack posts `charge.success`
 * to a public URL; a dev machine on localhost has none, so in local development
 * a top-up succeeded on Paystack's side and the wallet stayed at zero forever.
 * Two real ₦500,000 test charges were confirmed 'success' on Paystack against
 * an entirely empty `wallet_transactions` table. The student's only feedback
 * was "your wallet will update shortly", which was not true and never became
 * true.
 *
 * It is not only a dev problem. In production the webhook can be late, can be
 * retried after a delay, or can be missed while a deploy is rolling - and the
 * payer is sitting on the wallet screen watching a balance that does not move.
 *
 * SO THERE ARE TWO DOORS AND ONE ROOM. The webhook still calls this, and so
 * does `/api/payments/verify` when the payer's own browser returns from
 * checkout. This module is what makes those two paths incapable of disagreeing:
 * before, the dispatch lived inside the webhook route, so a second caller would
 * have meant a second copy of the purpose switch.
 *
 * BOTH DOORS RE-VERIFY WITH PAYSTACK. Nothing here trusts a webhook body or a
 * browser: `verifyTransaction` re-fetches the transaction, and the amount used
 * is the one Paystack reports. A client that posts somebody else's reference
 * can only cause that reference's own, already-paid effect to be applied - the
 * same thing the webhook would have done a moment later.
 *
 * EVERY EFFECT IS IDEMPOTENT BY REFERENCE, which is what makes two doors safe.
 * `credit_wallet_topup` and `confirm_inspection_payment` both key on the
 * payment reference, so the webhook arriving after the browser already
 * verified is a no-op rather than a double credit.
 */
import 'server-only';
import { render } from '@react-email/render';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyTransaction } from '@/lib/paystack/server';
import { formatKobo } from '@/lib/query/helpers';
import { canonicalOrigin } from '@/config/site';
import { emailFor } from '@/modules/admin/emails';
import { sendMail } from '@/modules/admin/mail';
import { WalletTopupEmail } from '@/emails/wallet-topup-email';

export type ChargeMetadata = {
  purpose?: string;
  userId?: string;
  inspectionId?: string;
};

export type ApplyChargeResult =
  | { ok: true; purpose: string; amountKobo: number }
  /** Verified, but not a success - an abandoned or failed attempt. */
  | { ok: false; reason: 'not_successful' }
  /** Paid for something this build does not know how to account for. */
  | { ok: false; reason: 'unhandled_purpose'; purpose?: string };

/**
 * Verify a reference with Paystack and apply whatever it paid for.
 *
 * Throws only on a failure worth RETRYING - a database error, or Paystack
 * being unreachable. The webhook turns a throw into a non-2xx so Paystack
 * redelivers; the verify route turns it into "we could not confirm that yet".
 * A charge that simply did not succeed is a result, not an exception.
 */
export async function applyVerifiedCharge(reference: string): Promise<ApplyChargeResult> {
  const verified = await verifyTransaction(reference);
  if (verified.status !== 'success') return { ok: false, reason: 'not_successful' };

  const meta = verified.metadata as ChargeMetadata | undefined;

  // THE AMOUNT COMES FROM PAYSTACK, never from a webhook body or a client.
  // `verified` is the re-fetched transaction, so a forged payload cannot
  // inflate a credit even if it somehow passed the signature check.
  const amountKobo = verified.amount;
  if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
    console.error('paystack charge: non-positive amount', { reference, amountKobo });
    return { ok: false, reason: 'not_successful' };
  }

  switch (meta?.purpose) {
    case 'wallet_topup':
      if (!meta.userId) break;
      await creditWalletTopup(reference, meta.userId, amountKobo);
      return { ok: true, purpose: 'wallet_topup', amountKobo };

    case 'inspection_fee':
      if (!meta.inspectionId) break;
      await confirmInspection(reference, meta.inspectionId, amountKobo);
      return { ok: true, purpose: 'inspection_fee', amountKobo };
  }

  // A charge we don't recognise is a charge we have TAKEN and not accounted
  // for, so it is logged loudly rather than dropped in silence.
  console.warn('paystack charge with unhandled purpose', { reference, purpose: meta?.purpose });
  return { ok: false, reason: 'unhandled_purpose', purpose: meta?.purpose };
}

async function creditWalletTopup(reference: string, userId: string, amountKobo: number) {
  // Idempotent by reference inside the RPC - Paystack retries, the browser may
  // verify first, and neither must credit twice. Service role: this runs
  // outside any session, and the verify route has already checked that the
  // caller owns this reference.
  const admin = createAdminClient();
  const { error } = await admin.rpc('credit_wallet_topup', {
    p_user_id: userId,
    p_amount_kobo: amountKobo,
    p_reference: reference,
  });

  if (error) {
    // Thrown, not swallowed: the RPC is safe to replay, so a transient failure
    // should become a retry rather than a silently uncredited payment.
    console.error('paystack wallet_topup credit failed', { reference, error: error.message });
    throw new Error(`credit_wallet_topup failed: ${error.message}`);
  }

  console.info('paystack wallet_topup credited', { reference, userId, naira: amountKobo / 100 });

  // Deliberately after the credit and deliberately not awaited into the result.
  // The money is in the wallet whether or not Resend is having a good minute,
  // and a mail failure must not turn a successful credit into a webhook retry.
  void sendTopupReceipt(reference, userId, amountKobo);
}

/**
 * The receipt.
 *
 * SENT ONCE, AND THE ONCE IS ENFORCED IN THE DATABASE. Since
 * /api/payments/verify exists there are two paths that apply the same charge,
 * and Paystack retries on top of that. The money RPCs absorb the repeats
 * silently - they key on the payment reference - but an email has no such key,
 * so without a guard one top-up would produce two or three identical receipts
 * about money. `private.claim_notification` returns true exactly once per
 * (reference, channel); see 20260912120000.
 *
 * CLAIM FIRST, SEND SECOND. The other order - send, then record - loses the
 * record if the process dies between them and sends again on the retry. This
 * way the failure mode is a missing receipt, which a human can resend, rather
 * than a duplicate one about money, which they cannot unsend.
 *
 * NEVER THROWS. Everything here is best effort: a missing RESEND_API_KEY, an
 * unreachable provider, or a claim function that has not been migrated yet must
 * not surface as a payment problem. Failures are logged, because a silent one
 * is how nobody notices the whole flow stopped mailing.
 */
async function sendTopupReceipt(reference: string, userId: string, amountKobo: number) {
  try {
    const admin = createAdminClient();

    const { data: claimed, error: claimError } = await admin.rpc('claim_notification', {
      p_key: reference,
      p_channel: 'email',
    });

    if (claimError) {
      // Most likely the migration has not been applied. NOT sending is the
      // right call: without the claim there is nothing stopping the other path
      // from sending its own copy a moment later.
      console.error('[wallet-topup-mail] claim failed, not sending', {
        reference,
        error: claimError.message,
      });
      return;
    }
    if (!claimed) return; // The other path got here first. Nothing to do.

    const email = await emailFor(userId);
    if (!email) return;

    // Read AFTER the credit, so the figure is the one their wallet screen will
    // show them rather than the one from before their own payment.
    const { data: wallet } = await admin
      .from('wallets')
      .select('balance_kobo')
      .eq('owner_id', userId)
      .maybeSingle();

    const origin = canonicalOrigin();
    const html = await render(
      WalletTopupEmail({
        name: 'there',
        amount: formatKobo(amountKobo),
        balance: formatKobo(Number(wallet?.balance_kobo ?? 0)),
        reference,
        paidAt: new Date().toLocaleString('en-NG', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'Africa/Lagos',
        }),
        walletUrl: `${origin}/user/wallet`,
      }),
    );

    const sent = await sendMail({
      to: email,
      subject: `${formatKobo(amountKobo)} added to your Sync wallet`,
      html,
    });
    if (!sent.ok) console.error('[wallet-topup-mail] send failed:', sent.error);
  } catch (e) {
    console.error('[wallet-topup-mail] threw:', e);
  }
}

/**
 * An inspection is paid for BEFORE it is booked, so this - not the client - is
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
