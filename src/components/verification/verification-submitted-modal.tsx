/**
 * VerificationSubmittedModal   Figma node 902:17772 ("success-modal").
 *
 * Shown the moment onboarding is submitted: filled tick, "Verification
 * Submitted", the 1–2 working days expectation, and a full-width Continue.
 *
 * WHY IT IS NOT DISMISSIBLE BY THE USUAL MEANS. The design has no close X and
 * one button, and that is right: this modal is the only thing that tells you
 * what happens next. Escaping it to a dashboard that is entirely empty states
 *   which is exactly what an unverified account now renders   leaves someone
 * looking at a blank product with no explanation. Continue is the way out.
 *
 * RESPONSIVE. The design is a fixed card; on a phone it has to inset from the
 * screen edge rather than run to it, and survive a short landscape viewport.
 * Hence the width calc, the scroll cap, and one step down on the tick and the
 * gaps below 640px - all at explicit sizes, never `auto`.
 *
 * TRANSLATED, NOT COPIED. Norocio's `--primary/4` is #650000 maroon; Sync's
 * primary is the lime `Button`, so the CTA is the project's own. The tick is
 * lucide's filled CheckCircle2 rather than the exported Vuesax bulk asset  
 * the glyph is the same circle-and-tick, and every other icon in this app is
 * lucide. Sizes are kept from the design: 57px tick, 24px arrow, 32px/20px/
 * 12px stack gaps, 16px radius, 20px padding.
 */
'use client';

import { ArrowRight, CheckCircle2 } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button, Dialog } from '@/components/ui';
import { cn } from '@/lib/utils';

interface VerificationSubmittedModalProps {
  open: boolean;
  /** Fired by Continue. Route them onward here. */
  onContinue: () => void;
  /** Product name in the body copy. */
  productName?: string;
  className?: string;
}

export function VerificationSubmittedModal({
  open,
  onContinue,
  productName = 'Sync',
  className,
}: VerificationSubmittedModalProps) {
  return (
    <Dialog open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bg-ink/50 data-[state=open]:animate-in fixed inset-0 z-50 backdrop-blur-sm" />
        <DialogPrimitive.Content
          // No onEscapeKeyDown / onPointerDownOutside handlers, and no close
          // button: the single Continue is deliberate. See the header.
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className={cn(
            'bg-panel text-content shadow-pop fixed top-1/2 left-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl',
            // Inset from the edges on a phone, capped at the designed width.
            'w-[calc(100vw-2rem)] max-w-sm',
            // A short landscape viewport scrolls the card instead of clipping
            // the button off the bottom of the screen.
            'max-h-[90dvh] overflow-y-auto',
            'gap-6 p-5 sm:gap-8',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            className,
          )}
        >
          <div className="flex w-full flex-col items-center gap-4 sm:gap-5">
            <CheckCircle2
              className="text-accent-fg size-12 shrink-0 sm:size-[57px]"
              strokeWidth={1.5}
              aria-hidden="true"
            />

            <div className="flex w-full flex-col items-center gap-3 text-center">
              <DialogPrimitive.Title className="font-display text-content text-lg leading-[26px] font-semibold tracking-[-0.2px] sm:text-xl sm:leading-[30px]">
                Verification Submitted
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-content-muted text-sm leading-[21px] tracking-[0.1px]">
                Your verification is under review, this usually takes about 1 – 2 business working
                days. We&rsquo;ll notify you once verification is complete so you can enjoy full
                access to {productName}.
              </DialogPrimitive.Description>
            </div>
          </div>

          <Button onClick={onContinue} className="flex w-full items-center justify-center gap-2">
            Continue
            <ArrowRight className="size-5 shrink-0 sm:size-6" aria-hidden="true" />
          </Button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
