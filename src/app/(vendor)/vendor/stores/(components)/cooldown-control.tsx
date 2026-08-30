/**
 * The order cooldown for one store.
 *
 * WHAT IT IS FOR
 *   A kitchen with more tickets than hands needs to stop taking orders for ten
 *   minutes, not close for the day. `is_accepting_orders` — the switch next to
 *   this — has no expiry, so it either never gets turned off or never gets
 *   turned back on. A cooldown is a deadline: it ends because the time passes.
 *
 * WHY THE COUNTDOWN TICKS
 *   A pause that says "7 min left" and then sits there is indistinguishable
 *   from a pause that is stuck. The re-render is local and cheap; nothing is
 *   re-fetched until the deadline actually passes, and then exactly once.
 *
 * THE SERVER OWNS THE CLOCK
 *   `pause_store` returns the deadline it set rather than trusting the minutes
 *   we asked for, so a device with the wrong time counts down against the
 *   database's clock and not its own.
 */
'use client';

import { useEffect, useState } from 'react';
import { Pause, Play, Timer, TriangleAlert } from 'lucide-react';
import { Button, Input, Badge } from '@/components/ui';
import { usePauseStore, useResumeStore, useUpdateStorefront } from '@/modules/storefronts/hooks';
import { pauseMinutesLeft, type Storefront } from '@/modules/storefronts/types';

/** The three lengths worth a single tap. Anything else is a rare case. */
const PRESETS = [5, 10, 15];

export function CooldownControl({ store }: { store: Storefront }) {
  const pause = usePauseStore();
  const resume = useResumeStore();
  const update = useUpdateStorefront();

  const [, forceTick] = useState(0);
  const [limit, setLimit] = useState<string>(
    store.autoPauseAfter == null ? '' : String(store.autoPauseAfter),
  );

  const minutesLeft = pauseMinutesLeft(store.pausedUntil);
  const paused = minutesLeft > 0;

  // Tick only while something is counting down. A timer that runs on every
  // store, paused or not, is a re-render a second for no reason.
  useEffect(() => {
    if (!paused) return;
    const id = setInterval(() => forceTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, [paused]);

  const busy = pause.isPending || resume.isPending;
  const error = (pause.error ?? resume.error ?? update.error) as Error | null;

  return (
    <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-content flex items-center gap-2 text-sm font-semibold">
          <Timer className="size-4" /> Order cooldown
        </h3>
        {paused ? (
          <Badge className="gap-1 bg-amber-500/10 text-amber-600">
            Paused · {minutesLeft} min left
            {/* Why it paused matters: one of these is the vendor's decision
                and the other is the platform noticing they are underwater. */}
            {store.pauseReason === 'auto_backlog' && ' · automatic'}
          </Badge>
        ) : (
          <Badge className="bg-emerald-500/10 text-emerald-600">Taking orders</Badge>
        )}
      </div>

      <p className="text-content-muted text-xs">
        Stops new orders for a few minutes and then reopens on its own. Orders
        already placed are unaffected, and students can still see the store and
        message you.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {paused ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => resume.mutate(store.id)}
            className="gap-2"
          >
            <Play className="size-4" /> Resume now
          </Button>
        ) : (
          PRESETS.map((m) => (
            <Button
              key={m}
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => pause.mutate({ id: store.id, minutes: m })}
              className="gap-2"
            >
              <Pause className="size-4" /> {m} min
            </Button>
          ))
        )}
      </div>

      {/* ── Automatic ───────────────────────────────────────────────────── */}
      <form
        className="border-line/10 flex flex-wrap items-end gap-2 border-t pt-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          const n = limit.trim() === '' ? null : Number(limit);
          if (n !== null && (!Number.isFinite(n) || n < 1)) return;
          update.mutate({ id: store.id, autoPauseAfter: n });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-content-muted text-xs">
            Pause automatically after this many unfinished orders
          </span>
          <Input
            type="number"
            min={1}
            value={limit}
            onChange={(ev) => setLimit(ev.target.value)}
            placeholder="Off"
            className="w-28"
          />
        </label>
        <Button type="submit" variant="outline" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
        <p className="text-content-muted basis-full text-xs">
          {/* Counting the backlog, not the rate: a store that took four orders
              an hour ago and has not started any of them is the one that is
              actually struggling. */}
          Counts orders you have accepted but not sent out. Leave empty to never
          pause automatically. Automatic pauses last {store.autoPauseMinutes} minutes.
        </p>
      </form>

      {error && (
        <p className="text-coral flex items-center gap-1 text-xs">
          <TriangleAlert className="size-3" /> {error.message}
        </p>
      )}
    </div>
  );
}
