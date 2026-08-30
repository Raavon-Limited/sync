/**
 * BrandLoader - full-viewport loader on the dark (ink) brand surface.
 *
 * This is a LAYOUT SHELL, not a loader of its own. The motion is the kit's
 * <SyncBootLoader>; all this adds is the ink surface, centring and an optional
 * label. The kit allows three loaders and no fourth, so nothing here animates.
 *
 * For inline loading inside buttons or compact UI use <SyncSpinner> from
 * components/brand instead - that is the kit's in-place state.
 */
import { SyncBootLoader } from '@/components/brand/SyncLoaders';
import { cn } from '@/lib/utils';

interface BrandLoaderProps {
  /** Optional subline - context like 'Signing you in…'. */
  label?: string;
  /** Render inside a parent rather than full screen. */
  inline?: boolean;
  className?: string;
}

export function BrandLoader({ label, inline, className }: BrandLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'bg-ink text-cream flex flex-col items-center justify-center gap-8',
        // min-h-dvh, not min-h-screen. 100vh on iOS Safari is the height with
        // the toolbars HIDDEN, so the centring box is taller than what you can
        // see and the loader sits visibly below centre. dvh tracks the visible
        // viewport, which is what "centred" has to mean on a phone.
        inline ? 'h-full w-full py-16' : 'min-h-dvh w-full',
        className,
      )}
    >
      {/* label="" so the tile is decorative here - the wrapper already carries
          the live region, and two announcements read as two loaders. */}
      <SyncBootLoader size={inline ? 96 : 132} label="" />

      {label && <span className="text-cream/60 text-sm">{label}</span>}
      <span className="sr-only">Loading{label ? `: ${label}` : ''}</span>
    </div>
  );
}
