'use client';

/**
 * Withdraw funds.
 *
 * This was a modal that said "This feature is coming soon" over a disabled
 * button. There was no RPC, no table and no payout path anywhere — the ledger
 * had permitted a `wallet_withdrawal` kind since August and nothing had ever
 * written one.
 *
 * THE BALANCE DROPS IMMEDIATELY
 *   `request_withdrawal` debits the wallet when the request is made, not when
 *   the transfer lands, so the same money cannot be requested twice while the
 *   first payout is in flight. The copy says so, because a balance that falls
 *   before the money arrives is alarming if unexplained.
 *
 * EVERY RULE IS CHECKED IN THE DATABASE
 *   Minimum, available balance, a verified destination, a frozen wallet — all
 *   inside the RPC, under a row lock. The checks below only decide what to
 *   disable; two quick taps would walk straight past them, and the lock is
 *   what actually holds.
 */

import React from 'react';
import { Wallet, TriangleAlert, Building2 } from 'lucide-react';

import { Button, Input } from '@/components/ui';
import { Modal } from '@/components/shared/custom-modal';
import { useBankAccounts, useRequestWithdrawal } from '@/modules/payments/hooks';
import { toast } from '@/components/ui/toast';

interface WithdrawDialogProps {
  open: boolean;
  onClose: () => void;
  /** Naira, already converted by the page. */
  availableBalance: number;
}

/** Mirrors `min_withdrawal_kobo`, which the RPC is the authority on. */
const MIN_NAIRA = 1000;

export function WithdrawDialog({ open, onClose, availableBalance }: WithdrawDialogProps) {
  const { data: accounts = [], isLoading } = useBankAccounts();
  const withdraw = useRequestWithdrawal();
  const [amount, setAmount] = React.useState('');

  const account = accounts.find((a) => a.isDefault) ?? accounts[0] ?? null;
  const naira = Number(amount || 0);
  const tooSmall = naira > 0 && naira < MIN_NAIRA;
  const tooBig = naira > availableBalance;
  const canSubmit = !!account && account.isVerified && naira >= MIN_NAIRA && !tooBig;

  React.useEffect(() => {
    if (open) setAmount('');
  }, [open]);

  function submit() {
    if (!account || !canSubmit) return;
    withdraw.mutate(
      { amountKobo: Math.round(naira * 100), bankAccountId: account.id },
      {
        onSuccess: () => {
          toast.success('Withdrawal requested');
          onClose();
        },
        onError: (e) => toast.error(e.message || 'Could not request the withdrawal'),
      },
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title="Withdraw funds"
      description="Money is sent to your payout account."
      className="max-w-sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || withdraw.isPending}>
            {withdraw.isPending ? 'Requesting…' : 'Withdraw'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="bg-surface-deep/40 border-line/10 flex items-center gap-3 rounded-lg border p-3">
          <Wallet className="text-content-muted size-5 shrink-0" />
          <div>
            <p className="text-content-muted text-xs">Available</p>
            <p className="text-content font-display text-lg font-semibold">
              ₦{availableBalance.toLocaleString('en-NG')}
            </p>
          </div>
        </div>

        {/* Destination. Without a verified one there is nowhere to send money,
            so this says what to do rather than failing at the last step. */}
        {isLoading ? (
          <p className="text-content-muted text-sm">Loading your payout account…</p>
        ) : !account ? (
          <p className="text-coral flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Add a payout account first — use “Change account” on the earnings page.
          </p>
        ) : !account.isVerified ? (
          <p className="text-coral flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Confirm {account.bankName} •••{account.accountNumber.slice(-4)} with your bank before
            withdrawing to it.
          </p>
        ) : (
          <p className="text-content-muted flex items-center gap-2 text-sm">
            <Building2 className="size-4 shrink-0" />
            {account.bankName} •••{account.accountNumber.slice(-4)} · {account.accountName}
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-content-muted font-mono text-[10px] tracking-widest uppercase">
            Amount (₦)
          </span>
          <Input
            type="number"
            inputMode="numeric"
            min={MIN_NAIRA}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            placeholder={String(MIN_NAIRA)}
          />
          {tooSmall && (
            <span className="text-coral text-xs">
              The smallest withdrawal is ₦{MIN_NAIRA.toLocaleString('en-NG')}.
            </span>
          )}
          {tooBig && (
            <span className="text-coral text-xs">
              That is more than your available balance.
            </span>
          )}
        </label>

        <p className="text-content-muted text-xs">
          {/* Said plainly because it is surprising otherwise. */}
          Your balance drops as soon as you request this, not when the transfer arrives. You can
          cancel while it is still pending.
        </p>
      </div>
    </Modal>
  );
}
