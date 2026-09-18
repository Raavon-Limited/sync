/**
 * The strip a business sees at the top of its dashboard until it is verified.
 *
 * WHY IT EXISTS
 *   A newly registered business had nowhere to learn where its application had
 *   got to. The only mention of verification anywhere in the vendor dashboard
 *   was inside the "add a store" dialog, and only once they had a store and
 *   tried to open a second one   so the state of their own account was visible
 *   exclusively behind a button most of them had no reason to press. An account
 *   sitting at 'pending' looked identical to one nobody had ever looked at.
 *
 * IT SAYS THE STATE, AND WHOSE MOVE IT IS
 *   That is the whole job. 'pending' is the one people get wrong: it reads as
 *   an outstanding task when it is the opposite, so it says plainly that
 *   nothing is needed from them. An unverified account gets a button, because
 *   there the next move IS theirs.
 *
 * WHAT IT DOES NOT CLAIM
 *   Only what the database actually enforces. `guard_storefront_insert` gates
 *   the SECOND store on verification and nothing gates the first, so that is
 *   what is promised here. It deliberately does not say listings are hidden
 *   until verified   no policy in the schema does that today, and telling a
 *   vendor their menu is invisible when it is not would be worse than silence.
 *
 * NOT DISMISSIBLE, on purpose. It is the account's current state rather than an
 * announcement, and it disappears by itself the moment the account is verified.
 */
'use client';

import Link from 'next/link';
import { Clock, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import { useMyStorefront } from '@/modules/vendor/hooks';

type Tone = 'waiting' | 'action' | 'problem';

const COPY: Record<string, { tone: Tone; title: string; body: string; cta?: string }> = {
  pending: {
    tone: 'waiting',
    title: 'Your account is waiting for verification',
    body:
      'A reviewer is checking what you submitted. Nothing more is needed from you, and we will tell you as soon as there is a decision. You can set up your store and listings while you wait.',
  },
  unverified: {
    tone: 'action',
    title: 'Your business is not verified yet',
    body:
      'Verification is how students tell a real business from a name on a page. Your first store works either way, but opening a second location needs a verified account.',
    cta: 'Verify now',
  },
  rejected: {
    tone: 'problem',
    title: 'We could not verify your business',
    body:
      'A reviewer could not confirm the details you submitted. Check them and send them again, or contact support if you think this is wrong.',
    cta: 'Submit again',
  },
};

const TONE: Record<Tone, { wrap: string; badge: string; Icon: typeof Clock }> = {
  waiting: {
    wrap: 'border-line/10 bg-panel',
    badge: 'bg-ink/5 text-content-muted',
    Icon: Clock,
  },
  action: {
    wrap: 'border-lime-deep/30 bg-lime/5',
    badge: 'bg-lime/15 text-accent-fg',
    Icon: ShieldCheck,
  },
  problem: {
    wrap: 'border-coral/30 bg-coral/5',
    badge: 'bg-coral/10 text-coral',
    Icon: TriangleAlert,
  },
};

export function VerificationPanel() {
  const { data: brand, isLoading } = useMyStorefront();

  // Nothing while it loads, for an account with no business row yet (a manager,
  // or a wizard that has not been started), or once they are verified.
  if (isLoading || !brand) return null;

  const copy = COPY[brand.verificationStatus ?? 'unverified'];
  if (!copy) return null;

  const { wrap, badge, Icon } = TONE[copy.tone];

  return (
    <section
      // `status` rather than `alert`: it is standing information, and an alert
      // interrupts a screen reader mid-sentence on every page load.
      role="status"
      className={`mb-4 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start ${wrap}`}
    >
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${badge}`}>
        <Icon className="size-4" aria-hidden="true" />
      </span>

      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-content text-sm font-medium">{copy.title}</p>
        <p className="text-content-muted max-w-2xl text-sm leading-relaxed">{copy.body}</p>
      </div>

      {copy.cta && (
        <Button asChild size="sm" className="shrink-0 sm:ml-auto">
          <Link href="/onboarding">{copy.cta}</Link>
        </Button>
      )}
    </section>
  );
}
