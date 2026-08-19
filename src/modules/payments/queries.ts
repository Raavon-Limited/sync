/**
 * Data access for the 'payments' module — wallet, statement, payouts, banks,
 * plans. Backs /wallet, /vendor/earnings and /vendor/plan.
 *
 * WHAT THIS FILE CANNOT DO, ON PURPOSE
 * Nothing here moves money. `wallets.balance_kobo` is a ledger-derived cache
 * and `guard_wallet_cols` RAISES on any client attempt to write it — not
 * silently reverts, raises, so a bug is loud. The only sanctioned way to move
 * money is `private.post_transaction`, which is service-role only and therefore
 * unreachable from the browser by design.
 *
 * So a payout here is a REQUEST. The server decides whether it can be paid,
 * posts the ledger transaction and flips the status. Same for top-ups: the
 * client starts a Paystack transaction and the webhook credits the wallet.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { unwrap, unwrapList, unwrapMaybe, toRange, type PageParams } from '@/lib/query/helpers';
import type {
  BankAccount,
  EarningsSummary,
  EscrowHold,
  Payout,
  Plan,
  Subscription,
  Wallet,
  WalletTransaction,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- see lib/query/helpers.ts */
type Row = any;
type Client = SupabaseClient<Database>;

// ── Wallet ─────────────────────────────────────────────────────────────────

export async function fetchWallet(db: Client): Promise<Wallet | null> {
  // RLS scopes this to the caller; there is exactly one row.
  const r = unwrapMaybe<Row>(await db.from('wallets').select('*').maybeSingle());
  if (!r) return null;
  return {
    id: r.id,
    ownerId: r.owner_id,
    balanceKobo: Number(r.balance_kobo ?? 0),
    pendingKobo: Number(r.pending_kobo ?? 0),
    isFrozen: r.is_frozen,
    frozenReason: r.frozen_reason,
  };
}

/**
 * Reads `wallet_transactions`, the view that projects the caller's own ledger
 * lines. The underlying `private.ledger_entries` is not reachable from a client
 * role at all.
 */
export async function fetchWalletTransactions(
  db: Client,
  opts: { kind?: string; direction?: 'in' | 'out' } & PageParams = {},
): Promise<WalletTransaction[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('wallet_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (opts.kind) q = q.eq('kind', opts.kind);
  if (opts.direction) q = q.eq('direction', opts.direction);

  return unwrapList<Row>(await q).map((r) => ({
    id: r.id,
    kind: r.kind,
    narrative: r.narrative,
    reference: r.reference,
    orderId: r.order_id,
    amountKobo: Number(r.amount_kobo ?? 0),
    direction: r.direction,
    createdAt: r.created_at,
  }));
}

export async function fetchEscrowHolds(db: Client, status?: string): Promise<EscrowHold[]> {
  let q = db.from('escrow_holds').select('*').order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);

  return unwrapList<Row>(await q).map((r) => ({
    id: r.id,
    orderId: r.order_id,
    bookingId: r.booking_id,
    requestId: r.request_id,
    payerId: r.payer_id,
    payeeId: r.payee_id,
    amountKobo: Number(r.amount_kobo ?? 0),
    commissionKobo: Number(r.commission_kobo ?? 0),
    status: r.status,
    releaseAfter: r.release_after,
    createdAt: r.created_at,
  }));
}

// ── Earnings ───────────────────────────────────────────────────────────────

/** Aggregated in one round trip by the RPC rather than one query per card. */
export async function fetchEarningsSummary(db: Client): Promise<EarningsSummary> {
  const { data, error } = await db.rpc('vendor_earnings_summary');
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;

  return {
    availableKobo: Number(r?.available_kobo ?? 0),
    pendingKobo: Number(r?.pending_kobo ?? 0),
    lifetimeKobo: Number(r?.lifetime_kobo ?? 0),
    withdrawnKobo: Number(r?.withdrawn_kobo ?? 0),
    totalPayouts: Number(r?.total_payouts ?? 0),
    ordersCount: Number(r?.orders_count ?? 0),
  };
}

// ── Bank accounts ──────────────────────────────────────────────────────────

const toBank = (r: Row): BankAccount => ({
  id: r.id,
  bankCode: r.bank_code,
  bankName: r.bank_name,
  accountNumber: r.account_number,
  accountName: r.account_name,
  isDefault: r.is_default,
  isVerified: r.is_verified,
});

export async function fetchBankAccounts(db: Client): Promise<BankAccount[]> {
  const rows = unwrapList<Row>(
    await db.from('bank_accounts').select('*').order('is_default', { ascending: false }),
  );
  return rows.map(toBank);
}

/**
 * `is_verified` and `recipient_code` are omitted deliberately —
 * `guard_bank_account_cols` reverts them. Verification happens server-side
 * against Paystack's resolve endpoint; a client claiming an account is verified
 * would be claiming someone else's account is theirs.
 */
export async function addBankAccount(
  db: Client,
  input: {
    ownerId: string;
    bankCode: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    isDefault?: boolean;
  },
): Promise<BankAccount> {
  const row = unwrap<Row>(
    await db
      .from('bank_accounts')
      .insert({
        owner_id: input.ownerId,
        bank_code: input.bankCode,
        bank_name: input.bankName,
        account_number: input.accountNumber,
        account_name: input.accountName,
        is_default: input.isDefault ?? false,
      })
      .select()
      .single(),
  );
  return toBank(row);
}

/**
 * `bank_accounts_one_default_idx` is a partial unique index, so two defaults
 * cannot coexist — clear the old one first rather than letting the insert
 * collide.
 */
export async function setDefaultBankAccount(db: Client, id: string, ownerId: string) {
  const cleared = await db
    .from('bank_accounts')
    .update({ is_default: false })
    .eq('owner_id', ownerId)
    .eq('is_default', true);
  if (cleared.error) throw cleared.error;

  const { error } = await db.from('bank_accounts').update({ is_default: true }).eq('id', id);
  if (error) throw error;
}

export async function removeBankAccount(db: Client, id: string) {
  const { error } = await db.from('bank_accounts').delete().eq('id', id);
  if (error) throw error;
}

// ── Payouts ────────────────────────────────────────────────────────────────

export async function fetchPayouts(db: Client, opts: PageParams = {}): Promise<Payout[]> {
  const [from, to] = toRange(opts);
  const rows = unwrapList<Row>(
    await db
      .from('payouts')
      .select('*')
      .order('requested_at', { ascending: false })
      .range(from, to),
  );
  return rows.map((r) => ({
    id: r.id,
    bankAccountId: r.bank_account_id,
    amountKobo: Number(r.amount_kobo ?? 0),
    feeKobo: Number(r.fee_kobo ?? 0),
    status: r.status,
    failureReason: r.failure_reason,
    requestedAt: r.requested_at,
    processedAt: r.processed_at,
  }));
}

/**
 * A REQUEST, not a withdrawal. The insert policy pins `status = 'requested'`;
 * the client cannot create a payout in any other state, and
 * `guard_payout_cols` freezes amount and status on update. Everything after
 * this is server-side.
 */
export async function requestPayout(
  db: Client,
  input: { ownerId: string; amountKobo: number; bankAccountId: string },
): Promise<Payout> {
  const row = unwrap<Row>(
    await db
      .from('payouts')
      .insert({
        owner_id: input.ownerId,
        amount_kobo: input.amountKobo,
        bank_account_id: input.bankAccountId,
        status: 'requested',
      })
      .select()
      .single(),
  );
  return {
    id: row.id,
    bankAccountId: row.bank_account_id,
    amountKobo: Number(row.amount_kobo ?? 0),
    feeKobo: Number(row.fee_kobo ?? 0),
    status: row.status,
    failureReason: row.failure_reason,
    requestedAt: row.requested_at,
    processedAt: row.processed_at,
  };
}

// ── Plans & subscription ───────────────────────────────────────────────────

export async function fetchPlans(db: Client): Promise<Plan[]> {
  const rows = unwrapList<Row>(
    await db
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    priceKobo: Number(r.price_kobo ?? 0),
    interval: r.interval,
    features: Array.isArray(r.features) ? r.features : [],
    maxListings: r.max_listings,
    sortOrder: r.sort_order,
  }));
}

export async function fetchMySubscription(db: Client): Promise<Subscription | null> {
  const r = unwrapMaybe<Row>(
    await db
      .from('subscriptions')
      .select('*, plan:plans(name, code)')
      .in('status', ['active', 'past_due'])
      .maybeSingle(),
  );
  if (!r) return null;

  return {
    id: r.id,
    planId: r.plan_id,
    planName: r.plan?.name ?? null,
    planCode: r.plan?.code ?? null,
    status: r.status,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
    cancelAtPeriodEnd: r.cancel_at_period_end,
  };
}
