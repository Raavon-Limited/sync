/**
 * ROUTE: /how-it-works
 * ACCESS: public
 * PURPOSE: The three flows - find, book, pay via escrow - plus what happens
 *          when something goes wrong. Verification has its own page.
 */
import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage, DocSection, DocList } from '@/components/shared/doc-page';
import { Button } from '@/components/ui/button';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'How it works',
  description: `Find it, book it, pay safely - how ${SITE.name} works end to end.`,
};

export default function Page() {
  return (
    <DocPage
      eyebrow="Getting started"
      title="How it works"
      updated="2026-08-30"
      intro="Find a room, a meal or a fixer, book it, and pay into escrow. Your money only moves when the thing you paid for actually happens."
    >
      <DocSection title="1. Find it">
        <p>
          Set your area - or share your location - and every listing narrows to what is actually
          near you. Hostels, food, events, beauty, trades and laundry all sit behind the same
          filter, so &ldquo;near me&rdquo; means the same thing everywhere in the app.
        </p>
      </DocSection>

      <DocSection title="2. Check it">
        <p>
          Every vendor has been through an ID check, a business check and an in-person visit before
          they can list. That is what the verified badge means -{' '}
          <Link href="/how-verification-works" className="text-accent-fg underline underline-offset-4">
            here is the full process
          </Link>
          . For a hostel you can also book an inspection before committing.
        </p>
      </DocSection>

      <DocSection title="3. Pay into escrow">
        <p>
          Your payment goes to our licensed third-party escrow partner, not to the vendor and not
          to {SITE.name}. The partner holds it until the booking or order completes, then pays the
          vendor and passes {SITE.name} its fee. The vendor knows the money is real, and you know it
          has not gone anywhere for something that has not happened yet.
        </p>
      </DocSection>

      <DocSection title="4. If something goes wrong">
        <DocList
          items={[
            'Raise a dispute from the booking or order. The funds stay with the escrow partner while we look.',
            'We read both sides, ask for evidence, and decide - refund, partial refund, or release.',
            'Vendors who repeatedly get it wrong lose their verification.',
          ]}
        />
      </DocSection>

      <DocSection title="What it costs">
        <p>
          Browsing and booking are free for students. Vendors pay a fee on completed transactions,
          which is what funds verification. Any fee is shown before you pay.
        </p>
      </DocSection>

      <DocSection title="Ready?">
        <div className="flex flex-wrap gap-3 pt-1">
          <Button asChild size="md">
            <Link href="/around">Start with Around you</Link>
          </Button>
          <Button asChild size="md" variant="outline">
            <Link href="/signup?role=vendor&category=landlord">List a property</Link>
          </Button>
        </div>
      </DocSection>
    </DocPage>
  );
}
