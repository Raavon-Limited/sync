/**
 * The three pieces every side sheet was building by hand.
 *
 * WHAT WAS WRONG WITH DOING IT PER SHEET
 *   Eleven surfaces use <SheetContent> and each one laid itself out again. They
 *   agreed on the header and disagreed on everything after it   most made the
 *   whole panel one scrolling column, which puts the primary action at the
 *   bottom of however much content there happens to be. On a property form that
 *   is four sections down: the button that finishes the job scrolls out of
 *   reach the moment the job gets big, which is exactly when somebody wants it.
 *
 *   So the footer is pinned here, once, and the body is the only thing that
 *   scrolls. A sheet that opts out gets what it had before; a sheet that uses
 *   these gets the same shape as every other one.
 *
 * SheetContent supplies the panel, the overlay and the close button. These
 * three say what goes where inside it   nothing more.
 */
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The scrolling middle. `min-h-0` is load-bearing: a flex child defaults to
 * min-height:auto, so without it the body grows to its content and pushes the
 * footer off the bottom of the panel instead of scrolling inside it.
 */
export const SheetBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function SheetBody({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('-mx-6 min-h-0 flex-1 overflow-y-auto px-6', className)}
        {...props}
      />
    );
  },
);

/**
 * Pinned to the bottom of the panel, on the panel's own background so content
 * scrolling underneath does not show through it.
 *
 * The negative margin and matching padding are how it reaches the panel's edges
 * from inside SheetContent's p-6   a footer inset by 24px reads as a card
 * floating above the sheet rather than as the sheet's own base.
 */
export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // STACKED ON A PHONE, IN A ROW FROM sm UP.
        //
        // Every side modal is full-bleed on mobile (see sheetVariants), so the
        // footer is the full width of the screen   two buttons side by side
        // there are two half-width targets with a gap down the middle, and the
        // secondary one ends up as wide as the primary. Stacked, each is a full
        // -width target. `flex-col-reverse` puts the PRIMARY action at the top
        // of that column while leaving it last in the DOM   which is where it
        // belongs on desktop, at the right-hand end of the row. One order in the
        // markup, the right order in both layouts.
        //
        // The children are sized here rather than by each caller, so a sheet
        // cannot get this half-right.
        // The wizard's footer, which is the one this product already had:
        // -mx-6 px-6 so the border and the ground run the panel's full width,
        // shrink-0 so it never gives ground to the scrolling body, gap-3.
        'border-line/10 bg-panel -mx-6 -mb-6 flex shrink-0 flex-col-reverse gap-3 border-t px-6 py-4',
        'sm:flex-row sm:items-center',
        // Full-width targets on a full-bleed mobile panel; on desktop they take
        // their natural width and whichever button carries `sm:flex-1` fills
        // the rest, exactly as the onboarding wizard does it.
        '[&>*]:w-full sm:[&>*]:w-auto',
        className,
      )}
      {...props}
    />
  );
}

// The step indicator lives in wizard-steps.tsx   it predates this file and is
// shared with the onboarding wizard, which is the design every stepped flow
// here follows.
