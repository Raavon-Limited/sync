/**
 * The riders list — who they are, what they have moved, and the two decisions
 * staff make about them.
 *
 * TWO DECISIONS, AND THEY ARE NOT THE SAME ONE
 *   Verification asks "are these documents real". Suspension asks "should this
 *   person be working right now". A rider with a genuine licence who keeps
 *   dropping orders is not unverified — rejecting them would say their papers
 *   are forged, which is both false and permanent-shaped. So the review card
 *   handles verification and the row below it handles suspension, and neither
 *   pretends to be the other.
 *
 * THE IN-FLIGHT COUNT IS A WARNING, NOT A STATISTIC
 *   Suspending a rider takes them offline immediately. If they are holding
 *   somebody's food at the time, that order is stranded and a human has to go
 *   find it. The count sits next to the suspend control for exactly that
 *   reason.
 */
'use client';

import { useMemo, useState, useTransition } from 'react';
import { Bike, Building2, CircleDot, Loader2, ShieldAlert, Star } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import {
  AccountCard,
  QueueFilterBar,
  useQueueFilter,
  useStatusCounts,
} from '@/components/admin/account-queue';
import { formatKobo } from '@/lib/utils/format';
import { setAccountSuspension } from '@/modules/admin/actions';
import { VerificationReview, type AdminDoc } from '@/components/admin/verification-review';

export interface AdminRider {
  id: string;
  name: string;
  phone: string | null;
  vehicleType: string;
  plateNumber: string | null;
  verificationStatus: string;
  blocked: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  companyName: string | null;
  isOnline: boolean;
  ratingAvg: number;
  delivered: number;
  active: number;
  earnedKobo: number;
  createdAt: string;
  docs: AdminDoc[];
  selfieUrl?: string;
}

function matches(r: AdminRider, filter: string) {
  if (filter === 'all') return true;
  // Suspension is orthogonal to verification, so it is its own chip rather than
  // a value the status filter could ever return.
  if (filter === 'suspended') return r.suspendedAt != null;
  return r.verificationStatus === filter;
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
          <p className="text-coral text-sm font-medium">Suspended — cannot take deliveries</p>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-content truncate text-sm font-medium">{value}</p>
      <p className="text-content-muted text-[11px] tracking-wide uppercase">{label}</p>
    </div>
  );
}

export function RidersConsole({ riders }: { riders: AdminRider[] }) {
  const statusCounts = useStatusCounts(riders);
  // Suspension is not a verification status, so useStatusCounts cannot know
  // about it — it is counted here and passed alongside.
  const counts = useMemo(() => {
    const c = { ...statusCounts };
    for (const r of riders) if (r.suspendedAt) c.suspended = (c.suspended ?? 0) + 1;
    return c;
  }, [statusCounts, riders]);

  const [filter, setFilter] = useQueueFilter(counts);
  const [search, setSearch] = useState('');

  const visible = riders.filter((r) => {
    if (!matches(r, filter)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.plateNumber ?? '').toLowerCase().includes(q) ||
      (r.companyName ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <QueueFilterBar
        filter={filter}
        onFilter={setFilter}
        search={search}
        onSearch={setSearch}
        counts={counts}
        placeholder="Search name, plate or fleet…"
        extra={['suspended']}
      />

      {visible.length === 0 && (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          {riders.length === 0
            ? 'No riders have signed up yet.'
            : filter === 'pending'
              ? 'Nothing waiting on you.'
              : 'No riders match.'}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {visible.map((r) => (
          <AccountCard
            key={r.id}
            name={r.name}
            status={r.verificationStatus}
            faceUrl={r.selfieUrl}
            flags={
              <>
                {r.blocked && (
                  <Badge className="bg-rose-500/10 text-rose-600">blocked for fraud</Badge>
                )}
                {r.suspendedAt && <Badge className="bg-coral/10 text-coral">suspended</Badge>}
                {r.isOnline && !r.suspendedAt && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CircleDot className="size-3" aria-hidden="true" />
                    online
                  </span>
                )}
              </>
            }
            meta={
              <p className="text-content-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="flex items-center gap-1">
                  <Bike className="size-3.5" aria-hidden="true" />
                  {r.vehicleType}
                  {r.plateNumber ? ` · ${r.plateNumber}` : ''}
                </span>
                <span className="flex items-center gap-1">
                  <Building2 className="size-3.5" aria-hidden="true" />
                  {r.companyName ?? 'Independent'}
                </span>
                <span>{r.delivered} delivered</span>
                {/* Surfaced on the COLLAPSED card on purpose: a rider holding
                    somebody's food is the one fact you need before deciding
                    whether to open them, not after. */}
                {r.active > 0 && <span className="text-amber-600">{r.active} in flight</span>}
              </p>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-5">
                <Stat label="Delivered" value={String(r.delivered)} />
                <Stat label="In flight" value={String(r.active)} />
                <Stat label="Fees earned" value={formatKobo(r.earnedKobo)} />
                <Stat label="Rating" value={r.ratingAvg > 0 ? r.ratingAvg.toFixed(1) : '—'} />
                <Star className="text-content-muted size-4" aria-hidden="true" />
                {r.phone && <Stat label="Phone" value={r.phone} />}
              </div>

              <SuspensionControl rider={r} />

              {/* The documents and the verify/reject/fraud decision, shared with
                  the vendor queue. `kind` is what points its buttons at
                  set_rider_verification instead. */}
              <VerificationReview
                kind="rider"
                showHeader={false}
                vendor={{
                  id: r.id,
                  businessName: r.name,
                  slug: r.id,
                  category: r.vehicleType,
                  area: r.plateNumber,
                  verificationStatus: r.verificationStatus,
                  createdAt: r.createdAt,
                  docs: r.docs,
                }}
              />
            </div>
          </AccountCard>
        ))}
      </div>
    </div>
  );
}
