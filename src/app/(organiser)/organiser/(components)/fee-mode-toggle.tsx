/**
 * Who bears Sync's 5% on this event.
 *
 * TWO CHOICES, EACH SHOWN AS WHAT IT COSTS
 *   "absorb / pass_on" is our word for it, not theirs. What an organiser needs
 *   to compare is the two numbers that differ — what a buyer is charged and
 *   what lands in their wallet — so the option states both against their own
 *   cheapest ticket rather than describing a policy.
 *
 * IT ONLY AFFECTS FUTURE SALES, AND IT SAYS SO
 *   The charge is frozen onto each escrow hold at purchase, so tickets already
 *   sold keep the deal they were sold under. Somebody switching this mid-sale
 *   would otherwise reasonably expect the money already held to move.
 *
 * THE ARITHMETIC HERE IS ILLUSTRATION ONLY. `quote_tickets` in the database is
 * what a buyer is actually charged; this is the same 5% shown against one
 * ticket so the choice is legible. If the two ever disagree, the database is
 * right and this is a display bug.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { setEventFeeMode } from '@/modules/events/organiser-actions';
import { formatKobo } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

export function FeeModeToggle({
  eventId,
  feeMode,
  /** The cheapest active tier, for the worked example. Zero when none yet. */
  samplePriceKobo,
}: {
  eventId: string;
  feeMode: string;
  samplePriceKobo: number;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fee = Math.floor((samplePriceKobo * 5) / 100);

  const options = [
    {
      value: 'absorb' as const,
      label: 'I pay it',
      blurb: samplePriceKobo
        ? `Buyer pays ${formatKobo(samplePriceKobo)}, you get ${formatKobo(samplePriceKobo - fee)}`
        : 'Comes out of your takings. The advertised price is what a buyer pays.',
    },
    {
      value: 'pass_on' as const,
      label: 'The buyer pays it',
      blurb: samplePriceKobo
        ? `Buyer pays ${formatKobo(samplePriceKobo + fee)}, you get ${formatKobo(samplePriceKobo)}`
        : 'Added at checkout. You keep the full ticket price.',
    },
  ];

  function choose(mode: 'absorb' | 'pass_on') {
    if (mode === feeMode) return;
    setError(null);
    startTransition(async () => {
      const res = await setEventFeeMode(eventId, mode);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
      <div>
        <h2 className="text-content text-sm font-medium">Who pays the 5%</h2>
        <p className="text-content-muted text-xs">
          Sync charges 5% of ticket sales. You choose whether that comes out of your takings or is
          added to what a buyer pays.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const active = feeMode === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={busy}
              aria-pressed={active}
              onClick={() => choose(o.value)}
              className={cn(
                'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors',
                active
                  ? 'border-lime/50 bg-lime/10'
                  : 'border-line/15 hover:border-line/40 cursor-pointer',
                busy && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                  active ? 'border-lime bg-lime text-ink' : 'border-line/30',
                )}
              >
                {active && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
              </span>
              <span className="min-w-0">
                <span className="text-content block text-sm font-medium">{o.label}</span>
                <span className="text-content-muted block text-xs">{o.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      {busy && (
        <p className="text-content-muted flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          Saving…
        </p>
      )}
      {error && <p className="text-coral text-xs">{error}</p>}

      <p className="text-content-muted text-xs">
        Changing this affects tickets sold from now on. Anything already sold keeps the charge it
        was sold under.
      </p>
    </div>
  );
}
