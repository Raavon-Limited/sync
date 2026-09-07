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
  searchParams: Promise<{ next?: string; email?: string; noaccount?: string }>;
}) {
  // Both come from /login, which sends anybody whose address has no account
  // straight here. `email` prefills the field   typing it again would be the
  // same dead end with extra steps   and `noaccount` is what lets this page
  // say why they arrived. A silent redirect onto a form nobody asked for is
  // the confusion this path exists to remove.
  const { next, email, noaccount } = await searchParams;
  return (
    <AuthLayout eyebrow="Create your account" title="Sign up to Sync">
      <SignupForm next={next} email={email} noAccount={noaccount === '1'} />
    </AuthLayout>
  );
}
