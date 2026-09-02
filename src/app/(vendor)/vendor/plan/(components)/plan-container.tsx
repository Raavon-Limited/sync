/**
 * Vendor plan and billing, from the database.
 *
 * PAYMENT COMES FROM THE WALLET, NOT A STORED CARD
 *   The mock had a PaymentMethodCard and an UpdateCardModal. There is no
 *   payment-methods table and no card is ever stored: `subscribe_to_plan`
 *   debits wallet balance. Those components are dropped rather than fed
 *   fabricated card digits   showing a "Mastercard ···· 4242" that does not
 *   exist is worse than showing the balance that actually pays.
 *
 * BILLING HISTORY IS THE LEDGER
 *   Invoices were a hardcoded array. Real history is `wallet_transactions`
 *   filtered to `subscription_charge`   which cannot drift from what was
 *   charged, because it IS what was charged.
 *
 * COMMISSION IS NOT SHOWN
 *   The mock's plan cards advertised a commission rate per tier. `plans` has no
 *   commission column, so the number would be invented. Escrow release does
 *   read `escrow_holds.commission_kobo`, but nothing sets it per plan yet.
 */
'use client';

import { useMemo, useState } from 'react';
import { Wallet, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui';
import { usePlans, useMySubscription, useWallet, useWalletTransactions } from '@/modules/payments/hooks';
import { useSubscribeToPlan } from '@/modules/payments/hooks';
import { CurrentPlanBanner } from './CurrentPlanBanner';
import { PlanGrid } from './PlanGrid';
import type { CurrentPlan, Plan } from './types';

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;

export function PlanContainer() {
  const { data: plans = [], isLoading: lp } = usePlans();
  const { data: subscription, isLoading: ls } = useMySubscription();
  const { data: wallet } = useWallet();
  const { data: ledger = [] } = useWalletTransactions({ pageSize: 50 });
  const subscribe = useSubscribeToPlan();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const currentCode = subscription?.planCode ?? null;

  const cards = useMemo<Plan[]>(
    () =>
      plans.map((p) => ({
        id: p.code,
        name: p.name,
        tagline: p.description ?? '',
        price: p.priceKobo / 100,
        // Money and period kept apart. Together they were one unbreakable
        // string in a display font ("₦2,500/monthly") that ran off the card,
        // and the card then appended its own "/mo" underneath it.
        priceLabel: p.priceKobo === 0 ? 'Free' : naira(p.priceKobo),
        pricePeriod: p.priceKobo === 0 ? '' : p.interval === 'yearly' ? '/yr' : '/mo',
        // No commission column on `plans`   see the header.
        commission: null,
        features: [
          // The listing cap leads, because it is the one people compare on.
          // Everything after it comes from `plans.features`, which is data  
          // changing what a plan offers is a row edit, not a deploy.
          {
            label:
              p.maxListings == null ? 'Unlimited listings' : `Up to ${p.maxListings} listings`,
          },
          ...(p.features ?? []).map((label) => ({ label })),
        ],
        cta:
          currentCode === p.code
            ? 'current'
            : // Cheaper than what they are on is a downgrade; the label matters
              // because one of them takes money and the other does not.
              subscription && p.priceKobo < (plans.find((x) => x.code === currentCode)?.priceKobo ?? 0)
              ? 'downgrade'
              : 'upgrade',
      })),
    [plans, currentCode, subscription],
  );

  const current = useMemo<CurrentPlan | null>(() => {
    if (!subscription) return null;
    const p = plans.find((x) => x.id === subscription.planId);
    return {
      planId: p?.code ?? '',
      name: subscription.planName ?? p?.name ?? 'Plan',
      price: (p?.priceKobo ?? 0) / 100,
      renewsAt: subscription.currentPeriodEnd,
      commission: 0,
      features: p?.features ?? [],
    };
  }, [subscription, plans]);

  const charges = ledger.filter((t) => t.kind === 'subscription_charge');

  function choose(code: string) {
    const plan = plans.find((p) => p.code === code);
    if (!plan) return;
    setError(null);
    setDone(null);
    subscribe.mutate(plan.id, {
      onSuccess: () => setDone(plan.name),
      // The RPC refuses on insufficient balance with the exact shortfall.
      onError: (e) => setError(e instanceof Error ? e.message : 'Could not change plan'),
    });
  }

  if (lp || ls) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-ink/5 h-28 animate-pulse rounded-2xl" />
        <div className="bg-ink/5 h-64 animate-pulse rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {current ? (
        <CurrentPlanBanner plan={current} />
      ) : (
        <p className="text-content-muted border-line/10 rounded-2xl border border-dashed p-5 text-sm">
          You are not on a plan yet. Pick one below   Starter is free.
        </p>
      )}

      {/* What actually pays for this. */}
      <div className="border-line/10 bg-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
        <span className="text-content-muted flex items-center gap-2 text-sm">
          <Wallet className="size-4" />
          Plans are charged to your Sync wallet
        </span>
        <span className="text-content font-semibold">
          {wallet ? naira(wallet.balanceKobo) : ' '}
        </span>
      </div>

      {error && (
        <p className="text-coral border-coral/30 bg-coral/5 rounded-lg border px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {done && (
        <p className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-600">
          <Check className="size-4" /> You are now on {done}.
        </p>
      )}
      {subscribe.isPending && (
        <p className="text-content-muted flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Changing plan…
        </p>
      )}

      <PlanGrid plans={cards} currentPlanId={currentCode ?? ''} onSelectPlan={(p) => choose(p.id)} />

      <section className="flex flex-col gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">BILLING HISTORY</h2>
        {charges.length === 0 ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-sm">
            No plan charges yet. Free plans are not billed.
          </p>
        ) : (
          <div className="border-line/10 bg-panel divide-line/5 divide-y rounded-xl border">
            {charges.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-content truncate text-sm">{c.narrative}</p>
                  <p className="text-content-muted text-xs">
                    {new Date(c.createdAt).toLocaleDateString('en-NG', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <span className="text-content font-mono text-sm">
                  {naira(Math.abs(c.amountKobo))}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
