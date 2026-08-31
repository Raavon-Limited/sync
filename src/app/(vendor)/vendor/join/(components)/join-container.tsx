/**
 * Redeem a store invitation.
 *
 * TWO ARRIVALS, AND THE SCREEN HAS TO TELL THEM APART
 *   Someone who already has a Sync account just accepts — one RPC, and every
 *   check lives in the database. Someone who does not needs an account first,
 *   and this is the only place in the product where that can happen without a
 *   second round of email: the token in their hand was delivered to their
 *   address, which is the same proof a confirmation email would have gathered.
 *
 *   Getting this wrong in the other direction matters too. The screen never
 *   offers to set a password for an address that already has an account —
 *   that would turn a forwarded invite into a takeover of whoever owns that
 *   mailbox. `redeemInvite` refuses it server-side as well.
 *
 * THE INVITED ADDRESS IS SHOWN. These links get forwarded, and accepting as
 * the wrong person is the mistake worth spending a line of UI to prevent.
 *
 * Failure modes are the rest of the screen: expired, used, revoked, wrong
 * address, unconfirmed email. Each raises a distinct message from the database
 * or the action, and they are surfaced verbatim — a manager who cannot get in
 * needs to know which of those it is.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Store, AlertCircle, Loader2 } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { PasswordInput } from '@/components/ui/password-input';
import { useAcceptInvite } from '@/modules/storefronts/hooks';
import { previewInvite, redeemInvite, type InvitePreview } from '@/modules/storefronts/invite-actions';
import { useSession } from '@/providers/session-provider';

export function JoinContainer({ token }: { token: string | null }) {
  const router = useRouter();
  const accept = useAcceptInvite();
  const { isAuthenticated, isLoading } = useSession();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    previewInvite(token).then((p) => {
      if (live) setPreview(p);
    });
    return () => {
      live = false;
    };
  }, [token]);

  // Derived, not stored. A missing token is knowable from the props alone, and
  // writing it into state in the effect would be a render just to tell
  // ourselves something we already had.
  if (!token) {
    return (
      <Shell tone="bad" icon={<AlertCircle className="size-8" strokeWidth={1.5} />}>
        <p className="text-content font-medium">No invite token</p>
        <p className="text-content-muted text-sm">
          Open the link exactly as it was sent to you — the token is part of the address.
        </p>
      </Shell>
    );
  }

  if (!preview || isLoading) {
    return (
      <div className="border-line/10 bg-panel flex items-center justify-center rounded-2xl border p-10">
        <Spinner />
      </div>
    );
  }

  if (!preview.valid) {
    return (
      <Shell tone="bad" icon={<AlertCircle className="size-8" strokeWidth={1.5} />}>
        <p className="text-content font-medium">This invite cannot be used</p>
        <p className="text-content-muted text-sm">{preview.reason}</p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell tone="good" icon={<Check className="size-8" />}>
        <p className="text-content font-medium">You now manage {preview.storeName}</p>
        <p className="text-content-muted text-sm">
          Pick it from the store switcher in the sidebar to start working its orders.
        </p>
        <Button className="mt-1" onClick={() => router.push('/vendor/orders')}>
          Go to orders
        </Button>
      </Shell>
    );
  }

  const invited = (
    <>
      <p className="text-content font-medium">
        You have been invited to help run {preview.storeName}
      </p>
      <p className="text-content-muted text-sm">
        Invited as <span className="text-content font-medium">{preview.email}</span>
      </p>
      {preview.sections && preview.sections.length > 0 && (
        <p className="text-content-muted text-sm">
          You will be able to work: {preview.sections.join(', ')}.
        </p>
      )}
      <p className="text-content-muted text-sm">
        {/* The boundary, up front. Somebody taking on responsibility for
            another person's business should know where it stops before they
            accept, not discover it by being refused later. */}
        You will not be able to see the owner&apos;s earnings, wallet, payouts or bank details.
      </p>
    </>
  );

  // ── Already signed in: accept and be done ────────────────────────────────
  if (isAuthenticated) {
    return (
      <Shell tone="neutral" icon={<Store className="size-6" />}>
        {invited}
        <Button
          className="mt-2"
          disabled={accept.isPending}
          onClick={() => token && accept.mutate(token, { onSuccess: () => setDone(true) })}
        >
          {accept.isPending ? 'Joining…' : 'Accept invitation'}
        </Button>
        {accept.isError && <Problem>{(accept.error as Error)?.message}</Problem>}
      </Shell>
    );
  }

  // ── Has an account but is signed out ─────────────────────────────────────
  if (preview.hasAccount) {
    return (
      <Shell tone="neutral" icon={<Store className="size-6" />}>
        {invited}
        <p className="text-content-muted text-sm">
          {preview.email} already has a Sync account. Sign in, then open this link again to finish.
        </p>
        <Button asChild className="mt-1">
          <Link href={`/login?email=${encodeURIComponent(preview.email ?? '')}`}>Sign in</Link>
        </Button>
      </Shell>
    );
  }

  // ── No account: set a password and join in one step ───────────────────────
  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;

  return (
    <Shell tone="neutral" icon={<Store className="size-6" />}>
      {invited}

      <form
        className="mt-2 flex w-full flex-col gap-3 text-left"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!token || password.length < 8 || password !== confirm) return;
          setBusy(true);
          setError(null);
          const res = await redeemInvite({ token, password });
          setBusy(false);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setDone(true);
          // A full refresh, not a client push: the session cookie was set by
          // the server action and the shell has to be re-rendered with it, or
          // the sidebar renders as signed-out over a signed-in session.
          router.refresh();
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-content-muted text-xs font-semibold tracking-widest uppercase">
            Choose a password
          </span>
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            required
          />
          {tooShort && <span className="text-coral text-xs">Use at least 8 characters.</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-content-muted text-xs font-semibold tracking-widest uppercase">
            Confirm password
          </span>
          <PasswordInput
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            required
          />
          {mismatch && <span className="text-coral text-xs">Those do not match.</span>}
        </label>

        <Button
          type="submit"
          disabled={busy || password.length < 8 || password !== confirm}
          className="gap-2"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? 'Setting up…' : 'Set password and join'}
        </Button>

        <p className="text-content-muted text-xs">
          {/* Worth saying: people expect an emailed password and are briefly
              confused when there is not one. */}
          Only you will know this password — Sync never sends one by email.
        </p>
      </form>

      {error && <Problem>{error}</Problem>}
    </Shell>
  );
}

function Shell({
  tone,
  icon,
  children,
}: {
  tone: 'good' | 'bad' | 'neutral';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const skin =
    tone === 'good'
      ? 'border-lime-deep/30 bg-lime/5'
      : tone === 'bad'
        ? 'border-line/10 bg-panel'
        : 'border-line/10 bg-panel';
  const badge =
    tone === 'good'
      ? 'text-lime-deep'
      : tone === 'bad'
        ? 'text-content-muted'
        : 'bg-lime/15 text-lime-deep flex size-12 items-center justify-center rounded-xl';

  return (
    <div className={`flex flex-col items-center gap-3 rounded-2xl border p-8 text-center ${skin}`}>
      <span className={badge}>{icon}</span>
      {children}
    </div>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-coral border-coral/30 bg-coral/5 mt-1 rounded-lg border px-3 py-2 text-sm">
      {children}
    </p>
  );
}
