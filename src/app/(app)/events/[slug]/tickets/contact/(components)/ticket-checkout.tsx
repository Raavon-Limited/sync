/**
 * Step 2: confirm and buy.
 *
 * THE PAYMENT STEP IS GONE, ON PURPOSE
 *   This used to push to /events/[slug]/tickets/payment   a route that does not
 *   exist. Tickets are paid from wallet balance, so there is no card form to
 *   collect and nothing to redirect to. Confirming here IS the payment.
 *
 * ONE CALL PER TIER, AND IT IS NOT ATOMIC ACROSS THEM
 *   `purchase_tickets` takes one tier. A basket spanning two tiers is two
 *   calls, so the second can fail after the first succeeded   most likely on
 *   balance. Rather than pretend otherwise, tiers are bought in order and the
 *   result says exactly what was bought and what was not. Partial success is
 *   reported, never silently swallowed.
 *
 * PER-RECIPIENT ALLOCATION IS NOT SUPPORTED
 *   The old flow let a buyer assign tickets to named friends.
 *   `tickets.owner_id` is the buyer and there is no recipient column, so every
 *   ticket belongs to whoever paid. Collecting names would imply a transfer the
 *   schema cannot perform.
 */
'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MoveLeft, Loader2, Check, Wallet } from 'lucide-react';
import { Button } from '@/components/ui';
import { useEvent, useEventTiers, usePurchaseTickets } from '@/modules/events/hooks';
import { useWallet } from '@/modules/payments/hooks';
import { useSession } from '@/providers/session-provider';

const naira = (kobo: number) => (kobo === 0 ? 'Free' : `₦${(kobo / 100).toLocaleString('en-NG')}`);

/** "tierId:2,otherId:1" -> { tierId: 2, otherId: 1 } */
function parseSelection(sel: string | null): Record<string, number> {
  if (!sel) return {};
  const out: Record<string, number> = {};
  for (const part of sel.split(',')) {
    const [id, qty] = part.split(':');
    const n = Number(qty);
    if (id && Number.isFinite(n) && n > 0) out[id] = n;
  }
  return out;
}

export function TicketCheckout({ slug }: { slug: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { isAuthenticated } = useSession();
  const { data: event } = useEvent(slug);
  const { data: tiers = [] } = useEventTiers(event?.id);
  const { data: wallet } = useWallet();
  const purchase = usePurchaseTickets();

  const selection = useMemo(() => parseSelection(params.get('sel')), [params]);
  const lines = tiers
    .filter((t) => selection[t.id] > 0)
    .map((t) => ({ tier: t, qty: selection[t.id] }));
  const total = lines.reduce((s, l) => s + l.tier.priceKobo * l.qty, 0);

  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  // One reference per checkout attempt, generated ONCE. Regenerating it per
  // render would turn a re-render into a second purchase.
  const attemptRef = useRef<string>(`TIX_${crypto.randomUUID()}`);

  const short = wallet ? Math.max(0, total - wallet.balanceKobo) : 0;

  async function buy() {
    setError(null);
    setBusy(true);
    let count = 0;
    try {
      for (const line of lines) {
        const ids = await purchase.mutateAsync({
          tierId: line.tier.id,
          quantity: line.qty,
          // Per tier, derived from the one attempt reference, so a retry of the
          // whole basket replays rather than duplicates.
          reference: `${attemptRef.current}-${line.tier.id}`,
        });
        count += ids.length;
        setBought(count);
      }
      router.push('/user/tickets');
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Purchase failed';
      setError(
        count > 0
          ? `${count} ticket${count === 1 ? '' : 's'} bought, then it stopped: ${reason}`
          : reason,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!event) return <div className="bg-ink/5 h-64 animate-pulse rounded-2xl" />;

  return (
    <section className="mx-auto max-w-2xl px-4 py-6 sm:px-5 sm:py-8">
      <Link
        href={`/events/${event.slug}/tickets`}
        className="text-content-muted hover:text-content mb-4 inline-flex items-center gap-2 text-sm"
      >
        <MoveLeft className="size-4" /> Change tickets
      </Link>

      <h1 className="font-display text-content text-2xl">{event.name}</h1>

      {lines.length === 0 ? (
        <p className="text-content-muted border-line/10 mt-6 rounded-xl border border-dashed p-6 text-sm">
          Nothing selected. Go back and pick your tickets.
        </p>
      ) : (
        <>
          <div className="border-line/10 bg-panel divide-line/5 mt-6 divide-y rounded-xl border">
            {lines.map((l) => (
              <div key={l.tier.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-content text-sm">
                  {l.tier.name} <span className="text-content-muted">× {l.qty}</span>
                </span>
                <span className="text-content-muted font-mono text-sm">
                  {naira(l.tier.priceKobo * l.qty)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-content font-medium">Total</span>
              <span className="text-content font-semibold">{naira(total)}</span>
            </div>
          </div>

          <div className="border-line/10 bg-panel mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <span className="text-content-muted flex items-center gap-2 text-sm">
              <Wallet className="size-4" /> Paid from your Sync wallet
            </span>
            <span className="text-content font-semibold">
              {wallet ? naira(wallet.balanceKobo) : ' '}
            </span>
          </div>

          {/* Shown before they tap, not after   the shortfall is fixable. */}
          {short > 0 && (
            <p className="border-line/10 bg-panel mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="text-content-muted">
                You need <span className="text-content font-medium">{naira(short)}</span> more.
              </span>
              <Link href="/user/wallet" className="text-lime-deep font-medium underline underline-offset-2">
                Top up
              </Link>
            </p>
          )}

          {error && (
            <p className="text-coral border-coral/30 bg-coral/5 mt-3 rounded-lg border px-3 py-2 text-sm">
              {error}
            </p>
          )}

          {bought > 0 && !error && (
            <p className="mt-3 flex items-center gap-1 text-sm text-emerald-600">
              <Check className="size-4" /> {bought} ticket{bought === 1 ? '' : 's'} bought.
            </p>
          )}

          <Button
            className="mt-4 w-full"
            disabled={!isAuthenticated || busy || short > 0}
            onClick={buy}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? 'Buying…' : `Pay ${naira(total)}`}
          </Button>

          {!isAuthenticated && (
            <p className="text-content-muted mt-2 text-center text-xs">Sign in to buy tickets.</p>
          )}

          <p className="text-content-muted mt-3 text-center text-xs">
            Tickets are issued to your account. Transferring one to a friend is not supported yet.
          </p>
        </>
      )}
    </section>
  );
}
