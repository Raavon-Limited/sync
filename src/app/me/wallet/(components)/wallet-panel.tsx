/**
 * WalletPanel - the student wallet. The wallet is what students add funds to
 * (top up), then spend across Sync (hostels, food, events…). So "Add funds" is
 * the hero action: it opens a small amount dialog and credits the balance.
 *
 * Tapping a transaction opens its full detail (who it was sent to, account
 * number, reference…) in a centered modal on desktop and a bottom sheet on
 * mobile.
 *
 * Mock/optimistic for now (local state + toast). When Supabase is the backend,
 * "Add funds" calls a route handler → payment provider → credits the balance;
 * the balance + transactions come from a query. The UI stays the same.
 */
'use client';

import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Plus, Wallet } from 'lucide-react';
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { openWalletTopup } from '@/lib/paystack/client';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet, useWalletTransactions } from '@/modules/payments/hooks';
import { qk } from '@/lib/query/keys';
import type { LedgerKind, WalletTransaction } from '@/modules/payments/types';

/** Card shape this panel renders. The ledger row is narrower than this. */
interface WalletTxn {
  id: string;
  label: string;
  sub: string;
  amount: number;
  direction: 'in' | 'out';
  date: string;
  status: 'completed' | 'pending';
  counterparty: string;
  accountNumber: string;
  bank: string;
  reference: string;
  method: string;
  time: string;
  fee: number;
}

const KIND_LABEL: Record<LedgerKind, string> = {
  order_payment: 'Order payment',
  order_refund: 'Refund',
  escrow_hold: 'Held in escrow',
  escrow_release: 'Escrow released',
  wallet_topup: 'Top-up',
  wallet_withdrawal: 'Withdrawal',
  payout: 'Payout',
  commission: 'Commission',
  delivery_fee: 'Delivery fee',
  subscription_charge: 'Subscription',
  adjustment: 'Adjustment',
};

/**
 * Ledger row -> card.
 *
 * STATUS IS ALWAYS 'completed', AND THAT IS CORRECT.
 * A ledger entry only exists once money has actually moved. Money that has not
 * is in escrow, which the wallet reports separately as `pendingKobo`. Marking
 * ledger rows "pending" would misrepresent what the ledger is.
 *
 * counterparty / account / bank are NOT in the ledger — it records movements,
 * not the parties' bank details. Showing the narrative beats inventing a name.
 */
function toCard(t: WalletTransaction): WalletTxn {
  const when = new Date(t.createdAt);
  return {
    id: String(t.id),
    label: KIND_LABEL[t.kind] ?? t.kind,
    sub: t.narrative || KIND_LABEL[t.kind] || '',
    amount: Math.abs(t.amountKobo) / 100,
    direction: t.direction,
    date: when.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }),
    status: 'completed',
    counterparty: t.narrative || '—',
    accountNumber: '—',
    bank: '—',
    reference: t.reference ?? '—',
    method: KIND_LABEL[t.kind] ?? 'Sync wallet',
    time: when.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
    // The ledger records commission as its OWN entry rather than a field on the
    // transaction it came from, so a per-row fee is not derivable here.
    fee: 0,
  };
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
const QUICK = [1_000, 5_000, 10_000, 20_000];

export function WalletPanel() {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const qc = useQueryClient();
  const { data: wallet, isLoading: walletLoading } = useWallet();
  const { data: ledger = [], isLoading: txnsLoading } = useWalletTransactions({ pageSize: 50 });

  const balance = (wallet?.balanceKobo ?? 0) / 100;
  const txns = useMemo(() => ledger.map(toCard), [ledger]);

  // "This month" is derived from the ledger rather than stored: a running
  // counter drifts the moment a transaction is reversed.
  const { added, spent } = useMemo(() => {
    const now = new Date();
    let inK = 0;
    let outK = 0;
    for (const t of ledger) {
      const d = new Date(t.createdAt);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      if (t.direction === 'in') inK += Math.abs(t.amountKobo);
      else outK += Math.abs(t.amountKobo);
    }
    return { added: inK / 100, spent: outK / 100 };
  }, [ledger]);

  const isLoading = walletLoading || txnsLoading;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<WalletTxn | null>(null);

  /**
   * Dev/demo path: the API reports `mock` when Paystack is not configured. The
   * server still writes the ledger entry, so the wallet is refetched rather
   * than patched locally — a local patch would disagree with the ledger the
   * moment anything else moved money.
   */
  function refreshWallet() {
    // Transactions are nested under the wallet key, so this covers both the
    // balance and the ledger list.
    qc.invalidateQueries({ queryKey: qk.wallet.all });
  }

  async function addFunds(e: React.FormEvent) {
    e.preventDefault();
    const value = Math.round(Number(amount));
    if (!value || value < 100) {
      toast('Enter at least ₦100.');
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? 'Could not start the payment.');
        return;
      }

      // No Paystack keys yet → behave like the previous mock top-up.
      if (data.mock) {
        refreshWallet();
        toast(`${naira(value)} added to your wallet.`);
        setAmount('');
        setOpen(false);
        return;
      }

      // Real Paystack: open the popup for the server-initialized transaction.
      // The wallet is credited by the verified webhook, so we just inform here.
      setOpen(false);
      await openWalletTopup(data.accessCode, {
        onSuccess: () => toast('Payment received — your wallet will update shortly.'),
        onCancel: () => toast('Payment cancelled.'),
      });
      setAmount('');
    } catch {
      toast('Something went wrong starting your payment.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      {/* Balance + Add funds */}
      <div className="bg-ink text-cream flex flex-col gap-6 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-cream/60 font-mono text-[11px] tracking-wide uppercase">
              Sync wallet balance
            </p>
            <p className="font-display mt-1 text-4xl font-semibold">{naira(balance)}</p>
          </div>
          <span className="bg-cream/10 flex size-12 shrink-0 items-center justify-center rounded-full">
            <Wallet className="size-6" />
          </span>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="bg-lime text-ink hover:bg-lime/85 self-start rounded-full"
        >
          <Plus className="size-4" /> Add funds
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-line/10 border p-5">
          <p className="text-content-muted font-mono text-xs tracking-wide">ADDED THIS MONTH</p>
          <p className="text-content mt-1 text-2xl font-bold">{naira(added)}</p>
        </Card>
        <Card className="border-line/10 border p-5">
          <p className="text-content-muted font-mono text-xs tracking-wide">SPENT THIS MONTH</p>
          <p className="text-content mt-1 text-2xl font-bold">
            {naira(spent)}
          </p>
        </Card>
      </div>

      {/* Transactions */}
      <div className="flex flex-col gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">TRANSACTIONS</h2>
        <Card className="border-line/10 divide-line/5 divide-y border">
          {isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={`sk-${i}`} className="bg-ink/5 m-3 h-12 animate-pulse rounded-lg" />
            ))}

          {!isLoading && txns.length === 0 && (
            <p className="text-content-muted p-6 text-center text-sm">
              No transactions yet. Money moves here when you top up or pay for an order.
            </p>
          )}

          {txns.map((t) => {
            const inbound = t.direction === 'in';
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t)}
                className="hover:bg-ink/5 flex w-full items-center gap-3 p-4 text-left transition-colors"
              >
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full',
                    inbound ? 'bg-lime/15 text-accent-fg' : 'bg-ink/5 text-content-muted',
                  )}
                >
                  {inbound ? (
                    <ArrowDownLeft className="size-5" />
                  ) : (
                    <ArrowUpRight className="size-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-content truncate text-sm font-medium">{t.label}</p>
                  <p className="text-content-muted text-xs">
                    {t.sub} · {t.date}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      inbound ? 'text-lime-deep' : 'text-content',
                    )}
                  >
                    {inbound ? '+' : '−'}
                    {naira(t.amount)}
                  </p>
                  {t.status === 'pending' && <p className="text-coral text-[11px]">Pending</p>}
                </div>
                <ChevronRight className="text-content-muted size-4 shrink-0" aria-hidden="true" />
              </button>
            );
          })}
        </Card>
      </div>

      {/* Transaction detail - modal on desktop, bottom sheet on mobile */}
      {isMobile ? (
        <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Transaction details</SheetTitle>
            </SheetHeader>
            {selected && <TxnDetails t={selected} />}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transaction details</DialogTitle>
            </DialogHeader>
            {selected && <TxnDetails t={selected} />}
          </DialogContent>
        </Dialog>
      )}

      {/* Add funds dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add funds</DialogTitle>
            <DialogDescription>Top up your Sync wallet to pay across the app.</DialogDescription>
          </DialogHeader>
          <form onSubmit={addFunds} className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(String(q))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors',
                    Number(amount) === q
                      ? 'bg-ink text-cream border-ink'
                      : 'border-line/15 text-content hover:bg-ink/5',
                  )}
                >
                  {naira(q)}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="amount" className="text-content text-sm font-medium">
                Amount (₦)
              </label>
              <Input
                id="amount"
                type="number"
                min={1}
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={!Number(amount) || pending} className="w-full">
              {pending
                ? 'Starting…'
                : `Add ${Number(amount) ? naira(Math.round(Number(amount))) : 'funds'}`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function TxnDetails({ t }: { t: WalletTxn }) {
  const inbound = t.direction === 'in';
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full',
            inbound ? 'bg-lime/15 text-accent-fg' : 'bg-ink/5 text-content-muted',
          )}
        >
          {inbound ? <ArrowDownLeft className="size-6" /> : <ArrowUpRight className="size-6" />}
        </span>
        <div className="min-w-0">
          <p className="text-content truncate text-base font-medium">{t.label}</p>
          <p
            className={cn(
              'font-display text-2xl font-semibold',
              inbound ? 'text-lime-deep' : 'text-content',
            )}
          >
            {inbound ? '+' : '−'}
            {naira(t.amount)}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <DetailRow label={inbound ? 'From' : 'To'} value={t.counterparty} />
        <DetailRow label="Account number" value={t.accountNumber} mono />
        <DetailRow label="Bank" value={t.bank} />
        <DetailRow label="Method" value={t.method} />
        <DetailRow label="Reference" value={t.reference} mono />
        <DetailRow label="Date" value={`${t.date} · ${t.time}`} />
        <DetailRow label="Fee" value={naira(t.fee)} />
        <DetailRow label="Status" value={t.status === 'pending' ? 'Pending' : 'Completed'} />
      </dl>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-content-muted font-mono text-[11px] tracking-wide uppercase">{label}</dt>
      <dd className={cn('text-content text-sm wrap-break-word', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}
