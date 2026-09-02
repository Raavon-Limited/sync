/**
 * ROUTE: /forgot-password
 * ACCESS: everyone.
 * PURPOSE: Start a password reset.
 *
 * It always says the same thing whether or not the address has an account  
 * see `requestPasswordReset` for why. The success copy is therefore written to
 * be true in both cases: "if there is an account, we have sent a link", not
 * "we have sent you a link".
 */
import type { Metadata } from 'next';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Reset your password' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  // Carried over from the login form, so somebody who got as far as typing
  // their address does not type it a second time.
  return <ForgotPasswordForm initialEmail={email ?? ''} />;
}
