/**
 * ROUTE: /legal/safety
 * ACCESS: public
 * PURPOSE: Safety on Sync - how to buy, sell and meet safely.
 *
 * The founder's safety notice (Nov 2026), set out as a page so it can be
 * linked from the footer, the Policies menu and anywhere a trade happens.
 * The key honesty point is the last section: Sync only sees what happens in
 * the app. A promise to "keep you safe" off-platform would be untrue.
 *
 * ⚠️ DRAFT - NOT LEGALLY REVIEWED, like the other legal pages.
 */
import type { Metadata } from 'next';

import { DocPage, DocSection, DocList } from '@/components/shared/doc-page';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Safety on Sync',
  description: `How to buy, sell and meet safely on ${SITE.name}.`,
};

export default function Page() {
  return (
    <DocPage
      eyebrow="Policies"
      title="Safety on Sync"
      updated="2026-11-23"
      intro={`Whether you are buying or selling, a few habits keep you safe. ${SITE.name} checks vendors, but you are the one who meets them.`}
    >
      <DocSection title="Trade with verified vendors">
        <p>
          Before you pay or meet anyone, make sure the vendor carries the Verified badge. It means{' '}
          {SITE.name} has checked them. Listings without the badge have not been checked yet.
        </p>
      </DocSection>

      <DocSection title="Meeting up">
        <DocList
          items={[
            'Do not meet people you do not trust or have no business with.',
            'Meet in a public place.',
            'Do not follow anyone to a place you did not agree to in the app.',
            'Tell a friend where you are going and who you are meeting.',
          ]}
        />
      </DocSection>

      <DocSection title="Keep it in the app">
        <p>
          {SITE.name} can only see what is agreed in the app: the chat, the booking, the place and
          the time. We cannot see or confirm anything agreed by phone call or in person. Keep the
          details of a deal in the app so there is a record if something goes wrong.
        </p>
      </DocSection>

      <DocSection title="If something goes wrong">
        <DocList
          items={[
            'Report it to us immediately, from the booking, the order or the chat.',
            'Get evidence where you safely can: screenshots, receipts, photos, names.',
            'We will follow up immediately and report to the nearest help.',
            'If you are in danger, get to safety first and contact the police or campus security.',
          ]}
        />
        <p>
          Email{' '}
          <a href={`mailto:${SITE.support.help}`} className="underline underline-offset-4">
            {SITE.support.help}
          </a>{' '}
          to report an issue.
        </p>
      </DocSection>
    </DocPage>
  );
}
