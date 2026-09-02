/**
 * Ticket tiers for one event: what exists, what it costs, what is left.
 *
 * A TIER IS CLOSED, NEVER DELETED
 *   Tickets already sold reference it, and a sales history whose tiers vanish
 *   stops meaning anything — "40 sold" against a row nobody can name. Closing
 *   takes it off sale and leaves the record intact, which is also what somebody
 *   means when they say "stop selling early bird".
 *
 * PRICES ARE TYPED IN NAIRA AND STORED IN KOBO
 *   `price_kobo` is an integer column and the form is whole naira, so the
 *   conversion is exact in both directions. A decimal field here would invite
 *   ₦1,999.99 and a rounding argument nobody wants to have with a vendor.
 *
 * `sold` IS NEVER SENT. The purchase path maintains it; an organiser writing it
 * would be writing their own sales figures.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { addTicketTier, setTierActive } from '@/modules/events/organiser-actions';
import { naira, type TicketTier } from '@/modules/events/organiser-queries';

export function TierManager({ eventId, tiers }: { eventId: string; tiers: TicketTier[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? 'That did not go through.');
        return;
      }
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {tiers.length > 0 && (
        <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
          {tiers.map((t) => {
            const left = t.quantity === null ? null : t.quantity - t.sold;
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-content flex flex-wrap items-center gap-2 text-sm font-medium">
                    {t.name}
                    {!t.isActive && <Badge className="bg-ink/5 text-content-muted">closed</Badge>}
                    {left !== null && left <= 0 && t.isActive && (
                      <Badge className="bg-ink/5 text-content-muted">sold out</Badge>
                    )}
                  </p>
                  <p className="text-content-muted text-xs">
                    {t.priceKobo === 0 ? 'Free' : naira(t.priceKobo)}
                    {' · '}
                    {t.sold} sold
                    {left !== null ? ` · ${Math.max(0, left)} left` : ' · no limit'}
                    {t.description ? ` · ${t.description}` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => run(() => setTierActive(t.id, !t.isActive))}
                >
                  {t.isActive ? 'Close' : 'Reopen'}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Plus className="text-content-muted size-4 shrink-0" aria-hidden="true" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tier name — Early bird, Regular, VIP"
            className="min-w-48 flex-1"
          />
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price ₦"
            inputMode="numeric"
            className="w-32"
          />
          <Input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="How many"
            inputMode="numeric"
            className="w-32"
          />
          <Button
            disabled={busy || !name.trim() || price.trim() === ''}
            onClick={() =>
              run(
                () =>
                  addTicketTier({
                    eventId,
                    name,
                    priceNaira: price,
                    quantity: quantity.trim() === '' ? undefined : quantity,
                  }),
                () => {
                  setName('');
                  setPrice('');
                  setQuantity('');
                },
              )
            }
          >
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            Add tier
          </Button>
        </div>
        <p className="text-content-muted text-xs">
          Leave the count empty for unlimited. Price 0 makes it a free ticket that still needs
          claiming, which is how you count who is coming.
        </p>
        {error && <p className="text-coral text-xs">{error}</p>}
      </div>
    </div>
  );
}
