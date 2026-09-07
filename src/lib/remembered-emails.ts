/**
 * The addresses this device has signed in with, so nobody types theirs twice.
 *
 * WHY THIS EXISTS WHEN BROWSERS ALREADY DO IT
 *   `autocomplete="email"` hands the job to the browser, and on a laptop that
 *   works. It is the phone that does not: the PWA runs in its own storage
 *   context, a keyboard covers the field the moment it is focused, and the
 *   browser's own suggestion strip is exactly where the keyboard appears. So on
 *   the device where typing an address is most tedious, the help is least
 *   likely to arrive. This is one tap, on the page, above the fold.
 *
 * WHAT IS STORED, AND WHAT IS NOT
 *   Addresses. Nothing else, ever   no password, no token, no name. An address
 *   in localStorage is the same fact the browser's own autofill already holds
 *   and the same one printed on the screen after it is typed.
 *
 * IT IS OPT-IN, AND REVERSIBLE FROM THE SAME SCREEN
 *   A shared laptop in a hostel common room is the normal case here, not the
 *   edge one   which is why the checkbox exists, why unticking it forgets the
 *   address rather than merely not adding it, and why each remembered row can
 *   be removed on its own. Anything that only ever accumulates is a list
 *   somebody eventually wants gone and cannot get rid of.
 *
 * EVERY ACCESS IS GUARDED. Private windows, storage-blocked browsers and the
 * SSR pass all throw or have no `window`; a login screen must not fail because
 * a convenience could not be read.
 */
const KEY = 'sync.login.emails';

/** Three. A device with more than that is shared, and a list is not the fix. */
const MAX = 3;

export function rememberedEmails(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is string => typeof e === 'string' && e.includes('@'))
      .slice(0, MAX);
  } catch {
    return [];
  }
}

/** Most recent first, deduplicated case-insensitively. */
export function rememberEmail(email: string): void {
  const value = email.trim().toLowerCase();
  if (!value.includes('@')) return;
  try {
    const next = [value, ...rememberedEmails().filter((e) => e.toLowerCase() !== value)].slice(
      0,
      MAX,
    );
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked. The sign-in still worked, which is the part that matters.
  }
}

export function forgetEmail(email: string): void {
  const value = email.trim().toLowerCase();
  try {
    const next = rememberedEmails().filter((e) => e.toLowerCase() !== value);
    if (next.length) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if it could not be read in the first place.
  }
}
