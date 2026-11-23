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
 * IT DECIDES NOW, and the caution this header used to carry was aimed at the
 * wrong risk. It said accepting "moves money into escrow", so the button was
 * withheld until an RPC existed to do that safely. Accepting moves no money:
 * it sets `awaiting_payment`, which starts a 24-hour hold and asks the student
 * to pay. Escrow is created by the payment, and `guard_booking_privileged_cols`
 * refuses `confirmed` from any client precisely so a landlord cannot shortcut
 * to it.
 *
 * Meanwhile the real cost of not shipping it was total: nothing else in the
 * product could write `awaiting_payment` either, so every request ever made sat
 * at `requested` and the whole hold system was unreachable. The honest button
 * was the missing piece, not the dangerous one.
 *
 * The database side has been ready since `20260823110000` - see
 * modules/hostels/request-actions.ts for why this needs no RPC.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CalendarClock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/modules/auth/queries';
import { PageHeader } from '../(components)/shared/page-header';
import { getLandlordRequests } from '../(components)/landlord-queries';
import { RequestDecision } from '../(components)/bookings/request-decision';
import { HoldCountdown } from '../(components)/bookings/hold-countdown';
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
                    <Badge className="bg-lime/15 text-accent-fg">
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
                  {/* Stated either way. A blank where a date belongs reads as
                      a rendering bug; "no move-in date yet" is a fact the
                      landlord can act on by asking. */}
                  {' · '}
                  <CalendarClock className="inline size-3" />{' '}
                  {r.requestedMoveIn ? (
                    <>moving in {formatDate(r.requestedMoveIn)}</>
                  ) : (
                    <span className="italic">no move-in date agreed yet</span>
                  )}
                </p>
              </div>

              <p className="text-content text-sm font-semibold tabular-nums">
                {formatNaira(r.amount)}
              </p>

              {/* Only a request still waiting on the landlord can be decided.
                  Anything already accepted shows its status instead, so the
                  list never offers a decision the database would refuse. */}
              {r.status === 'requested' ? (
                <RequestDecision bookingId={r.id} name={r.name} />
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <Badge className="bg-amber-500/10 text-amber-600">
                    {/* The raw column value read as AWAITING_PAYMENT, which is a
                        database status and not a sentence. */}
                    {r.status === 'awaiting_payment' ? 'Accepted, waiting on payment' : r.status}
                  </Badge>
                  {r.holdEndsAt && <HoldCountdown endsAt={r.holdEndsAt} />}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-content-muted text-xs">
        Accepting holds the room for that student for 24 hours while they pay. It does not charge
        them, and nothing reaches your wallet until they do. If they don&rsquo;t pay in time the room
        goes back on the market on its own.
      </p>
    </div>
  );
}
