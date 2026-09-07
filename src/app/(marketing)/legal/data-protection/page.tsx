/**
 * ROUTE: /legal/data-protection
 * ACCESS: public
 *
 * ⚠️ DRAFT - NOT LEGALLY REVIEWED.
 * Sits alongside the Privacy Policy: privacy explains WHAT we collect, this
 * explains HOW it is protected and what a breach process looks like. Written
 * against the Nigeria Data Protection Act 2023.
 *
 * TODO: name the DPO, and confirm the breach-notification window with counsel
 * (the NDPA timeline is what should drive the number quoted here).
 */
import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage, DocSection, DocList } from '@/components/shared/doc-page';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Data Protection',
  description: `How ${SITE.name} secures personal data and handles requests and incidents.`,
};

export default function Page() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Data Protection"
      updated="2026-08-30"
      intro={`How ${SITE.legalName} secures the data it holds, and what to do if you want it changed, exported or deleted.`}
    >
      <DocSection title="How we secure it">
        <DocList
          items={[
            'Every request runs over HTTPS, and the app sets a strict Content Security Policy.',
            'Access to a row in our database is decided by row-level security, not by application code - so a bug in a page cannot expose another user\u2019s data.',
            'Passwords are hashed by our authentication provider. Nobody at Sync can read yours.',
            'Card details never touch our servers - our payment processor handles them directly.',
            'Identity documents are stored in restricted buckets, readable only by the verification team.',
          ]}
        />
      </DocSection>

      <DocSection title="Where it lives">
        <p>
          Our database and file storage are hosted by Supabase, and the application by Vercel. Some
          processors store data outside Nigeria; where they do, we rely on their contractual data
          protection terms.
        </p>
      </DocSection>

      <DocSection title="How long we keep it">
        <p>
          Account data for as long as your account is open. When you delete an account we archive it
          and purge it after 60 days, except transaction and verification records, which we keep
          where the law requires. Logs are kept for a short operational window and then discarded.
        </p>
      </DocSection>

      <DocSection title="Making a request">
        <p>
          To access, correct, export or delete your data, email{' '}
          <a href={`mailto:${SITE.support.email}`} className="text-accent-fg underline underline-offset-4">
            {SITE.support.email}
          </a>{' '}
          from the address on your account. We respond within 30 days. If you are not satisfied you
          can complain to the Nigeria Data Protection Commission.
        </p>
      </DocSection>

      <DocSection title="If something goes wrong">
        <p>
          If a breach affects your data we will investigate immediately, notify the regulator as
          required, and tell you directly what happened, what was affected and what to do about it.
          We would rather tell you early than tell you neatly.
        </p>
      </DocSection>

      <DocSection title="Related">
        <p>
          See the{' '}
          <Link href="/legal/privacy" className="text-accent-fg underline underline-offset-4">
            Privacy Policy
          </Link>{' '}
          for what we collect and why, and the{' '}
          <Link href="/legal/cookies" className="text-accent-fg underline underline-offset-4">
            Cookie Policy
          </Link>{' '}
          for what we store in your browser.
        </p>
      </DocSection>
    </DocPage>
  );
}
