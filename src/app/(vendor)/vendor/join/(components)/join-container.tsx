/**
 * Redeem a store invitation.
 *
 * Acceptance is one RPC call, but the failure modes are the whole point of the
 * screen: expired, already used, revoked, wrong address, unconfirmed email.
 * Each raises a distinct message from the database, so they are surfaced
 * verbatim rather than flattened into "something went wrong" - a manager who
 * cannot get in needs to know which of those it is.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Store, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAcceptInvite } from '@/modules/storefronts/hooks';

export function JoinContainer({ token }: { token: string | null }) {
  const router = useRouter();
  const accept = useAcceptInvite();
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="border-line/10 bg-panel flex flex-col items-center gap-2 rounded-2xl border p-8 text-center">
        <AlertCircle className="text-content-muted size-8" strokeWidth={1.5} />
        <p className="text-content font-medium">No invite token</p>
        <p className="text-content-muted text-sm">
          Open the link exactly as it was sent to you - the token is part of the address.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="border-lime-deep/30 bg-lime/5 flex flex-col items-center gap-3 rounded-2xl border p-8 text-center">
        <Check className="text-lime-deep size-8" />
        <p className="text-content font-medium">You now manage this store</p>
        <p className="text-content-muted text-sm">
          Pick it from the store switcher in the sidebar to start working its orders.
        </p>
        <Button onClick={() => router.push('/vendor/orders')}>Go to orders</Button>
      </div>
    );
  }

  return (
    <div className="border-line/10 bg-panel flex flex-col items-center gap-3 rounded-2xl border p-8 text-center">
      <span className="bg-lime/15 text-lime-deep flex size-12 items-center justify-center rounded-xl">
        <Store className="size-6" />
      </span>
      <p className="text-content font-medium">You have been invited to manage a store</p>
      <p className="text-content-muted text-sm">
        Accepting lets you handle this branch&apos;s listings and orders. It does not give you access
        to the owner&apos;s earnings, wallet or bank details.
      </p>

      <Button
        className="mt-2"
        disabled={accept.isPending}
        onClick={() => accept.mutate(token, { onSuccess: () => setDone(true) })}
      >
        {accept.isPending ? 'Joining…' : 'Accept invitation'}
      </Button>

      {accept.isError && (
        <p className="text-coral border-coral/30 bg-coral/5 mt-1 rounded-lg border px-3 py-2 text-sm">
          {(accept.error as Error)?.message}
        </p>
      )}
    </div>
  );
}
