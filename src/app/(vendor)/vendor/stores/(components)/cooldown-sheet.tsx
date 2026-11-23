/**
 * The order cooldown for one store, behind a button.
 *
 * WHAT IT IS FOR
 *   A kitchen with more tickets than hands needs to stop taking orders for ten
 *   minutes, not close for the day. `is_accepting_orders`   the switch next to
 *   this   has no expiry, so it either never gets turned off or never gets
 *   turned back on. A cooldown is a deadline: it ends because the time passes.
 *
 * WHY A PANEL AND NOT A CARD ON THE PAGE
 *   Open by default, the cooldown sat between the store cards and everything
 *   below them, so the settings a vendor touches twice a year pushed the ones
 *   they touch daily off the screen. The state that has to be visible without
 *   opening anything is whether the store is taking orders   that is on the
 *   trigger itself, and it is the reason the trigger is not a plain button.
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
import {
  Button,
  Input,
  Badge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui';
import { usePauseStore, useResumeStore, useUpdateStorefront } from '@/modules/storefronts/hooks';
import {
  DEFAULT_AUTO_PAUSE_AFTER,
  pauseMinutesLeft,
  type Storefront,
} from '@/modules/storefronts/types';

/** The three lengths worth a single tap. Anything else is a rare case. */
const PRESETS = [5, 10, 15];

export function CooldownSheet({ store, disabled }: { store: Storefront; disabled?: boolean }) {
  const pause = usePauseStore();
  const resume = useResumeStore();
  const update = useUpdateStorefront();

  const [open, setOpen] = useState(false);
  const [, forceTick] = useState(0);
  // 0 is "never" in the database; the field shows it as empty, because a
  // vendor turning this off types nothing rather than typing a zero.
  const [limit, setLimit] = useState<string>(
    store.autoPauseAfter === 0 ? '' : String(store.autoPauseAfter),
  );

  const minutesLeft = pauseMinutesLeft(store.pausedUntil);
  const paused = minutesLeft > 0;

  // Re-seed when the sheet is opened against a different store. Without this,
  // switching stores and reopening shows the previous one's limit.
  const [seededFor, setSeededFor] = useState(store.id);
  if (seededFor !== store.id) {
    setSeededFor(store.id);
    setLimit(store.autoPauseAfter === 0 ? '' : String(store.autoPauseAfter));
  }

  // Tick only while something is counting down, and only while the panel is
  // open. A timer per store, paused or not, is a re-render a second for
  // nothing anybody is looking at.
  useEffect(() => {
    if (!paused || !open) return;
    const id = setInterval(() => forceTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, [paused, open]);

  const busy = pause.isPending || resume.isPending;
  const error = (pause.error ?? resume.error ?? update.error) as Error | null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" disabled={disabled} className="w-fit gap-2">
          <Timer className="size-4" />
          Order cooldown
          {/* The state travels with the trigger. A vendor should not have to
              open a panel to find out their shop is shut. */}
          {paused ? (
            <Badge className="bg-amber-500/10 text-amber-600">{minutesLeft} min left</Badge>
          ) : (
            <Badge className="bg-lime/15 text-accent-fg">Taking orders</Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Timer className="size-4 shrink-0" /> Order cooldown
          </SheetTitle>
          <SheetDescription>
            {store.name} · stops new orders for a few minutes and then reopens on its own. Orders
            already placed are unaffected, and students can still see the store and message you.
          </SheetDescription>
        </SheetHeader>

        <div className="border-line/10 flex items-center justify-between gap-2 rounded-xl border p-3">
          <span className="text-content-muted text-xs">Right now</span>
          {paused ? (
            <Badge className="gap-1 bg-amber-500/10 text-amber-600">
              Paused · {minutesLeft} min left
              {/* Why it paused matters: one of these is the vendor's decision
                  and the other is the platform noticing they are underwater. */}
              {store.pauseReason === 'auto_backlog' && ' · automatic'}
            </Badge>
          ) : (
            <Badge className="bg-lime/15 text-accent-fg">Taking orders</Badge>
          )}
        </div>

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

        {/* ── Automatic ──────────────────────────────────────────────────── */}
        <form
          className="border-line/10 flex flex-col gap-2 border-t pt-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            const n = limit.trim() === '' ? 0 : Number(limit);
            if (!Number.isFinite(n) || n < 0) return;
            update.mutate({ id: store.id, autoPauseAfter: n });
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-content-muted text-xs">
              Pause automatically after this many unfinished orders
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={limit}
                onChange={(ev) => setLimit(ev.target.value)}
                placeholder="Off"
                className="w-28"
              />
              <Button type="submit" variant="outline" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
              {/* Getting back to the default has to be one tap. A vendor who
                  experimented with 20 and wants the sensible number back
                  should not have to remember what it was. */}
              {store.autoPauseAfter !== DEFAULT_AUTO_PAUSE_AFTER && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={update.isPending}
                  onClick={() => {
                    setLimit(String(DEFAULT_AUTO_PAUSE_AFTER));
                    update.mutate({ id: store.id, autoPauseAfter: DEFAULT_AUTO_PAUSE_AFTER });
                  }}
                >
                  Reset to {DEFAULT_AUTO_PAUSE_AFTER}
                </Button>
              )}
            </div>
          </label>

          <p className="text-content-muted text-xs">
            {/* Counting the backlog, not the rate: a store that took four orders
                an hour ago and has not started any of them is the one that is
                actually struggling. */}
            Counts orders you have accepted but not sent out. Every store starts at{' '}
            {DEFAULT_AUTO_PAUSE_AFTER}; leave it empty to never pause automatically.
          </p>
          <p className="text-content-muted text-xs">
            An automatic pause lifts as soon as you get back under your limit   you do not have to
            wait it out. If nothing moves at all it ends by itself after {store.autoPauseMinutes}{' '}
            minutes, so the shop can never stay shut because you forgot about it.
          </p>
        </form>

        {error && (
          <p className="text-coral flex items-center gap-1 text-xs">
            <TriangleAlert className="size-3 shrink-0" /> {error.message}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
