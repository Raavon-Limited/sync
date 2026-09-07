/**
 * The banner every rider screen opens with, and the switch that puts them on
 * the board.
 *
 * WHY THE BANNER IS NOT JUST A BADGE
 *   A rider who cannot take work needs to know WHY and WHAT NEXT, in that
 *   order. "unverified" as a chip answers neither. Each state below says the
 *   thing that is true and the thing to do about it, and only the state that
 *   permits work shows the switch at all   an online toggle that silently does
 *   nothing is worse than no toggle.
 *
 * SUSPENSION OUTRANKS VERIFICATION
 *   A suspended rider may well be verified. Showing "verified ✓" above a switch
 *   that refuses to move is the confusing case, so suspension is checked first
 *   and states itself in the reviewer's own words.
 */
'use client';

import { useState, useTransition } from 'react';
import { CircleDot, Loader2, ShieldAlert, ShieldCheck, Clock, Upload } from 'lucide-react';
import { Button } from '@/components/ui';
import { setRiderOnline } from '@/modules/rider/actions';
import { SITE } from '@/config/site';
import type { RiderProfile } from '@/modules/rider/queries';

export function RiderStatus({ rider }: { rider: RiderProfile }) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        await setRiderOnline(!rider.isOnline);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not go through.');
      }
    });
  }

  if (rider.suspendedAt) {
    return (
      <Banner
        tone="coral"
        icon={<ShieldAlert className="size-5 shrink-0" aria-hidden="true" />}
        title="Your account is suspended"
        body={
          rider.suspendedReason ??
          `You cannot take deliveries right now. Contact ${SITE.support.help}.`
        }
      />
    );
  }

  if (rider.blocked) {
    return (
      <Banner
        tone="coral"
        icon={<ShieldAlert className="size-5 shrink-0" aria-hidden="true" />}
        title="This account cannot be verified"
        body={rider.blockedReason ?? `Contact ${SITE.support.help}.`}
      />
    );
  }

  if (rider.verificationStatus === 'pending') {
    return (
      <Banner
        tone="amber"
        icon={<Clock className="size-5 shrink-0" aria-hidden="true" />}
        title="We are checking your documents"
        body="Usually within a day. You will be able to go online as soon as a reviewer signs off."
      />
    );
  }

  if (rider.verificationStatus === 'rejected') {
    return (
      <Banner
        tone="coral"
        icon={<ShieldAlert className="size-5 shrink-0" aria-hidden="true" />}
        title="Your documents were not accepted"
        body="Open the ones marked as needing action, replace them, and submit again."
        action={
          <Button variant="outline" asChild>
            <a href="/rider/join">Fix and resubmit</a>
          </Button>
        }
      />
    );
  }

  if (rider.verificationStatus !== 'verified') {
    return (
      <Banner
        tone="amber"
        icon={<Upload className="size-5 shrink-0" aria-hidden="true" />}
        title="Finish signing up to start riding"
        body="We need a live photo, a government ID and proof of your address."
        action={
          <Button asChild>
            <a href="/rider/join">Finish signing up</a>
          </Button>
        }
      />
    );
  }

  return (
    <div className="border-line/10 bg-panel flex flex-wrap items-center gap-3 rounded-xl border p-4">
      <ShieldCheck className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-content font-medium">
          {rider.isOnline ? 'You are on the board' : 'You are offline'}
        </p>
        <p className="text-content-muted text-xs">
          {rider.isOnline
            ? 'Open jobs on your campus are visible to you now.'
            : 'Go online to see jobs you can take.'}
        </p>
      </div>
      {rider.isOnline && (
        <span className="flex items-center gap-1 text-xs text-emerald-600">
          <CircleDot className="size-3" aria-hidden="true" />
          online
        </span>
      )}
      <Button variant={rider.isOnline ? 'outline' : 'primary'} disabled={busy} onClick={toggle}>
        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
        {busy ? 'Just a moment…' : rider.isOnline ? 'Go offline' : 'Go online'}
      </Button>
      {error && <p className="text-coral w-full text-xs">{error}</p>}
    </div>
  );
}

function Banner({
  tone,
  icon,
  title,
  body,
  action,
}: {
  tone: 'amber' | 'coral';
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  const cls =
    tone === 'coral'
      ? 'border-coral/30 bg-coral/5 text-coral'
      : 'border-amber-500/30 bg-amber-500/5 text-amber-600';
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 ${cls}`}>
      {icon}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-content-muted text-xs">{body}</p>
      </div>
      {action}
    </div>
  );
}
