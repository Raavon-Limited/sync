/**
 * ROUTE: /login
 * ACCESS: public
 * PURPOSE: Email + password login. Reached directly or via the proxy gate
 *          when a logged-out visitor clicks a protected module tab - the
 *          original destination arrives as `?next=`.
 * BUILT HERE: <LoginForm> (validated email + password) + Sign up link that
 *             preserves `next`.
 */
import type { Metadata } from 'next';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string; add?: string }>;
}) {
  const { next, email, add } = await searchParams;
  return (
    <AuthLayout eyebrow="Welcome back" title="Log in to Sync">
      {/* Set when someone tried to sign up for a business with an email that
          already has an account. Telling them here, at the point of confusion,
          beats a toast they have already navigated away from. */}
      {add === 'vendor' && (
        <p className="border-line/15 bg-surface-deep/40 text-content-muted mb-4 rounded-lg border p-3 text-sm">
          You already have an account with this email. Sign in, then choose{' '}
          <span className="text-content font-medium">Add a business account</span> from the menu
          under your avatar   one login can hold both.
        </p>
      )}
      <LoginForm next={next} email={email} />
    </AuthLayout>
  );
}
