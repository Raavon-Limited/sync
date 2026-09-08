/**
 * How long is left on a room hold.
 *
 * WHY THE LANDLORD SEES THIS TOO. Accepting a request takes their room off the
 * market for 24 hours, and if the student does not pay it goes back on by
 * itself. Without the clock the row just says AWAITING_PAYMENT indefinitely,
 * and there is no way to tell "accepted a minute ago" from "about to lapse" -
 * which is exactly the difference between waiting and chasing them.
 *
 * HOURS AND MINUTES, not days. The whole window is 24 hours, so a day-rounded
 * figure reads "1 day" for almost all of it and then "0 days".
 *
 * A client component only because it ticks; the row around it stays a server
 * component.
 */
'use client';

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

function remaining(iso: string): string | null {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function HoldCountdown({ endsAt }: { endsAt: string }) {
  // Minute granularity, so a 30s tick is enough - a per-second interval would
  // re-render 59 times for no visible change.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const left = remaining(endsAt);

  // Past the deadline the sweep may not have run yet, but the room is gone as
  // far as anyone acting on this screen is concerned. Saying so beats counting
  // into negative time.
  if (!left) {
    return (
      <span className="text-content-muted inline-flex items-center gap-1 text-[11px]">
        <Timer className="size-3" />
        hold expired
      </span>
    );
  }

  return (
    <span className="text-coral inline-flex items-center gap-1 text-[11px] font-medium">
      <Timer className="size-3" />
      {left} left to pay
    </span>
  );
}
