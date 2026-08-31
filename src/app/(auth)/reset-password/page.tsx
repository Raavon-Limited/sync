/**
 * ROUTE: /reset-password
 * ACCESS: whoever arrives holding a live recovery link.
 * PURPOSE: Set a new password.
 *
 * THERE IS NO TOKEN IN THIS PAGE'S CODE, AND THAT IS THE DESIGN.
 *   Supabase's recovery link establishes a session in the browser before this
 *   page renders, so "who is resetting" is the session, not a parameter we
 *   parse and trust. `completePasswordReset` calls `updateUser` against that
 *   session — it is structurally incapable of changing somebody else's
 *   password, because there is nowhere to put another person's id.
 *
 *   An expired or already-used link therefore shows up as "no session", which
 *   is the error the form reports.
 */
import type { Metadata } from 'next';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Set a new password' };

export default function Page() {
  return <ResetPasswordForm />;
}
