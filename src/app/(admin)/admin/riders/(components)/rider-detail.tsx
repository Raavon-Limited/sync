/**
 * One rider: what they have moved, whether they should be working, and their
 * documents.
 *
 * TWO DECISIONS, AND THEY ARE NOT THE SAME ONE
 *   Verification asks "are these documents real". Suspension asks "should this
 *   person be working right now". A rider with a genuine licence who keeps
 *   dropping orders is not unverified   rejecting them would assert their papers
 *   are forged, which is both false and permanent-shaped. So the review card
 *   handles verification and the control above it handles suspension, and
 *   neither pretends to be the other.
 *
 * THE IN-FLIGHT COUNT IS A WARNING, NOT A STATISTIC
 *   Suspending takes a rider offline immediately. If they are holding somebody's
 *   food at the time, that order strands and a human has to go find it. The
 *   count sits next to the suspend control for exactly that reason, and the
 *   confirm names it.
 */
'use client';

import { useState, useTransition } from 'react';
import { Bike, Building2, CircleDot, Loader2, ShieldAlert, Star } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { formatKobo } from '@/lib/utils/format';
import { setAccountSuspension } from '@/modules/admin/actions';
import { STATUS_BADGE } from '@/components/admin/account-queue';
import { VerificationReview } from '@/components/admin/verification-review';
import type { AdminRider } from './riders-console';

export function RiderDetail({ rider }: { rider: AdminRider }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-content flex flex-wrap items-center gap-2 text-lg font-medium">
              {rider.name}
              <Badge className={STATUS_BADGE[rider.verificationStatus] ?? STATUS_BADGE.unverified}>
                {rider.verificationStatus}
              </Badge>
              {rider.blocked && (
                <Badge className="bg-rose-500/10 text-rose-600">blocked for fraud</Badge>
              )}
              {rider.isOnline && !rider.suspendedAt && (
                <span className="text-accent-fg flex items-center gap-1 text-xs">
                  <CircleDot className="size-3" aria-hidden="true" />
                  online
                </span>
              )}
            </p>
            <p className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="flex items-center gap-1">
                <Bike className="size-3.5" aria-hidden="true" />
                {rider.vehicleType}
                {rider.plateNumber ? ` · ${rider.plateNumber}` : ''}
              </span>
              <span className="flex items-center gap-1">
                <Building2 className="size-3.5" aria-hidden="true" />
                {rider.companyName ?? 'Independent'}
              </span>
              {rider.email && <span>{rider.email}</span>}
              {rider.phone && <span>{rider.phone}</span>}
              <span>
                joined{' '}
                {new Date(rider.createdAt).toLocaleDateString('en-NG', {
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <Stat label="Delivered" value={String(rider.delivered)} />
            <Stat label="In flight" value={String(rider.active)} />
            <Stat label="Fees earned" value={formatKobo(rider.earnedKobo)} />
            <Stat label="Rating" value={rider.ratingAvg > 0 ? rider.ratingAvg.toFixed(1) : ' '} />
            <Star className="text-content-muted size-4" aria-hidden="true" />
          </div>
        </div>

        <SuspensionControl rider={rider} />
      </div>

      {/* The documents and the verify/reject/fraud decision, shared with the
          vendor queue. `kind` is what points its buttons at
          set_rider_verification instead. */}
      <VerificationReview
        kind="rider"
        showHeader={false}
        vendor={{
          id: rider.id,
          businessName: rider.name,
          slug: rider.id,
          category: rider.vehicleType,
          area: rider.plateNumber,
          verificationStatus: rider.verificationStatus,
          createdAt: rider.createdAt,
          docs: rider.docs,
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-content truncate text-sm font-medium">{value}</p>
      <p className="text-content-muted text-[11px] tracking-wide uppercase">{label}</p>
    </div>
  );
}

/** Suspend / reinstate, with the reason the database insists on. */
function SuspensionControl({ rider }: { rider: AdminRider }) {
  const [busy, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const suspended = rider.suspendedAt != null;

  function run(next: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await setAccountSuspension({ userId: rider.id, suspended: next, reason });
        setReason('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not go through. Try again.');
      }
    });
  }

  if (suspended) {
    return (
      <div className="border-coral/30 bg-coral/5 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
        <ShieldAlert className="text-coral size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-coral text-sm font-medium">Suspended cannot take deliveries</p>
          {rider.suspendedReason && (
            <p className="text-content-muted text-xs">{rider.suspendedReason}</p>
          )}
        </div>
        <Button variant="outline" disabled={busy} onClick={() => run(false)}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy ? 'Reinstating…' : 'Reinstate'}
        </Button>
        {error && <p className="text-coral w-full text-xs">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for suspending…"
        className="min-w-0 flex-1"
      />
      <Button
        variant="outline"
        className="text-coral"
        // The reason is required by set_account_suspension, so the button says
        // so by staying dead rather than letting the click fail in the database.
        disabled={busy || !reason.trim()}
        onClick={() => {
          const warning =
            rider.active > 0
              ? `${rider.name} is holding ${rider.active} delivery${rider.active === 1 ? '' : 'ies'} right now. ` +
                'Suspending strands ' +
                (rider.active === 1 ? 'it' : 'them') +
                ' and somebody will have to reassign by hand.\n\nSuspend anyway?'
              : `Suspend ${rider.name}? They keep their account and history but cannot take deliveries.`;
          if (window.confirm(warning)) run(true);
        }}
      >
        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
        {busy ? 'Suspending…' : 'Suspend'}
      </Button>
      {error && <p className="text-coral w-full text-xs">{error}</p>}
    </div>
  );
}
