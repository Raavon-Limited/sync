/**
 * PasswordRequirements - the rules, ticking themselves off as you type.
 *
 * Driven by PASSWORD_RULES, the same array the zod schema is built from, so the
 * checklist can never tick a rule the server then rejects. If a rule changes,
 * it changes in one place.
 *
 * WHY A LIST RATHER THAN AN ERROR MESSAGE. A validation error tells you the one
 * rule you broke, after you have finished typing and pressed a button. This
 * shows all four up front and resolves them live, which is the difference
 * between guessing a password the form will accept and composing one.
 *
 * ACCESSIBILITY: the list is a live region, so a screen reader announces a rule
 * being satisfied instead of the state changing silently. `aria-label` on each
 * row carries the met/unmet state, because the tick is a decorative icon.
 */
'use client';

import { Check, Circle } from 'lucide-react';
import { PASSWORD_RULES } from '@/lib/validations';
import { cn } from '@/lib/utils';

export function PasswordRequirements({ value }: { value: string }) {
  // Nothing typed yet: show the rules as a neutral checklist rather than four
  // red crosses. An empty field has not failed anything, it is just empty.
  const started = value.length > 0;

  return (
    <ul aria-live="polite" className="mt-2 flex flex-col gap-1.5">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li
            key={rule.id}
            aria-label={`${rule.label}: ${met ? 'met' : 'not met'}`}
            className={cn(
              'flex items-center gap-2 text-xs transition-colors',
              met ? 'text-lime' : started ? 'text-content-muted' : 'text-content-muted/70',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                met ? 'border-lime bg-lime/15' : 'border-line/30',
              )}
            >
              {met ? (
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              ) : (
                <Circle className="h-1 w-1 fill-current opacity-50" />
              )}
            </span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
