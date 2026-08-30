/**
 * Top-level error boundary. Catches runtime errors that bubble past
 * route-level error.tsx files. Never leaks the underlying error.message
 * to the user - surfaces a friendly ErrorState with a retry handler.
 *
 * NOTE: `error.tsx` must be a Client Component (Next requirement).
 */
'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: ship to a real error reporter (Sentry/Logflare) once wired.
    //
    // `digest` is set by Next only for errors thrown on the SERVER - it is the
    // hash that correlates a redacted client message with the full server log.
    // For a CLIENT-side error it is undefined, so logging it alone printed
    // "App error undefined" and threw away the only copy of the stack. That is
    // how a real crash in a realtime effect showed up as a mystery.
    //
    // In development, log the error itself: there is no server log to correlate
    // with, and hiding it helps nobody. In production keep logging only the
    // digest, so the message never reaches a user's console.
    if (process.env.NODE_ENV === 'production') {
      console.error('App error', error.digest);
    } else {
      console.error('App error', error);
    }
  }, [error]);

  return (
    <div className="bg-surface min-h-screen px-6 py-16">
      <div className="mx-auto max-w-xl">
        <ErrorState onRetry={reset} />
      </div>
    </div>
  );
}
