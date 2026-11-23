/**
 * ROUTE: /legal/privacy
 * ACCESS: public
 *
 * ⚠️ DRAFT - NOT LEGALLY REVIEWED.
 * This describes what the codebase actually does today (Supabase auth, Paystack
 * payments, Smile ID / Dojah identity checks, Google Maps, Upstash rate
 * limiting, Resend email). It is an honest starting point, not advice, and it
 * must be reviewed by a lawyer against the NDPA 2023 before launch.
 *
 * TODO before publishing:
 *   - name the Data Protection Officer and a real contact address
 *   - confirm retention periods with whoever owns the data policy
 *   - confirm the final list of sub-processors and where each stores data
 */
import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage, DocSection, DocList } from '@/components/shared/doc-page';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${SITE.name} collects, uses and protects your personal data.`,
};

export default function Page() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Privacy Policy"
      updated="2026-08-30"
      intro={`How ${SITE.legalName} collects, uses and protects your personal data when you use ${SITE.name}.`}
    >
      <DocSection title="Who we are">
        <p>
          {SITE.name} is operated by {SITE.legalName}. For anything in this policy, contact us at{' '}
          <a href={`mailto:${SITE.support.email}`} className="text-accent-fg underline underline-offset-4">
            {SITE.support.email}
          </a>
          .
        </p>
      </DocSection>

      <DocSection title="What we collect">
        <DocList
          items={[
            <><strong className="text-content">Account details</strong> - name, email, phone number and password, so you can sign in and we can reach you about a booking or order.</>,
            <><strong className="text-content">Identity verification</strong> - for vendors and landlords, government ID and business documents. We use these to verify you are who you say you are before you can list.</>,
            <><strong className="text-content">Transactions</strong> - bookings, orders, payments and payouts. Card details are handled by our payment processor and never reach our servers.</>,
            <><strong className="text-content">Location</strong> - only when you tap &ldquo;Use my location&rdquo;. We round your coordinates before sending them anywhere, and we do not track you in the background.</>,
            <><strong className="text-content">Usage</strong> - pages viewed and actions taken, so we can fix what is broken and see what is used.</>,
          ]}
        />
      </DocSection>

      <DocSection title="Why we use it">
        <p>
          To run the marketplace: create your account, show listings near you, take payment, hold it
          in escrow until a booking completes, verify vendors, resolve disputes, and meet our legal
          obligations. We do not sell your personal data.
        </p>
      </DocSection>

      <DocSection title="Who we share it with">
        <p>
          Only the processors we need to operate, each handling data on our instructions:
        </p>
        <DocList
          items={[
            'Supabase - authentication, database and file storage.',
            'Our licensed payment provider - processing payments you choose to make on Sync.',
            'Our identity verification provider - vendor and landlord ID checks.',
            'Google Maps - map rendering. Your precise location is never sent to us in full.',
            'Resend - transactional email such as sign-in links and receipts.',
            'Vercel - application hosting and logs.',
          ]}
        />
        <p>
          We also share what is necessary to complete a transaction: a vendor sees the delivery
          details for an order you place with them, and nothing more.
        </p>
      </DocSection>

      <DocSection title="Your rights">
        <p>
          Under the Nigeria Data Protection Act you can ask us to show you the data we hold, correct
          it, delete it, or stop using it for a particular purpose. Email{' '}
          <a href={`mailto:${SITE.support.email}`} className="text-accent-fg underline underline-offset-4">
            {SITE.support.email}
          </a>{' '}
          and we will respond within 30 days.
        </p>
        <p>
          Deleting your account archives it rather than wiping it immediately - we keep transaction
          records where the law requires it, and purge the rest.
        </p>
      </DocSection>

      <DocSection title="Cookies">
        <p>
          We use a small number of cookies, mostly to keep you signed in. See the{' '}
          <Link href="/legal/cookies" className="text-accent-fg underline underline-offset-4">
            Cookie Policy
          </Link>{' '}
          for the full list.
        </p>
      </DocSection>

      <DocSection title="Changes">
        <p>
          If we change this policy we will update the date above and, for anything significant, tell
          you in the app or by email.
        </p>
      </DocSection>
    </DocPage>
  );
}
