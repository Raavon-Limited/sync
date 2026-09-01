/**
 * A fleet owner's view of their own company: where its papers stand, who rides
 * for it, and who is carrying something right now.
 *
 * ADDING A RIDER TAKES A PHONE NUMBER, NOT A PICKER
 *   A dropdown of every unaffiliated rider on the platform would hand one fleet
 *   a directory of every rival's riders. A fleet knows who it employs; the
 *   number they signed up with is how that knowledge is proved. See
 *   modules/rider/fleet.
 *
 * THE OWNER CANNOT RELEASE THEMSELVES
 *   They ride for their own fleet, and a company with no riders whose owner is
 *   wondering where their jobs went is a support ticket, not a feature.
 */
'use client';

import { useState, useTransition } from 'react';
import { Bike, CircleDot, Loader2, ShieldAlert, UserPlus } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { STATUS_BADGE } from '@/components/admin/account-queue';
import {
  addRiderToFleet,
  setRiderCompany,
  submitCompanyVerification,
} from '@/modules/rider/actions';
import type { Fleet } from '@/modules/rider/fleet';

export function FleetConsole({ fleet }: { fleet: Fleet }) {
  const [busy, startTransition] = useTransition();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>, onDone?: (v: unknown) => void) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const v = await fn();
        onDone?.(v);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not go through.');
      }
    });
  }

  const carrying = fleet.riders.reduce((n, r) => n + r.active, 0);
  const delivered = fleet.riders.reduce((n, r) => n + r.delivered, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="border-line/10 bg-panel flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4">
        <div className="min-w-0">
          <p className="text-content flex flex-wrap items-center gap-2 font-medium">
            {fleet.name}
            <Badge className={STATUS_BADGE[fleet.verificationStatus] ?? STATUS_BADGE.unverified}>
              {fleet.verificationStatus}
            </Badge>
            {fleet.blocked && <Badge className="bg-rose-500/10 text-rose-600">blocked</Badge>}
          </p>
          <p className="text-content-muted text-xs">
            {fleet.riders.length} rider{fleet.riders.length === 1 ? '' : 's'} · {carrying} carrying
            now · {delivered} delivered
          </p>
        </div>

        {/* Only offered when it would do something. A company already pending or
            verified has nothing to submit, and the button would just fail. */}
        {(fleet.verificationStatus === 'unverified' || fleet.verificationStatus === 'rejected') &&
          !fleet.blocked && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => run(() => submitCompanyVerification(fleet.id))}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              Submit for review
            </Button>
          )}
      </div>

      <div className="border-line/10 bg-panel flex flex-wrap items-center gap-2 rounded-xl border p-4">
        <UserPlus className="text-content-muted size-4 shrink-0" aria-hidden="true" />
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Rider's phone number"
          className="min-w-0 flex-1"
        />
        <Button
          variant="outline"
          disabled={busy || !phone.trim()}
          onClick={() =>
            run(
              () => addRiderToFleet({ companyId: fleet.id, phone }),
              (name) => {
                setPhone('');
                setMessage(`${String(name)} now rides for ${fleet.name}.`);
              },
            )
          }
        >
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          Add rider
        </Button>
        <p className="text-content-muted w-full text-xs">
          They need a rider account already. Sync verifies each rider separately from the fleet.
        </p>
        {message && <p className="w-full text-xs text-emerald-600">{message}</p>}
        {error && <p className="text-coral w-full text-xs">{error}</p>}
      </div>

      {fleet.riders.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          Nobody rides for this fleet yet.
        </p>
      ) : (
        <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
          {fleet.riders.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-content flex flex-wrap items-center gap-2 text-sm font-medium">
                  {r.name}
                  {r.isOwner && <Badge className="bg-ink/5 text-content-muted">you</Badge>}
                  <Badge className={STATUS_BADGE[r.verificationStatus] ?? STATUS_BADGE.unverified}>
                    {r.verificationStatus}
                  </Badge>
                  {r.suspended && (
                    <Badge className="bg-coral/10 text-coral flex items-center gap-1">
                      <ShieldAlert className="size-3" aria-hidden="true" />
                      suspended
                    </Badge>
                  )}
                  {r.isOnline && !r.suspended && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <CircleDot className="size-3" aria-hidden="true" />
                      online
                    </span>
                  )}
                </p>
                <p className="text-content-muted flex flex-wrap items-center gap-x-3 text-xs">
                  <span className="flex items-center gap-1">
                    <Bike className="size-3" aria-hidden="true" />
                    {r.vehicleType}
                    {r.plateNumber ? ` · ${r.plateNumber}` : ''}
                  </span>
                  <span>{r.delivered} delivered</span>
                  {r.active > 0 && <span className="text-amber-600">{r.active} carrying</span>}
                  {r.phone && <span>{r.phone}</span>}
                </p>
              </div>

              {!r.isOwner && (
                <Button
                  variant="ghost"
                  className="text-coral"
                  disabled={busy}
                  onClick={() => {
                    const warning =
                      r.active > 0
                        ? `${r.name} is carrying ${r.active} delivery${r.active === 1 ? '' : 'ies'} right now. ` +
                          'Releasing them does not cancel those — they finish the jobs they hold.\n\nRelease anyway?'
                        : `Release ${r.name} from ${fleet.name}? They become an independent rider and keep their history.`;
                    if (window.confirm(warning)) run(() => setRiderCompany(r.id, null));
                  }}
                >
                  Release
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
