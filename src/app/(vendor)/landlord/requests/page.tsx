/**
 * ROUTE: /landlord/requests
 * ACCESS: landlord (gated in proxy.ts)
 * PURPOSE: Students asking to move in, and whether Sync has checked who they
 *          are.
 *
 * WAS A COMING-SOON PLACEHOLDER, and the landlord branch never built it either.
 * The rows are `bookings` that are still waiting on the landlord - the same
 * table the tenants page reads, through a different filter, which is why both
 * go through one query rather than two that could disagree about what
 * "pending" means.
 *
 * IT DOES NOT DECIDE ANYTHING YET
 *   Accepting a request moves money into escrow and takes a room out of
 *   availability. That is a transaction with a booking RPC behind it, not a
 *   button this screen can honestly offer today - so it shows the request, the
 *   student, and whether they are verified, and says plainly where the decision
 *   currently lives. A button that looked like it accepted and did not would be
 *   worse than no button.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CalendarClock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/modules/auth/queries';
import { PageHeader } from '../(components)/shared/page-header';
import { getLandlordRequests } from '../(components)/landlord-queries';
import { formatDate, formatNaira, initials } from '../(components)/landlord-types';

export const metadata: Metadata = { title: 'Requests' };

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/landlord/requests');

  const requests = await getLandlordRequests(user.id);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Requests"
        description="Students who have asked to move in and are waiting on you."
      />

      {requests.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          Nothing waiting. New booking requests land here.
        </p>
      ) : (
        <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="bg-ink/5 text-content-muted flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {initials(r.name)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-content flex flex-wrap items-center gap-2 text-sm font-medium">
                  {r.name}
                  {/* The one thing a landlord wants to know before letting a
                      stranger into a building. */}
                  {r.studentVerified ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600">
                      <ShieldCheck className="size-3" /> verified
                    </Badge>
                  ) : (
                    <Badge className="bg-ink/5 text-content-muted">
                      <ShieldAlert className="size-3" /> not verified
                    </Badge>
                  )}
                </p>
                <p className="text-content-muted text-xs">
                  {r.property}
                  {r.requestedMoveIn && (
                    <>
                      {' · '}
                      <CalendarClock className="inline size-3" /> moving in{' '}
                      {formatDate(r.requestedMoveIn)}
                    </>
                  )}
                </p>
              </div>

              <p className="text-content text-sm font-semibold tabular-nums">
                {formatNaira(r.amount)}
              </p>
              <Badge className="bg-amber-500/10 text-amber-600">{r.status}</Badge>
            </div>
          ))}
        </div>
      )}

      <p className="text-content-muted text-xs">
        Accepting a request moves money into escrow and takes the room out of availability, so it is
        handled in the booking flow rather than here.
      </p>
    </div>
  );
}
