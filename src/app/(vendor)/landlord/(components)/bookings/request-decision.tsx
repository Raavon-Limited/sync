/**
 * Accept or decline one booking request.
 *
 * DECLINE ASKS TWICE, ACCEPT DOES NOT. Accepting is recoverable - the hold runs
 * out on its own in 24 hours and the room comes back - so a misclick costs a
 * day. Declining is terminal: the booking goes to `cancelled`, the student is
 * told, and there is no undo on this screen. The confirm is on the one that
 * cannot be taken back, and nowhere else.
 *
 * WHAT THE LANDLORD IS TOLD ACCEPT MEANS is written on the button's own row
 * rather than left to be discovered. "The room is held for 24 hours while they
 * pay" is the entire deal, and a landlord who thinks accepting means they have
 * been paid will chase the wrong person when nothing arrives.
 */
'use client';

import { useState, useTransition } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { acceptBookingRequest, declineBookingRequest } from '@/modules/hostels/request-actions';
import { useActionRefresh } from '@/lib/query/use-action-refresh';

export function RequestDecision({ bookingId, name }: { bookingId: string; name: string }) {
  const [busy, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useActionRefresh();

  function run(action: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await action(bookingId);
      // On success the server action revalidates and this row leaves the list,
      // so there is no success state to render - the row simply goes. The
      // refresh is for everything that is NOT server-rendered beside it.
      if (!res.ok) {
        setError(res.error ?? 'That did not go through.');
      } else {
        await refresh();
      }
      setConfirming(false);
    });
  }

  if (confirming) {
    return (
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        <p className="text-content-muted text-xs">Decline {name}&rsquo;s request?</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="flex-1 sm:flex-none"
          >
            Keep it
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => run(declineBookingRequest)}
            className="text-coral border-coral/30 hover:bg-coral/10 flex-1 border bg-transparent sm:flex-none"
          >
            {busy ? 'Declining…' : 'Yes, decline'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-end gap-1 sm:w-auto">
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setConfirming(true)}
          className="flex-1 sm:flex-none"
        >
          <X className="size-3.5" />
          Decline
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => run(acceptBookingRequest)}
          className="flex-1 sm:flex-none"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {busy ? 'Accepting…' : 'Accept'}
        </Button>
      </div>
      {error && <p className="text-coral max-w-64 text-right text-[11px]">{error}</p>}
    </div>
  );
}
