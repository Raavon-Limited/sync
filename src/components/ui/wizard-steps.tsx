/**
 * The step indicator, as this product has always drawn it.
 *
 * LIFTED OUT OF OnboardingWizard, NOT INVENTED
 *   That wizard has drawn steps the same way since it was written: numbered
 *   circles, a tick once a step is behind you, the label beside the current one
 *   and hidden on a phone where five labels do not fit. It was the only stepped
 *   flow in the product, so the markup lived inline   and the second stepped
 *   flow (adding a property) started by drawing something else, which is how a
 *   product ends up with two ideas of what "step 2 of 4" looks like.
 *
 *   This is that markup, moved, and the wizard now renders it too. If the
 *   design changes it changes in one place, which is the only reason to have
 *   extracted it.
 *
 * `shrink-0` IS THE CALLER'S JOB   pass it in a panel. Losing "which of five
 * steps am I on" is the first thing a scrolling wizard costs you, so in a sheet
 * the indicator must not scroll away with the fields.
 */
'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function WizardSteps({
  steps,
  current,
  className,
}: {
  steps: readonly string[];
  /** Zero-based. Everything before it is done, everything after is to come. */
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn('flex items-center', className)}>
      {steps.map((label, i) => (
        <li key={label} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                i < current
                  ? 'bg-ink text-white'
                  : i === current
                    ? 'bg-lime text-ink'
                    : 'bg-ink/10 text-content-muted',
              )}
            >
              {i < current ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={cn(
                'hidden text-xs sm:inline',
                i === current ? 'text-content font-medium' : 'text-content-muted',
              )}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && <span className="bg-line/15 mx-2 h-px flex-1" />}
        </li>
      ))}
    </ol>
  );
}
