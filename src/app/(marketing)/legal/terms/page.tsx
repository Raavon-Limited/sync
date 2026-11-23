/**
 * ROUTE: /legal/terms
 * ACCESS: public
 *
 * ⚠️ DRAFT - NOT LEGALLY REVIEWED.
 * Describes the marketplace model: Sync is an intermediary that does NOT hold
 * student funds. Where escrow applies it is run by a licensed third-party
 * escrow partner, which releases the vendor's payment and Sync's fee on
 * completion (founder decision, Nov 2026). Vendors are verified but their
 * listings are their own. A lawyer must review this before launch -
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
          verify vendors and show you what is around you, but the room, meal or service itself is
          provided by the vendor, not by us. {SITE.name} does not hold student funds.
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
          {SITE.name} does not hold your money. Where you pay through {SITE.name}, the payment is
          held by our licensed third-party escrow partner, not by us. The partner releases the
          vendor&rsquo;s payment, and {SITE.name}&rsquo;s fee, once the booking or order completes.
          Any {SITE.name} fee is shown before you pay. If something goes wrong before completion,
          raise a dispute: the funds stay with the escrow partner while we look at it.
        </p>
      </DocSection>

      <DocSection title="Staying safe">
        <p>
          Only trade with verified vendors. Meet only people you trust or have business with, in a
          public place, and never follow anyone to a place not agreed in the app. {SITE.name} can
          only see what is agreed in the app, not conversations held in person or by phone. Report
          any issue immediately, with evidence where you safely can; we will follow up and report
          to the nearest help. See{' '}
          <Link href="/legal/safety" className="underline underline-offset-4">
            Safety on Sync
          </Link>
          .
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
