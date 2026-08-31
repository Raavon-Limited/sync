/**
 * CharCount - live length readout for a length-limited field.
 *
 * STATES THE BAR, THEN KEEPS COUNTING. While the field is under its minimum it
 * says what the minimum is - including when empty, so the requirement is known
 * before anyone trips over it rather than after a rejected Continue. Once the
 * minimum is met the notice drops away and the plain count carries on up to
 * the maximum.
 *
 * COUNTS WHAT THE VALIDATOR COUNTS. The schemas trim before measuring
 * (`z.string().trim().min(10)`), so this trims too. A counter that includes
 * trailing whitespace can read "10/500" beside a "too short" error, which
 * makes the form look broken rather than the input look wrong.
 *
 * Deliberately no `maxLength` on the control it describes: hard-truncating a
 * paste at 500 silently eats the tail. Better to let it overflow, colour the
 * count, and let zod refuse the submit with a message.
 */
import { cn } from '@/lib/utils';

interface CharCountProps {
  value: string;
  /** Minimum the schema enforces, if any. Shown until it is satisfied. */
  min?: number;
  max: number;
}

export function CharCount({ value, min, max }: CharCountProps) {
  const length = value.trim().length;
  const over = length > max;
  const under = min !== undefined && length < min;

  return (
    <span className={cn('tabular-nums', over ? 'text-coral' : 'text-content-muted')}>
      {under && <span className="text-content-muted">Minimum {min} characters · </span>}
      {length}/{max}
    </span>
  );
}
