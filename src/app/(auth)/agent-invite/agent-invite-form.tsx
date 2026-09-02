/**
 * Setting a password and taking the agent role.
 *
 * THE PASSWORD IS CHOSEN HERE, NOT MAILED
 *   A password sent in an email sits in an inbox indefinitely, gets forwarded
 *   and gets reused elsewhere. The link is single-use and bound to the address
 *   it reached; what happens at the end of it is that the recipient picks
 *   something Sync never sees.
 *
 * AN INVALID LINK SAYS WHY
 *   Used, cancelled, expired and malformed are four different situations with
 *   four different next steps, and "this link is not valid" tells somebody
 *   standing at the end of a recruitment conversation nothing they can act on.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { PasswordInput } from '@/components/ui/password-input';
import { FormField } from '@/components/forms';
import {
  acceptAgentInvite,
  acceptAgentInviteSignedIn,
  type AgentInvitePreview,
} from '@/modules/agents/invite-actions';

export function AgentInviteForm({
  token,
  preview,
}: {
  token: string;
  preview: AgentInvitePreview;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (!preview.valid) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-content-muted text-sm">{preview.reason}</p>
        <Button asChild variant="outline">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  function join() {
    setError(null);
    startTransition(async () => {
      const res = preview.hasAccount
        ? await acceptAgentInviteSignedIn(token)
        : await acceptAgentInvite(token, password);

      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(res.redirect);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-content-muted text-sm">
        You have been invited to verify listings for Sync as <strong>{preview.email}</strong>.
        Agents visit hostels and shops, photograph what is actually there, and file what they found.
      </p>

      {/* THE ONE PIECE OF HONESTY THIS PAGE OWES THEM, before they accept: an
          agent is given people's addresses and turns up at their doors. */}
      <p className="border-line/15 bg-surface-deep text-content-muted rounded-lg border px-3 py-2 text-xs">
        Accepting gives you your own Sync ID card and the visits assigned to you. Landlords and
        vendors are told your name before you arrive.
      </p>

      {preview.hasAccount ? (
        <p className="text-content-muted text-sm">
          That address already has a Sync account. Sign in with it first, then press the button
          below.
        </p>
      ) : (
        <FormField label="Choose a password" htmlFor="agent-password" required>
          <PasswordInput
            id="agent-password"
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
          />
        </FormField>
      )}

      {error && <p className="text-coral text-sm">{error}</p>}

      <Button
        size="lg"
        disabled={busy || (!preview.hasAccount && password.length < 8)}
        onClick={join}
      >
        {busy ? 'Joining…' : 'Accept and start'}
      </Button>
    </div>
  );
}
