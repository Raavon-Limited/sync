/**
 * ROUTE: /organiser
 * ACCESS: role=event_manager, enforced by the proxy.
 * PURPOSE: The state of the whole account in one screen - can they sell yet,
 *          what is coming up, what is owed, what has been paid.
 *
 * THE VERIFICATION STATE IS THE FIRST THING, AND IT IS NOT DECORATION
 *   An unverified organiser cannot list an event: `events_insert_own` requires
 *   the role and the review queue is what stands behind it. Somebody in that
 *   state needs one instruction, not a dashboard of empty tiles, so the panel
 *   at the top is the whole screen's answer until they are through.
 *
 * MONEY IS SHOWN AS HELD AND PAID, NEVER AS "EARNED"
 *   Ticket money sits in escrow until 24h after the event. An organiser who
 *   reads a single "earnings" figure and plans around it is reading money that
 *   is not theirs yet - and the number that IS theirs is smaller, because the
 *   Sync charge comes off at release.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, CalendarPlus, CheckCircle2, Clock, Ticket, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDashboardProfile } from '@/components/layouts/dashboard-profile';
import { getMyEvents, getEventPayout } from '@/modules/events/organiser-queries';
import { formatKobo } from '@/lib/utils/format';
import { VerifySheet } from '@/components/verification/verify-sheet';
import { ListEventSheet } from './(components)/list-event-sheet';

export const metadata: Metadata = { title: 'Overview' };

export default async function Page() {
  const profile = await getDashboardProfile('organiser');
  const events = await getMyEvents();

  // One payout read per event. An organiser has a handful, not a feed, so this
  // stays a few queries rather than a join nobody can read later.
  const payouts = await Promise.all(events.map((e) => getEventPayout(e.id)));

  const held = payouts.reduce((sum, p) => sum + p.heldKobo, 0);
  const paid = payouts.reduce((sum, p) => sum + p.paidKobo, 0);
  const disputed = payouts.some((p) => p.disputed);

  const upcoming = events.filter((e) => e.upcoming);
  const sold = events.reduce((sum, e) => sum + e.ticketsSold, 0);

  const verified = profile.verificationStatus === 'verified';
  const pending = profile.verificationStatus === 'pending';

  return (
    <section className="flex flex-col gap-6">
      <div>
        <p className="text-content-muted font-mono text-sm tracking-wide">ORGANISER</p>
        <h1 className="font-display mt-1 text-3xl">
          Hi <span className="text-lime-deep">{profile.name}</span> - here&apos;s the state of play.
        </h1>
      </div>

      {/* Until they are verified this is the only thing worth doing, so it is
          the only thing offered. */}
      {!verified && (
        <div
          className={
            pending
              ? 'border-line/15 bg-panel flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4'
              : 'border-coral/30 bg-coral/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4'
          }
        >
          <p className="text-content flex items-center gap-2 text-sm font-medium">
            {pending ? (
              <Clock className="text-content-muted size-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="text-coral size-4 shrink-0" aria-hidden="true" />
            )}
            {pending ? 'Your documents are with a reviewer' : 'Get verified to sell'}
          </p>
          {!pending && (
            <VerifySheet role="event_manager" status={profile.verificationStatus}>
              <Button size="lg" className="w-fit shrink-0">
                Get verified
              </Button>
            </VerifySheet>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          icon={<CalendarPlus className="size-4" aria-hidden="true" />}
          label="Upcoming"
          value={String(upcoming.length)}
          note={events.length === 0 ? 'nothing listed yet' : `${events.length} listed in total`}
        />
        <Stat
          icon={<Ticket className="size-4" aria-hidden="true" />}
          label="Tickets sold"
          value={String(sold)}
          note={sold === 0 ? 'no sales yet' : 'across every event'}
        />
        <Stat
          icon={<Wallet className="size-4" aria-hidden="true" />}
          label="Held for you"
          value={formatKobo(held)}
          note={
            disputed
              ? 'a dispute is holding some of this'
              : held === 0
                ? 'releases after each event'
                : `${formatKobo(paid)} already paid out`
          }
        />
      </div>

      <div className="flex flex-wrap gap-3">
        {verified ? (
          <ListEventSheet>
            <Button size="lg">
              <CalendarPlus aria-hidden="true" />
              List an event
            </Button>
          </ListEventSheet>
        ) : (
          <VerifySheet role="event_manager" status={profile.verificationStatus}>
            <Button size="lg">
              <CalendarPlus aria-hidden="true" />
              List an event
            </Button>
          </VerifySheet>
        )}
        <Button asChild variant="outline" size="lg">
          <Link href="/organiser/events">Your events</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/organiser/wallet">Wallet</Link>
        </Button>
      </div>

      {verified && events.length === 0 && (
        <div className="border-line/10 rounded-xl border border-dashed p-10 text-center">
          <p className="text-content flex items-center justify-center gap-2 text-sm font-medium">
            <CheckCircle2 className="text-lime-deep size-4" aria-hidden="true" />
            You are verified and ready to sell
          </p>
          <p className="text-content-muted mx-auto mt-2 max-w-prose text-sm">
            List your first event with a name, a time and a venue. It appears on /events straight
            away; ticket tiers come afterwards, or leave it free.
          </p>
        </div>
      )}

      {events.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-content text-sm font-medium">Next up</h2>
            <Link href="/organiser/events" className="text-content-muted text-xs underline">
              All events
            </Link>
          </div>
          <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
            {(upcoming.length > 0 ? upcoming : events).slice(0, 3).map((e) => (
              <Link
                key={e.id}
                href={`/organiser/events/${e.id}`}
                className="hover:bg-ink/5 flex flex-wrap items-center gap-3 px-4 py-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-content text-sm font-medium">{e.name}</p>
                  <p className="text-content-muted text-xs">
                    {new Date(e.startsAt).toLocaleString('en-NG', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {e.venue ? ` · ${e.venue}` : ''}
                  </p>
                </div>
                <p className="text-content-muted shrink-0 text-xs">
                  {e.ticketsSold === 0 ? 'no tickets sold' : `${e.ticketsSold} sold`}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="border-line/10 bg-panel flex flex-col gap-1 rounded-xl border p-4">
      <p className="text-content-muted flex items-center gap-1.5 font-mono text-[11px] tracking-wide uppercase">
        {icon}
        {label}
      </p>
      <p className="font-display text-content text-2xl">{value}</p>
      <p className="text-content-muted text-xs">{note}</p>
    </div>
  );
}
