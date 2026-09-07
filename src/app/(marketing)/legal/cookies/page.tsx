/**
 * ROUTE: /legal/cookies
 * ACCESS: public
 *
 * ⚠️ DRAFT - NOT LEGALLY REVIEWED.
 * The table below reflects what the app actually sets today: Supabase auth
 * cookies, the theme preference, and the area chosen in the location picker.
 * If analytics or advertising cookies are ever added, this page and a consent
 * banner both become mandatory rather than optional.
 */
import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage, DocSection, DocList } from '@/components/shared/doc-page';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: `The cookies ${SITE.name} sets, and what each one is for.`,
};

export default function Page() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Cookie Policy"
      updated="2026-08-30"
      intro="The short version: we use cookies to keep you signed in and to remember two preferences. We do not use advertising cookies."
    >
      <DocSection title="What we set">
        <DocList
          items={[
            <><strong className="text-content">Authentication</strong> - set by Supabase when you sign in, so you stay signed in between visits. Removing it signs you out.</>,
            <><strong className="text-content">Theme</strong> - remembers whether you chose light or dark, so the app does not flash the wrong one on load.</>,
            <><strong className="text-content">Location scope</strong> - remembers the area you picked, so every page stays filtered to it.</>,
          ]}
        />
      </DocSection>

      <DocSection title="What we do not set">
        <p>
          No advertising cookies, no cross-site trackers, and no third-party analytics that follow
          you off {SITE.name}. If that changes we will ask for your consent first.
        </p>
      </DocSection>

      <DocSection title="Managing them">
        <p>
          You can clear or block cookies in your browser settings. Blocking the authentication
          cookie will stop you signing in - the rest are safe to clear, you will just be asked for
          your theme and area again.
        </p>
      </DocSection>

      <DocSection title="More">
        <p>
          For everything else we hold, see the{' '}
          <Link href="/legal/privacy" className="text-accent-fg underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </DocSection>
    </DocPage>
  );
}
