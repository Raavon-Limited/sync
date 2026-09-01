/**
 * ROUTE: /signup
 * ACCESS: public
 * PURPOSE: Account creation. Role selector (student/vendor) drives the next step - students go to /verify (OTP), vendors go to /onboarding.
 * BUILT HERE: Role radio, name/email/password, terms checkbox, submit calls modules/auth/actions.ts.
 */
import type { Metadata } from 'next';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { SignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Sign up' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  // `email` comes from /login, which has just told this visitor there is no
  // account for that address. Typing it again on the next screen is the same
  // dead end with extra steps.
  const { next, email } = await searchParams;
  return (
    <AuthLayout eyebrow="Create your account" title="Sign up to Sync">
      <SignupForm next={next} email={email} />
    </AuthLayout>
  );
}
