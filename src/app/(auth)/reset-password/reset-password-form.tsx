'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { Button } from '@/components/ui';
import { PasswordInput } from '@/components/ui/password-input';
import { FormField } from '@/components/forms';
import { createClient } from '@/lib/supabase/client';
import { completePasswordReset } from '@/modules/auth/actions';

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);

  // Supabase turns the recovery link's fragment into a session on load. The
  // browser client is what processes it, so the check has to happen here   the
  // server has no session until that has finished and the cookie is written.
  useEffect(() => {
    let live = true;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (live) setReady(!!data.session);
    });
    // A recovery link fires PASSWORD_RECOVERY slightly after mount on some
    // browsers, so the first read can be a false negative.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (live && session) setReady(true);
    });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);

  if (done) {
    return (
      <AuthLayout eyebrow="Reset password" title="Password updated">
        <div className="flex flex-col items-start gap-3">
          <span className="bg-lime/15 text-lime-deep flex size-12 items-center justify-center rounded-xl">
            <Check className="size-6" />
          </span>
          <p className="text-content-muted text-sm">
            You are signed in with your new password. The reset link will not work again.
          </p>
          <Button onClick={() => router.push('/')}>Continue</Button>
        </div>
      </AuthLayout>
    );
  }

  if (ready === false) {
    return (
      <AuthLayout eyebrow="Reset password" title="This link has expired">
        <p className="text-content-muted text-sm">
          Reset links last 10 minutes and work once. Request a new one and open it straight away.
        </p>
        <Button asChild className="mt-4">
          <Link href="/forgot-password">Send a new link</Link>
        </Button>
      </AuthLayout>
    );
  }

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;

  return (
    <AuthLayout eyebrow="Reset password" title="Set a new password">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 8 || password !== confirm) return;
          setBusy(true);
          setError(null);
          const res = await completePasswordReset(password);
          setBusy(false);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setDone(true);
          router.refresh();
        }}
      >
        <FormField
          label="New password"
          htmlFor="password"
          error={tooShort ? 'Use at least 8 characters.' : undefined}
        >
          <PasswordInput
            id="password"
            autoComplete="new-password"
            autoFocus
            placeholder="At least 8 characters"
            value={password}
            onChange={setPassword}
          />
        </FormField>

        <FormField
          label="Confirm password"
          htmlFor="confirm"
          error={mismatch ? 'Those do not match.' : undefined}
        >
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
          />
        </FormField>

        <Button
          type="submit"
          size="lg"
          disabled={busy || ready === null || password.length < 8 || password !== confirm}
          className="w-full"
        >
          {busy ? 'Saving…' : 'Set password'}
        </Button>

        {error && (
          <p className="text-coral border-coral/30 bg-coral/5 rounded-lg border px-3 py-2 text-sm">
            {error}
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
