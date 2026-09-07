/**
 * SyncLogo - the app-side lockup: the kit's mark plus the Sync wordmark.
 *
 * Why this exists instead of the kit's own `SyncLockup`: that component hard-codes
 * `font-family: "Bricolage Grotesque"` inline, but this app loads Bricolage through
 * `next/font`, which exposes it under a hashed family name behind `--font-display`.
 * The literal name never matches, so the kit lockup silently falls back to system-ui.
 * Here the wordmark is a plain element with the repo's `font-display` class, and the
 * mark is the kit's `SyncMark` untouched - the kit files stay a straight copy.
 *
 * Colour follows `currentColor` by default, so the lockup inverts with whatever
 * surface it sits on (ink footer, cream header, dark sidebar). Only the lime half
 * is fixed, per the kit: never recolour outside Cream, Ink and Electric Lime.
 */
import { cn } from '@/lib/utils';
import SyncMark from './SyncMark';

/** Wordmark size (px) -> the mark scales off it, matching the kit's 1.18 ratio. */
export interface SyncLogoProps {
  /** Wordmark cap height in px. Defaults to 20 (the header size). */
  height?: number;
  /** Hide the wordmark and render the mark alone (tight spots, app icons). */
  markOnly?: boolean;
  /** Optional role tag - "Student", "Landlord". Turns this into a dashboard logo. */
  role?: string;
  className?: string;
}

export function SyncLogo({ height = 20, markOnly = false, role, className }: SyncLogoProps) {
  return (
    <span
      className={cn('inline-flex items-center', className)}
      style={{ gap: height * 0.32 }}
    >
      <SyncMark size={height * 1.18} counter="currentColor" />
      {!markOnly && (
        <span
          className="font-display leading-none"
          style={{ fontSize: height * 1.4, letterSpacing: '-0.03em' }}
        >
          Sync
        </span>
      )}
      {role && (
        <>
          <span
            aria-hidden="true"
            className="bg-lime rounded-full"
            style={{ width: 2, height: height * 0.95, marginLeft: height * 0.14 }}
          />
          <span
            className="font-mono uppercase opacity-75"
            style={{
              fontSize: height * 0.42,
              letterSpacing: '0.11em',
              marginLeft: height * 0.14,
            }}
          >
            {role}
          </span>
        </>
      )}
    </span>
  );
}
