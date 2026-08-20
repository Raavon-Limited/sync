/**
 * React Query hooks for the 'payments' module.
 *
 * Note what is NOT here: no `useTopUp`, no `useReleaseEscrow`. Money moves only
 * through `private.post_transaction`, which is service-role only. Those flows
 * are server actions / webhook handlers, and the hooks below simply invalidate
 * once the server has done the work.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import type { PageParams } from '@/lib/query/helpers';
import { useSession } from '@/providers/session-provider';
import * as api from './queries';

const db = () => createClient();

// ── Wallet ─────────────────────────────────────────────────────────────────

export function useWallet() {
  return useQuery({
    queryKey: qk.wallet.me(),
    queryFn: () => api.fetchWallet(db()),
    // Balances must not linger stale after a payment lands.
    staleTime: 10_000,
  });
}

export function useWalletTransactions(
  opts: { kind?: string; direction?: 'in' | 'out' } & PageParams = {},
) {
  return useQuery({
    queryKey: qk.wallet.transactions(opts),
    queryFn: () => api.fetchWalletTransactions(db(), opts),
  });
}

export function useEscrowHolds(status?: string) {
  return useQuery({
    queryKey: [...qk.wallet.all, 'escrow', status ?? 'all'] as const,
    queryFn: () => api.fetchEscrowHolds(db(), status),
  });
}

// ── Earnings ───────────────────────────────────────────────────────────────

export function useEarningsSummary() {
  return useQuery({
    queryKey: qk.earnings.summary(),
    queryFn: () => api.fetchEarningsSummary(db()),
    staleTime: 30_000,
  });
}

// ── Bank accounts ──────────────────────────────────────────────────────────

export function useBankAccounts() {
  return useQuery({
    queryKey: qk.bankAccounts.all,
    queryFn: () => api.fetchBankAccounts(db()),
  });
}

export function useAddBankAccount() {
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      bankCode: string;
      bankName: string;
      accountNumber: string;
      accountName: string;
      isDefault?: boolean;
    }) => api.addBankAccount(db(), { ...input, ownerId: userId! }),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.bankAccounts.all });
    },
  });
}

export function useSetDefaultBankAccount() {
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.setDefaultBankAccount(db(), id, userId!),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.bankAccounts.all });
    },
  });
}

export function useRemoveBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeBankAccount(db(), id),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.bankAccounts.all });
    },
  });
}

// ── Payouts ────────────────────────────────────────────────────────────────

export function usePayouts(opts: PageParams = {}) {
  return useQuery({
    queryKey: qk.payouts.list(opts),
    queryFn: () => api.fetchPayouts(db(), opts),
  });
}

/**
 * Requests a payout. Never optimistic and never assumes success: the server
 * still has to check the available balance against the ledger, and it may
 * decline. The wallet is invalidated because a queued payout changes what is
 * withdrawable even before it is paid.
 */
export function useRequestPayout() {
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amountKobo: number; bankAccountId: string }) =>
      api.requestPayout(db(), { ...input, ownerId: userId! }),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.payouts.all });
      qc.invalidateQueries({ queryKey: qk.wallet.all });
      qc.invalidateQueries({ queryKey: qk.earnings.all });
    },
  });
}

// ── Plans ──────────────────────────────────────────────────────────────────

export function usePlans() {
  return useQuery({
    queryKey: qk.plans.all,
    queryFn: () => api.fetchPlans(db()),
    staleTime: 60 * 60_000,
  });
}

export function useMySubscription() {
  return useQuery({
    queryKey: qk.subscription.mine(),
    queryFn: () => api.fetchMySubscription(db()),
  });
}
