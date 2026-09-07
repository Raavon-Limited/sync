/**
 * Turning database and auth failures into something a person can act on.
 *
 * Server actions were returning `error.message` from Supabase straight to the
 * client, and the client was putting it in a toast. So a vendor at the end of
 * a five-step onboarding wizard was shown:
 *
 *   Could not find the function public.set_vendor_category(p_category,
 *   p_trade) in the schema cache
 *
 * and someone trying to create an account was shown:
 *
 *   Database error saving new user
 *
 * They are not developers. Neither sentence tells them anything they can do,
 * and the first leaks our schema to anyone who pokes at a form.
 *
 * WHAT THIS KEEPS AND WHAT IT REPLACES
 *   Not everything Supabase returns is jargon   "Invalid login credentials"
 *   and the messages our own RPCs `raise` are written for people, and blanket
 *   -replacing them would make every failure vaguer than it needs to be. So
 *   this rewrites the handful of messages it recognises, drops anything that
 *   reads like it came from Postgres or GoTrue's internals, and otherwise
 *   passes the message through.
 *
 * WHY THE MESSAGE IS CONSULTED BEFORE THE CODE
 *   Our SECURITY DEFINER functions raise human sentences under generic
 *   SQLSTATEs   `raise exception 'Only Sync staff can decide a verification'
 *   using errcode = '42501'`. Reading the code first would replace that with
 *   the generic 42501 text ("You do not have permission to do that"), throwing
 *   away the only sentence that said WHICH permission and why. The code mapping
 *   is therefore the fallback for when the message itself is unusable, not the
 *   first stop.
 *
 * THE DETAIL IS NOT LOST, IT MOVES. Every replaced message is logged server
 * -side first, so the thing that used to be in the user's face is still in the
 * place that can fix it.
 */

/** The shape PostgrestError, AuthError and a plain Error all satisfy. */
export interface DbErrorLike {
  message: string;
  /** SQLSTATE ('23505') from PostgREST, or a slug ('otp_expired') from GoTrue. */
  code?: string;
}

/**
 * Messages we can say better, matched on the text because the code behind them
 * is either absent or too generic to key off.
 *
 * Order matters   first match wins.
 */
import { SITE } from '@/config/site';

/**
 * The address a failure sends somebody to. Interpolated rather than typed out,
 * because it appeared verbatim in four files and an address that only shows up
 * when the product has already failed is the worst one to let drift.
 */
const HELP = SITE.support.help;

const BY_MESSAGE: [RegExp, string][] = [
  // ── Auth: signup ──────────────────────────────────────────────────────────
  // GoTrue's blanket wrapper for "a trigger on auth.users raised". The cause is
  // always ours and never the user's, so it must not read as though they typed
  // something wrong.
  [
    /database error (saving|granting|querying|finding|creating|confirming|loading|deleting)/i,
    `We could not finish setting up your account. This one is on us   please try again, and contact ${HELP} if it keeps happening.`,
  ],
  [
    /already registered|already been registered|user already exists|email address is already/i,
    'An account with this email already exists. Log in instead.',
  ],
  [
    /signups? (are )?not allowed|signup is disabled/i,
    'New signups are paused at the moment. Please try again a little later.',
  ],

  // ── Auth: credentials and codes ───────────────────────────────────────────
  [/invalid login credentials/i, 'That email and password do not match. Check them and try again.'],
  [
    /email not confirmed/i,
    'Confirm your email first   enter the code we sent you when you signed up.',
  ],
  [
    /token has expired or is invalid|otp.*expired|invalid.*otp|email link is invalid/i,
    'That code has expired or is not right. Ask for a new one and try again.',
  ],
  [
    /invalid refresh token|refresh token not found|session (from session id )?not found/i,
    'Your session has expired. Sign in again to pick up where you left off.',
  ],
  [
    /unable to validate email address/i,
    'That email address does not look right. Check it and try again.',
  ],
  [
    /password should be|weak.?password/i,
    'That password is too weak. Use at least 8 characters with a capital letter, a number and a symbol.',
  ],
  [
    /new password should be different/i,
    'That is the password you already have. Choose a different one.',
  ],

  // ── Rate limits: keep the wait, drop the jargon ───────────────────────────
  [
    /for security purposes.*after (\d+) seconds?/i,
    'You are trying that a bit too quickly. Wait a few seconds and try again.',
  ],
  [/rate limit|too many requests/i, 'Too many attempts. Wait a few minutes before trying again.'],
  [/captcha/i, 'The security check did not pass. Reload the page and try again.'],

  // ── Reaching us at all ────────────────────────────────────────────────────
  [
    /fetch failed|network (request )?failed|econnrefused|enotfound|etimedout|socket hang up|timeout/i,
    'We could not reach Sync. Check your connection and try again.',
  ],
];

/** Codes whose meaning we can state better than Postgres does. */
const BY_CODE: Record<string, string> = {
  // Raised by our own SECURITY DEFINER functions.
  '28000': 'Your session has expired. Sign in again to pick up where you left off.',
  // Only reached for a RAW permission failure   an RLS policy or a GRANT
  // refusing the write. Our own 42501 raises carry a human sentence that the
  // step above returns instead, so this must stay general: it used to say
  // "this account is not set up as a business yet", which was the right words
  // for one caller and a confusing non-sequitur for every other.
  '42501': 'You do not have permission to do that.',
  '22023': 'That option is not available. Pick another and try again.',
  P0002: 'We could not find that. It may have been removed.',
  // Postgres constraint failures.
  '23505': 'That has already been taken. Try a different one.',
  '23503': 'Something this depends on is missing. Refresh the page and try again.',
  '23502': 'Something required is missing. Fill in every field and try again.',
  '23514': 'Some of those details are not valid. Check them and try again.',
  '22P02': 'Some of those details are not in the right format. Check them and try again.',
  // GoTrue slugs, for the cases its message text is unhelpful or absent.
  unexpected_failure: `Something went wrong on our side. Please try again, and contact ${HELP} if it keeps happening.`,
  email_exists: 'An account with this email already exists. Log in instead.',
  user_already_exists: 'An account with this email already exists. Log in instead.',
  otp_expired: 'That code has expired. Ask for a new one and try again.',
  invalid_credentials: 'That email and password do not match. Check them and try again.',
  email_not_confirmed: 'Confirm your email first   enter the code we sent you when you signed up.',
  weak_password:
    'That password is too weak. Use at least 8 characters with a capital letter, a number and a symbol.',
  over_email_send_rate_limit:
    'We have sent a lot of emails to this address. Wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a few minutes before trying again.',
  signup_disabled: 'New signups are paused at the moment. Please try again a little later.',
};

/**
 * Text that betrays its origin. A message containing any of these is a
 * database talking to itself, never something to show a person.
 */
const JARGON = [
  'schema cache',
  'relation "',
  'column "',
  'schema "',
  'table "',
  'type "',
  'function public.',
  'violates',
  'constraint',
  'syntax error',
  'invalid input syntax',
  'permission denied for',
  'row-level security',
  'operator does not exist',
  'deadlock detected',
  'jwt',
  'pgrst',
  'sqlstate',
  'null value in',
  'duplicate key',
  'database error',
  'unexpected_failure',
  'internal server error',
  'stack trace',
];

function looksTechnical(message: string): boolean {
  const m = message.toLowerCase();
  return JARGON.some((needle) => m.includes(needle));
}

/**
 * The message to show.
 *
 * `fallback` should say what failed in the user's terms   "We could not save
 * your business details"   because it is what they see when the real reason is
 * unshowable. It is the only argument that has to be written per call site,
 * and it is worth writing well.
 */
export function userMessage(error: DbErrorLike, fallback: string): string {
  const raw = error.message ?? '';

  // 1. Messages we have better words for, whatever code came with them.
  for (const [pattern, replacement] of BY_MESSAGE) {
    if (pattern.test(raw)) {
      if (looksTechnical(raw)) console.error('[db]', error.code ?? '-', raw);
      return replacement;
    }
  }

  // 2. A sentence somebody wrote for a person   our own RPC raises land here.
  if (raw && !looksTechnical(raw)) return raw;

  // From here on the real reason is not showable, and this is its only copy.
  if (raw) console.error('[db]', error.code ?? '-', raw);

  // 3. What the code alone can tell us.
  const mapped = error.code ? BY_CODE[error.code] : undefined;
  if (mapped) return mapped;

  return fallback;
}

/**
 * The same, for a thrown value of unknown shape   `catch (e)` blocks and
 * anything that reaches a client component as an `Error`.
 */
export function userMessageFrom(thrown: unknown, fallback: string): string {
  if (thrown instanceof Error) {
    const code = (thrown as Error & { code?: unknown }).code;
    return userMessage(
      { message: thrown.message, code: typeof code === 'string' ? code : undefined },
      fallback,
    );
  }
  if (typeof thrown === 'string' && thrown) return userMessage({ message: thrown }, fallback);
  return fallback;
}
