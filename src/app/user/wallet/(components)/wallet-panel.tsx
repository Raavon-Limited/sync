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
import { useEscrowHolds, useWallet, useWalletTransactions } from '@/modules/payments/hooks';
import { StatCard } from '@/components/shared';
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
 * counterparty / account / bank are NOT in the ledger   it records movements,
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
    counterparty: t.narrative || ' ',
    accountNumber: ' ',
    bank: ' ',
    reference: t.reference ?? ' ',
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
  // Money earned and not yet released   an agent with three held viewings, a
  // vendor whose orders have not matured. `pending_kobo` has existed since
  // 20260817090300 and this file even referred to it in a comment, but
  // nothing wrote it and nothing showed it, so a wallet with work behind it
  // read as empty.
  /*
   * ESCROW HAS TWO SIDES AND THIS WALLET CAN BE ON EITHER.
   *
   * `pending_kobo` is only one of them - money OWED to you and not yet
   * released. It says nothing about money you have PAID that is still held,
   * which for a student is the larger and more surprising number: paying rent
   * moves ₦300,000 out of the balance immediately and into a hold that does not
   * mature until a week after move-in. The wallet showed the balance drop with
   * nothing at all to say where it went, which reads like money vanishing.
   *
   * Both come from `escrow_holds`, which carries payer_id and payee_id and has
   * an RLS policy ("escrow_holds_party") scoping it to exactly those two - so
   * this is the client reading its own rows, not a privileged aggregate.
   *
   * They are NEVER SUMMED. One is an asset and the other a liability; a single
   * "in escrow" total made of both would be a number that means nothing.
   */
  const { data: holds = [] } = useEscrowHolds('held');
  const escrow = useMemo(() => {
    const me = wallet?.ownerId;
    let out = 0;
    let inbound = 0;
    let fees = 0;
    let bothSides = false;
    let nextRelease: string | null = null;

    for (const h of holds) {
      // Both sides of a hold can be the SAME person - a landlord booking a room
      // in their own hostel, which is also what every one-account test looks
      // like - so these are two independent ifs rather than an else.
      const iPaid = !!me && h.payerId === me;
      const iAmPaid = !!me && h.payeeId === me;
      if (iPaid) out += h.amountKobo;
      if (iAmPaid) {
        inbound += Math.max(0, h.amountKobo - h.commissionKobo);
        fees += h.commissionKobo;
      }
      if (iPaid && iAmPaid) bothSides = true;
      if ((iPaid || iAmPaid) && h.releaseAfter) {
        // The soonest one, because that is the date the reader is waiting on.
        if (!nextRelease || h.releaseAfter < nextRelease) nextRelease = h.releaseAfter;
      }
    }

    return {
      paidIn: out / 100,
      owedToMe: inbound / 100,
      feesKobo: fees,
      bothSides,
      releaseLabel: nextRelease
        ? new Date(nextRelease).toLocaleDateString('en-NG', {
            day: 'numeric',
            month: 'long',
          })
        : null,
    };
  }, [holds, wallet?.ownerId]);

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

  // Which stat card has its explanation open, or null. Held here rather than
  // per card so opening one closes the others structurally.
  const [openInfo, setOpenInfo] = useState<string | null>(null);

  // Said the same way in three sentences, so it is built once.
  const releaseWhen = escrow.releaseLabel
    ? `on ${escrow.releaseLabel}`
    : 'when the stay is confirmed';

  const isLoading = walletLoading || txnsLoading;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<WalletTxn | null>(null);

  /**
   * Dev/demo path: the API reports `mock` when Paystack is not configured. The
   * server still writes the ledger entry, so the wallet is refetched rather
   * than patched locally   a local patch would disagree with the ledger the
   * moment anything else moved money.
   */
  function refreshWallet() {
    // Transactions are nested under the wallet key, so this covers both the
    // balance and the ledger list.
    qc.invalidateQueries({ queryKey: qk.wallet.all });
  }

  /**
   * Claim the credit for a charge this browser just completed.
   *
   * Failure here is NOT lost money and must not be worded as though it were:
   * the charge succeeded, and the webhook applies the same thing on its own
   * schedule. The message says the balance is behind, not that the payment is.
   */
  async function confirmTopup(reference: string, naiaraAmount: number) {
    try {
      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const data = (await res.json()) as { applied?: boolean; error?: string };
      if (res.ok && data.applied) {
        refreshWallet();
        toast(`${naira(naiaraAmount)} added to your wallet.`);
        return;
      }
      toast(data.error ?? 'Payment received. Your balance will catch up shortly.');
    } catch {
      toast('Payment received. Your balance will catch up shortly.');
    } finally {
      // Even on a failed claim: the webhook may have credited it already, and
      // a refetch is the cheapest way to find out.
      refreshWallet();
    }
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

      /*
       * "YOUR WALLET WILL UPDATE SHORTLY" WAS NOT TRUE, AND ON A DEV MACHINE IT
       * WAS NEVER GOING TO BE.
       *
       * The credit came only from Paystack's webhook, which needs a public URL
       * to post to. On localhost there is none, so a top-up that succeeded on
       * Paystack left the balance at zero and the ledger empty - permanently -
       * under a toast promising otherwise. (Two ₦500,000 test charges were
       * confirmed 'success' against an entirely empty wallet_transactions.)
       * In production the same words are still a guess: a late or missed
       * delivery looks identical to the payer.
       *
       * So the browser now asks the server to verify its own reference the
       * moment the popup closes happily. /api/payments/verify re-checks with
       * Paystack and applies exactly what the webhook would, keyed on the same
       * reference - so whichever arrives second is a no-op, and the webhook is
       * still the backstop for anyone who closes the tab.
       */
      setOpen(false);
      await openWalletTopup(data.accessCode, {
        onSuccess: () => {
          void confirmTopup(data.reference as string, value);
        },
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
              Available to withdraw
            </p>
            <p className="font-display mt-1 text-4xl font-semibold">{naira(balance)}</p>
            {/* The escrow figure used to be stated here AND is now on its own
                card below, in different words. Two statements of one number
                six inches apart is how they start disagreeing; the card owns
                it, because it can show both sides of a hold and this line
                could only ever show one. */}
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

      {/* Stats. Three across from sm up: escrow is not an optional extra on a
          wallet that can have rent sitting in one. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          id="added"
          label="ADDED THIS MONTH"
          value={naira(added)}
          openId={openInfo}
          onOpenChange={setOpenInfo}
          info={
            <>
              <p>Everything you have topped up since the month began.</p>
              {/* The exact misreading this card produced: it was taken for
                  the balance, and "why does it still say a million after I
                  spent 300,000" is a fair question about a number that never
                  said what it was. */}
              <p>
                It is a running total,{' '}
                <span className="text-content font-medium">not your balance</span> - spending does
                not bring it down. Your balance is the big figure at the top.
              </p>
            </>
          }
        />

        <StatCard
          id="spent"
          label="SPENT THIS MONTH"
          value={naira(spent)}
          openId={openInfo}
          onOpenChange={setOpenInfo}
          info={
            <>
              <p>Everything that has left this wallet since the month began.</p>
              <p>
                Rent counts from the moment you pay it, even though it sits in escrow for a while
                afterwards - it has left your balance either way.
              </p>
            </>
          }
        />

        {/*
          THE CARD IS ALWAYS THERE, EVEN AT ZERO.
          Every other figure here is one a student can reason about from their
          own actions. Escrow is the one that explains a balance that dropped
          for a reason they cannot see, so it must not appear only once they
          are already confused by it. Zero is an answer.
        */}
        <StatCard
          id="escrow"
          label="IN ESCROW"
          value={naira(escrow.paidIn)}
          className="col-span-2 sm:col-span-1"
          openId={openInfo}
          onOpenChange={setOpenInfo}
          detail={
            escrow.owedToMe > 0 ? (
              <p className="text-accent-fg mt-1 text-xs font-medium">
                + {naira(escrow.owedToMe)} coming to you
              </p>
            ) : null
          }
          info={
            <>
              <p>
                Money that has left your balance but has not reached the other person yet. Sync
                holds it in the middle so neither side can be left short.
              </p>

              {escrow.paidIn > 0 && (
                <p>
                  <span className="text-content font-medium">You paid {naira(escrow.paidIn)}.</span>{' '}
                  It goes to the landlord {releaseWhen} - a week after your move-in date. Cancel
                  within 72 hours of paying and it comes back here instead.
                </p>
              )}

              {/*
                WHAT THIS IS NOT. It was read as a refund, because "owed to
                you" gives the amount and not the reason. The COMMISSION
                arithmetic behind the figure is deliberately absent here: a
                student did not choose it and does not pay it. That belongs on
                the landlord screens, where it is a decision - see
                FeeModeField in the property form.
              */}
              {escrow.owedToMe > 0 && (
                <p>
                  <span className="text-content font-medium">
                    {naira(escrow.owedToMe)} is coming to you
                  </span>{' '}
                  from a booking where you are the one being paid - as a landlord, agent or vendor.
                  It arrives on its own {releaseWhen}.{' '}
                  <span className="text-content font-medium">It is not a refund</span> and you do
                  not have to request it.
                </p>
              )}

              {escrow.bothSides && (
                <p>
                  Both figures are the same booking, because it is on{' '}
                  <span className="text-content font-medium">your own listing</span> - you paid as
                  the tenant and you are being paid as the landlord.
                </p>
              )}

              {escrow.paidIn === 0 && escrow.owedToMe === 0 && (
                <p>Nothing is being held right now, either way.</p>
              )}
            </>
          }
        />
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
