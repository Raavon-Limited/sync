'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { Button, Input } from '@/components/ui';
import { FormField } from '@/components/forms';
import { requestPasswordReset } from '@/modules/auth/actions';

export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <AuthLayout eyebrow="Reset password" title="Check your email">
        <div className="flex flex-col items-start gap-3">
          <span className="bg-lime/15 text-lime-deep flex size-12 items-center justify-center rounded-xl">
            <MailCheck className="size-6" />
          </span>
          {/* Deliberately conditional wording. The action cannot tell us
              whether the account exists   and must not   so the copy has to be
              true either way. "We sent you a link" would be a lie half the
              time and an account-existence oracle the other half. */}
          <p className="text-content font-medium">
            If {email} has a Sync account, a reset link is on its way.
          </p>
          <p className="text-content-muted text-sm">
            The link works once and expires in 10 minutes. Nothing changes until you open it and set
            a new password.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link href={`/login?email=${encodeURIComponent(email)}`}>Back to log in</Link>
            </Button>
            <Button variant="ghost" onClick={() => setSent(false)}>
              Use a different email
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="Reset password" title="Forgot your password?">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await requestPasswordReset(email);
          setBusy(false);
          setSent(true);
        }}
      >
        <p className="text-content-muted text-sm">
          Enter the email you sign in with and we will send you a link to set a new password.
        </p>

        <FormField label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </FormField>

        <Button type="submit" size="lg" disabled={busy || !email.trim()} className="w-full">
          {busy ? 'Sending…' : 'Send reset link'}
        </Button>

        <Link
          href={`/login?email=${encodeURIComponent(email)}`}
          className="text-content-muted hover:text-content text-center text-sm"
        >
          Back to log in
        </Link>
      </form>
    </AuthLayout>
  );
}
