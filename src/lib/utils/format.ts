/**
 * Formatting helpers used across the app.
 *
 * Centralised so we can ensure consistent locale, currency symbol, and
 * date formats everywhere. Sync ships in Nigeria - default locale `en-NG`,
 * currency `NGN`.
 */
import { format, formatDistanceToNowStrict } from 'date-fns';

/**
 * Formats a number as Naira. Defaults to no decimal places (₦12,500) but
 * pass `withDecimals: true` for values that legitimately need kobo.
 */
export function formatNaira(
  amount: number,
  { withDecimals = false }: { withDecimals?: boolean } = {},
): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  }).format(amount);
}

/**
 * Kobo → Naira for display. ALL money is stored in kobo (Paystack's unit, and
 * an integer, so no float rounding), and this is the single place it converts
 * back. ₦500,000 is stored as 50_000_000 and renders "₦500,000".
 *
 * Rule of thumb: if a value came out of a `*_kobo` column, it must pass through
 * here before a user sees it. Never call formatNaira() on a kobo value.
 */
export function formatKobo(
  kobo: number,
  opts: { withDecimals?: boolean } = {},
): string {
  return formatNaira(kobo / 100, opts);
}

/** Naira → kobo, for writing to a `*_kobo` column. Rounds, so a stray float
 *  from a form can't persist as a fractional kobo. */
export function toKobo(naira: number): number {
  return Math.round(naira * 100);
}

/** Standard medium date - e.g. "12 Mar 2026". */
export function formatDate(date: Date | string | number): string {
  return format(new Date(date), 'd MMM yyyy');
}

/** "5 min ago" / "in 3 days" relative formatter. */
export function formatRelative(date: Date | string | number): string {
  return formatDistanceToNowStrict(new Date(date), { addSuffix: true });
}
