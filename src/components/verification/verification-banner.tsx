/**
 * VerificationBanner — Figma node 1498:51414 ("Verification Section").
 *
 * The strip that sits above a dashboard while the account is not yet verified:
 * icon, one sentence, and an underlined "Verify Now" pushed to the far end.
 *
 * PALETTE IS TRANSLATED, NOT COPIED. The design is from Norocio and hardcodes
 * that product's error ramp — #fbe9e9 ground, #e55c5c border, #dc2626 text.
 * Dropping those in literally would light a pink box on Sync's dark theme,
 * because they are a light-mode-only palette. Sync already has a semantic
 * warning colour (`--color-coral`, used by FormError), so the banner is built
 * from that at the same three weights: faint ground, visible edge, full-
 * strength text. Same reading, both themes.
 *
 * Geometry is kept: 8px radius, 12px/9px padding, 20px icon, 6px icon gap.
 *
 * ON A PHONE IT STACKS. The design is one row with the link pushed to the far
 * end, which needs roughly 500px to hold a sentence and a link without either
 * wrapping into the other. Below that the two ends stack and the link sits
 * under the message, still left-aligned with it. The icon stays on the first
 * line of the text rather than centring against a two-line paragraph.
 *
 * "VERIFY NOW" OPENS A PANEL, IT DOES NOT NAVIGATE. It used to be a Link to
 * /onboarding, which answered a prompt about the dashboard by replacing the
 * dashboard. See VerifyNowSheet for why the panel is the right shape here and
 * why the route still exists for first-run signup.
 */
'use client';

import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VerificationStatus } from '@/modules/verification/types';
import type { VendorOnboardingInput } from '@/lib/validations';
import { VerifyNowSheet } from './verify-now-sheet';

interface VerificationBannerProps {
  status: VerificationStatus;
  /** Prefill for the wizard the "Verify Now" panel opens. */
  initial: Partial<VendorOnboardingInput>;
  className?: string;
}

export function VerificationBanner({ status, initial, className }: VerificationBannerProps) {
  if (status === 'verified') return null;

  const awaitingReview = status === 'pending';

  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-start gap-2 rounded-lg border px-[9px] py-3',
        'sm:flex-row sm:items-center sm:justify-between sm:gap-3',
        // Waiting on a reviewer is not an error, and colouring it like one
        // tells someone who has done everything asked of them that something
        // is wrong. Same strip, neutral palette.
        awaitingReview ? 'border-line/15 bg-surface-deep' : 'border-coral/40 bg-coral/10',
        className,
      )}
    >
      <div className="flex items-start gap-1.5 sm:items-center">
        <AlertCircle
          className={cn(
            // mt on mobile keeps it aligned to the first line once the
            // sentence wraps; centred again once it is a single row.
            'mt-px size-5 shrink-0 sm:mt-0',
            awaitingReview ? 'text-content-muted' : 'text-coral',
          )}
          aria-hidden="true"
        />
        <p
          className={cn(
            'text-sm font-medium tracking-[0.1px]',
            awaitingReview ? 'text-content-muted' : 'text-coral',
          )}
        >
          {awaitingReview
            ? 'Your verification is under review. We will let you know as soon as it is done.'
            : 'Please ensure you verify your account to access all features.'}
        </p>
      </div>

      {/* Nothing to press while a reviewer has it — a second submission is the
          only thing this control could produce. */}
      {!awaitingReview && (
        <VerifyNowSheet initial={initial}>
          {/* A button, not a link: it opens a panel on this page rather than
              going anywhere, and a link that navigates nowhere is a promise
              the middle-click and the status bar both break. */}
          <button
            type="button"
            className="text-coral shrink-0 cursor-pointer pl-[26px] text-sm font-semibold tracking-[0.1px] underline underline-offset-2 sm:pl-0"
          >
            Verify Now
          </button>
        </VerifyNowSheet>
      )}
    </div>
  );
}
