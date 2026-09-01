/**
 * Accepting a console invitation.
 *
 * THREE SCREENS, AND WHICH ONE YOU GET IS DECIDED SERVER-SIDE
 *   invalid       the token is spent, cancelled, expired or made up
 *   sign in       the address already has an account, so there is no password
 *                 to choose — they sign in and come back to accept
 *   set password  the ordinary case: no account yet, so make one
 *
 * The branch is on `preview`, which was resolved by the page with the service
 * role. A client cannot be trusted to work out which case it is in, and one
 * that guessed would guess wrong in the direction of showing a password field
 * to somebody who already has an account.
 *
 * THE FORM IS NOT THE ENFORCEMENT. `redeemStaffInvite` re-reads the token and
 * refuses everything this screen refuses, plus the ones it cannot see.
 */
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { FormField } from '@/components/forms';
import { PasswordRequirements } from '@/components/forms/password-requirements';
import {
  acceptStaffInvite,
  redeemStaffInvite,
  type StaffInvitePreview,
} from '@/modules/admin/invite-actions';

export function StaffInviteForm({
  token,
  preview,
}: {
  token: string;
  preview: StaffInvitePreview;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (!preview.valid) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-content text-sm">{preview.reason}</p>
        <p className="text-content-muted text-sm">
          Invitations last ten minutes and can only be used once. Ask whoever invited you to send a
          new one — it arrives straight away.
        </p>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Go to log in</Link>
        </Button>
      </div>
    );
  }

  /* What they are being handed. Shown on both paths — somebody should be able
     to see the shape of the job before accepting it, not after. */
  const summary = (
    <div className="border-line/15 bg-panel flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-lime-deep size-4 shrink-0" aria-hidden="true" />
        <p className="text-content text-sm font-medium">
          {preview.roleName ?? 'Console access'}
          <span className="text-content-muted font-normal"> · {preview.email}</span>
        </p>
      </div>
      {preview.areas && preview.areas.length > 0 ? (
        <ul className="text-content-muted flex flex-col gap-1 text-xs">
          {preview.areas.map((a) => (
            <li key={a} className="flex items-center gap-2">
              <CheckCircle2 className="size-3 shrink-0" aria-hidden="true" />
              {a}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-content-muted text-xs">
          No areas are open to this role yet. Whoever invited you will grant them — you will see an
          empty console until they do.
        </p>
      )}
    </div>
  );

  // Already has an account: no password to choose, so the only thing left is to
  // sign in as that address and accept.
  if (preview.hasAccount) {
    const next = `/staff-invite?token=${encodeURIComponent(token)}`;
    return (
      <div className="flex flex-col gap-4">
        {summary}
        <p className="text-content-muted text-sm">
          {preview.email} already has a Sync account. Sign in with it and this invitation is
          accepted — your existing password does not change.
        </p>
        {error && <p className="text-coral text-sm">{error}</p>}
        <Button
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await acceptStaffInvite(token);
              if (!res.ok) {
                // The usual cause is being signed in as somebody else, and the
                // database says exactly that. Offer the sign-in it needs.
                setError(res.error);
                return;
              }
              router.push(res.redirect);
              router.refresh();
            })
          }
        >
          {busy ? 'Accepting…' : 'Accept invitation'}
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link
            href={`/login?email=${encodeURIComponent(preview.email ?? '')}&next=${encodeURIComponent(next)}`}
          >
            Sign in as {preview.email}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          const res = await redeemStaffInvite({ token, password });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          router.push(res.redirect);
          router.refresh();
        });
      }}
    >
      {summary}

      <FormField label="Choose a password" htmlFor="password">
        <PasswordInput
          id="password"
          autoComplete="new-password"
          autoFocus
          placeholder="At least 8 characters"
          value={password}
          onChange={setPassword}
        />
        <PasswordRequirements value={password} />
      </FormField>

      {error && <p className="text-coral text-sm">{error}</p>}

      <Button type="submit" size="lg" className="w-full" disabled={busy || password.length < 8}>
        {busy ? 'Setting up your account…' : 'Accept and continue'}
      </Button>

      <p className="text-content-muted text-xs">
        Your account is created as {preview.email}. Nobody at Sync sees this password — it is set
        here and stored hashed, which is why the invitation carried a link rather than one we chose
        for you.
      </p>
    </form>
  );
}
