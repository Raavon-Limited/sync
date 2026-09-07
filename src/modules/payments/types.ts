/**
 * Domain types for the 'payments' module.
 *
 * Every amount is KOBO (integer). Convert at render with `formatKobo` from
 * `@/lib/query/helpers`   never divide by 100 in a component. The mock
 * `WalletTxn` in src/mock/student.ts used Naira numbers; this does not.
 */

export type TxnDirection = 'in' | 'out';

export type LedgerKind =
  | 'order_payment'
  | 'order_refund'
  | 'escrow_hold'
  | 'escrow_release'
  | 'wallet_topup'
  | 'wallet_withdrawal'
  | 'payout'
  | 'commission'
  | 'delivery_fee'
  | 'subscription_charge'
  | 'adjustment';

export type PayoutStatus = 'requested' | 'processing' | 'paid' | 'failed' | 'reversed';

export interface Wallet {
  id: string;
  ownerId: string;
  /** Derived from the ledger   never written directly. */
  balanceKobo: number;
  /** Earned but still in escrow. */
  pendingKobo: number;
  isFrozen: boolean;
  frozenReason: string | null;
}

export interface WalletTransaction {
  id: number;
  kind: LedgerKind;
  narrative: string;
  reference: string | null;
  orderId: string | null;
  /** Signed: positive credits the wallet, negative debits it. */
  amountKobo: number;
  direction: TxnDirection;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  isDefault: boolean;
  /** Set by the Paystack resolve call   the client cannot claim it. */
  isVerified: boolean;
}

export interface Payout {
  id: string;
  bankAccountId: string | null;
  amountKobo: number;
  feeKobo: number;
  status: PayoutStatus;
  failureReason: string | null;
  requestedAt: string;
  processedAt: string | null;
}

export interface EscrowHold {
  id: string;
  orderId: string | null;
  bookingId: string | null;
  requestId: string | null;
  payerId: string;
  payeeId: string;
  amountKobo: number;
  commissionKobo: number;
  status: 'held' | 'released' | 'refunded' | 'disputed';
  releaseAfter: string | null;
  createdAt: string;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceKobo: number;
  interval: 'monthly' | 'yearly';
  features: string[];
  /** Null means UNLIMITED, consistently across every cap below. */
  maxListings: number | null;
  maxStores: number | null;
  /**
   * 0 = no team members at all; null = unlimited. Deliberately not the same
   * value   "you cannot invite anyone" and "invite whoever you like" are
   * opposite answers and a nullable-only column could not tell them apart.
   */
  maxTeam: number | null;
  aiReplies: 'none' | 'limited' | 'full';
  disputeSupport: 'none' | 'managed' | 'priority';
  /** Discount on promotion placement, as a percentage. 0 = pays full price. */
  boostPercent: number;
  sortOrder: number;
}

/**
 * What the caller's plan allows and what they have spent of it, from
 * `my_plan_usage()`. The same numbers the triggers enforce   read these rather
 * than counting rows in a component, or the screen and the database will
 * eventually disagree about whether somebody is at their limit.
 */
export interface PlanUsage {
  planCode: string;
  planName: string;
  priceKobo: number;
  maxListings: number | null;
  usedListings: number;
  maxStores: number | null;
  usedStores: number;
  maxTeam: number | null;
  usedTeam: number;
  aiReplies: 'none' | 'limited' | 'full';
  disputeSupport: 'none' | 'managed' | 'priority';
  boostPercent: number;
}

/** True when a cap is set and already reached. Null caps never block. */
export function atLimit(used: number, max: number | null): boolean {
  return max !== null && used >= max;
}

export interface Subscription {
  id: string;
  planId: string;
  planName?: string | null;
  planCode?: string | null;
  status: 'active' | 'past_due' | 'cancelled' | 'expired';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

/** Result of the `vendor_earnings_summary` RPC. Backs /vendor/earnings. */
export interface EarningsSummary {
  availableKobo: number;
  pendingKobo: number;
  lifetimeKobo: number;
  withdrawnKobo: number;
  totalPayouts: number;
  ordersCount: number;
}
