/**
 * ROUTE: /organiser/events/new
 * ACCESS: role=event_manager (proxy), and verified before the form appears.
 * PURPOSE: List an event.
 *
 * THE FORM IS NOT RENDERED AT ALL UNTIL THEY ARE VERIFIED
 *   Disabling it would be worse. Somebody would fill in a name, a venue, a date
 *   and a description, press the button, and lose all of it to a refusal they
 *   could have been told about before they started.
 *
 *   This is NOT the enforcement. `events_insert_own` checks the role in the
 *   database, so a request that never loaded this page still cannot list
 *   anything. This is the courtesy layer that stops somebody wasting five
 *   minutes.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDashboardProfile } from '@/components/layouts/dashboard-profile';
import { EventForm } from '../../(components)/event-form';

export const metadata: Metadata = { title: 'List an event' };

export default async function Page() {
  const profile = await getDashboardProfile('organiser');
  const verified = profile.verificationStatus === 'verified';
  const pending = profile.verificationStatus === 'pending';

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <p className="text-content-muted font-mono text-sm tracking-wide">YOUR EVENTS</p>
        <h1 className="font-display mt-1 text-3xl">
          List an <span className="text-lime-deep">event.</span>
        </h1>
      </div>

      {verified ? (
        <EventForm />
      ) : (
        <div
          className={
            pending
              ? 'border-line/15 bg-panel flex flex-col gap-3 rounded-xl border p-4'
              : 'border-coral/30 bg-coral/5 flex flex-col gap-3 rounded-xl border p-4'
          }
        >
          <p className="text-content flex items-center gap-2 text-sm font-medium">
            {pending ? (
              <Clock className="text-content-muted size-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="text-coral size-4 shrink-0" aria-hidden="true" />
            )}
            {pending ? 'Your documents are being reviewed' : 'Get verified first'}
          </p>
          <p className="text-content-muted text-sm">
            {pending
              ? 'Listing opens as soon as somebody has looked at them. Nothing more is needed from you.'
              : 'Students hand you money for something that has not happened yet, so Sync checks who you are before an event can go public.'}
          </p>
          {!pending && (
            <Button asChild className="w-fit">
              <Link href="/me/verify">Get verified</Link>
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
