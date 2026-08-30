/**
 * ROUTE: /legal/terms
 * ACCESS: public
 *
 * ⚠️ DRAFT - NOT LEGALLY REVIEWED.
 * Describes the marketplace model the code implements: Sync is an intermediary,
 * payment is held in escrow and released on completion, vendors are verified but
 * their listings are their own. A lawyer must review this before launch -
 * liability, refunds and dispute terms are exactly where a template goes wrong.
 *
 * TODO: confirm the refund window, the escrow release trigger, and the fee
 * schedule with whoever owns commercial terms.
 */
import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage, DocSection, DocList } from '@/components/shared/doc-page';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `The rules for using ${SITE.name}.`,
};

export default function Page() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Terms of Service"
      updated="2026-08-30"
      intro={`By using ${SITE.name} you agree to these terms. They explain what we do, what you are responsible for, and what happens when something goes wrong.`}
    >
      <DocSection title="What Sync is">
        <p>
          {SITE.name} is a marketplace operated by {SITE.legalName}. We connect students with
          hostels, food vendors, event organisers and tradespeople. We are an intermediary: we
          verify vendors and hold payment, but the room, meal or service itself is provided by the
          vendor, not by us.
        </p>
      </DocSection>

      <DocSection title="Your account">
        <DocList
          items={[
            'You must give accurate details and keep your password to yourself.',
            'One account per person. Accounts are not transferable.',
            'You are responsible for what happens under your account.',
          ]}
        />
      </DocSection>

      <DocSection title="Payments and escrow">
        <p>
          Payment is taken when you book and held in escrow. It is released to the vendor once the
          booking or order completes. If something goes wrong before then, raise a dispute and we
          will hold the funds while we look at it.
        </p>
      </DocSection>

      <DocSection title="Vendors and listings">
        <p>
          Every vendor passes an ID check, a business check and an in-person visit before they can
          list - see{' '}
          <Link href="/how-verification-works" className="text-accent-fg underline underline-offset-4">
            how verification works
          </Link>
          . Verification is not a guarantee: prices, availability and condition are set and
          described by the vendor. Always inspect a property before you pay for it.
        </p>
      </DocSection>

      <DocSection title="What you may not do">
        <DocList
          items={[
            'Post anything false, illegal, or that is not yours to post.',
            'Take a transaction off-platform to avoid fees or escrow.',
            'Scrape, overload or attempt to break the service.',
            'Harass another user or a vendor.',
          ]}
        />
        <p>We can suspend an account that does any of these.</p>
      </DocSection>

      <DocSection title="Liability">
        <p>
          We are responsible for running the platform. We are not the provider of the underlying
          room or service, and our liability is limited to the amounts paid through {SITE.name} for
          the transaction in question. Nothing here removes rights you have under Nigerian law.
        </p>
      </DocSection>

      <DocSection title="Contact">
        <p>
          Questions about these terms:{' '}
          <a href={`mailto:${SITE.support.email}`} className="text-accent-fg underline underline-offset-4">
            {SITE.support.email}
          </a>
          .
        </p>
      </DocSection>
    </DocPage>
  );
}
