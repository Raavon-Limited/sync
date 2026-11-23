/**
 * ROUTE: /how-verification-works
 * ACCESS: public
 * PURPOSE: Explains the vendor/landlord verification pipeline that the badge
 *          on a listing actually represents - ID check, business proof, and an
 *          in-person visit by an ambassador.
 *
 * Mirrors the real flow in the codebase: profiles.verification_status, the
 * verification_visits table, and the admin KYC queue.
 */
import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage, DocSection, DocList } from '@/components/shared/doc-page';
import { Button } from '@/components/ui/button';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'How verification works',
  description: `What the verified badge on a ${SITE.name} listing actually means.`,
};

export default function Page() {
  return (
    <DocPage
      eyebrow="Trust"
      title="How verification works"
      updated="2026-08-30"
      intro="A verified badge is not a formality. Here is exactly what a vendor goes through before one appears on their listing."
    >
      <DocSection title="1. Identity check">
        <p>
          Every vendor and landlord submits a government ID, which is checked against the issuing
          record by our verification provider. A name that does not match the document does not
          proceed.
        </p>
      </DocSection>

      <DocSection title="2. Business proof">
        <p>
          For a hostel that means proof of ownership or a management agreement. For food and trades
          it means the business registration or the equivalent. This is what stops someone listing a
          building they have no right to let.
        </p>
      </DocSection>

      <DocSection title="3. An in-person visit">
        <p>
          A Sync ambassador visits the property, photographs it, and records what is actually there
          against what was listed - rooms, water, power, distance to campus. The visit is logged
          with the date and the ambassador who made it.
        </p>
      </DocSection>

      <DocSection title="4. Review">
        <p>
          Our team reviews all three together and either approves the vendor, asks for more, or
          rejects them. Only then can they publish.
        </p>
      </DocSection>

      <DocSection title="What it does not mean">
        <p>
          Verification confirms the vendor and the property are real, and that someone from Sync has
          stood in it. It is not a guarantee of condition, price or availability - those are set by
          the vendor and can change. Always inspect before you pay.
        </p>
        <DocList
          items={[
            'Where you pay through Sync, a licensed escrow partner holds the payment until you confirm, so a listing that turns out wrong does not cost you the money.',
            'If something is not as described, raise a dispute and the funds stay with the escrow partner while we look.',
          ]}
        />
      </DocSection>

      <DocSection title="Listing something yourself?">
        <p>Start the process and we will walk you through each step.</p>
        <div className="pt-1">
          <Button asChild size="md">
            <Link href="/signup?role=vendor&category=landlord">List a property</Link>
          </Button>
        </div>
      </DocSection>
    </DocPage>
  );
}
