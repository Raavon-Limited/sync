/**
 * FormField - labelled input wrapper. Wires label ↔ control ↔ error message
 * with the right ARIA attributes. Pair with react-hook-form by spreading
 * `register('field')` onto the rendered control.
 *
 * Compose: <FormField label="Email" htmlFor="email" error={errors.email?.message}>
 *            <Input id="email" type="email" {...register('email')} />
 *          </FormField>
 */
import type { ReactNode } from 'react';
import { Label } from '@radix-ui/react-label';
import { cn } from '@/lib/utils';
import { FormError } from './form-error';

interface FormFieldProps {
  /** Visible label text. */
  label: string;
  /** Must match the rendered control's `id`. */
  htmlFor: string;
  /** Optional helper copy shown below the label. */
  hint?: string;
  /** Error message from zod / react-hook-form. */
  error?: string;
  /** The control element (Input, Textarea, Select, etc). */
  children: ReactNode;
  /** Hide the label visually but keep it for screen readers. */
  srOnlyLabel?: boolean;
  /**
   * Trailing indicator under the control - a <CharCount>, a "checking…" note.
   * Shares the footer row with the error rather than adding a line, so a field
   * does not change height the moment it goes invalid.
   */
  counter?: ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
  srOnlyLabel,
  counter,
  className,
}: FormFieldProps) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  // Described-by rather than a live region: announcing a new count on every
  // keystroke is unusable. This way a screen reader reads the remaining
  // budget when the field is focused, and on demand after that.
  const counterId = counter ? `${htmlFor}-counter` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label
        htmlFor={htmlFor}
        className={cn('text-content text-sm font-medium', srOnlyLabel && 'sr-only')}
      >
        {label}
      </Label>
      {hint && (
        <p id={hintId} className="text-content-muted text-xs">
          {hint}
        </p>
      )}
      <div aria-describedby={[errorId, hintId, counterId].filter(Boolean).join(' ') || undefined}>
        {children}
      </div>
      {(error || counter) && (
        <div className={cn('flex items-start gap-3', error ? 'justify-between' : 'justify-end')}>
          {error && <FormError id={errorId}>{error}</FormError>}
          {counter && (
            <span id={counterId} className="shrink-0 text-xs">
              {counter}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
