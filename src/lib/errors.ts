/**
 * Turning database failures into something a person can act on.
 *
 * Server actions were returning `error.message` from Supabase straight to the
 * client, and the client was putting it in a toast. So a vendor at the end of
 * a five-step onboarding wizard was shown:
 *
 *   Could not find the function public.set_vendor_category(p_category,
 *   p_trade) in the schema cache
 *
 * They are not developers. That sentence tells them nothing they can do, and
 * it leaks our schema to anyone who pokes at a form.
 *
 * WHAT THIS KEEPS AND WHAT IT REPLACES
 *   Not everything Supabase returns is jargon - "Invalid login credentials"
 *   and the messages our own RPCs `raise` are written for people, and blanket
 *   -replacing them would make every failure vaguer than it needs to be. So
 *   this maps the codes it recognises, drops anything that reads like it came
 *   from Postgres, and otherwise passes the message through.
 *
 * THE DETAIL IS NOT LOST, IT MOVES. Every replaced message is logged server
 * -side first, so the thing that used to be in the user's face is still in the
 * place that can fix it.
 */

/** The shape both PostgrestError and AuthError satisfy. */
export interface DbErrorLike {
  message: string;
  code?: string;
}

/** Codes whose meaning we can state better than Postgres does. */
const BY_CODE: Record<string, string> = {
  // Raised by our own SECURITY DEFINER functions.
  '28000': 'Your session has expired. Sign in again to pick up where you left off.',
  '42501': 'This account is not set up as a business yet.',
  '22023': 'That option is not available. Pick another and try again.',
  // Postgres constraint failures.
  '23505': 'That has already been taken. Try a different one.',
  '23503': 'Something this depends on is missing. Refresh the page and try again.',
};

/**
 * Text that betrays its origin. A message containing any of these is a
 * database talking to itself, never something to show a person.
 */
const JARGON = [
  'schema cache',
  'relation "',
  'column "',
  'function public.',
  'violates',
  'constraint',
  'syntax error',
  'permission denied for',
  'jwt',
  'pgrst',
  'null value in',
  'duplicate key',
];

function looksTechnical(message: string): boolean {
  const m = message.toLowerCase();
  return JARGON.some((needle) => m.includes(needle));
}

/**
 * The message to show. `fallback` should say what failed in the user's terms -
 * "We could not save your business details" - because it is what they see when
 * the real reason is unshowable.
 */
export function userMessage(error: DbErrorLike, fallback: string): string {
  const mapped = error.code ? BY_CODE[error.code] : undefined;
  if (mapped) return mapped;

  if (looksTechnical(error.message)) {
    // The only copy of the real reason from here on.
    console.error('[db]', error.code ?? '-', error.message);
    return fallback;
  }

  return error.message || fallback;
}
