/**
 * Invite somebody to run part of a store.
 *
 * THE LINK IS SHOWN ONCE AND NEVER AGAIN.
 *   `create_storefront_invite` returns the token exactly once; there is no
 *   SELECT policy that can read it back, because the token IS the credential
 *   and anyone who could list invites could join any store. So the dialog does
 *   not close on success   it turns into the link, and the owner leaves when
 *   they have copied it.
 *
 * IT IS NOT A SECRET WORTH LESS THAN IT LOOKS: the invite is tied to the email
 * it was sent to and is redeemed against the recipient's *confirmed* address,
 * so a leaked link cannot be claimed by whoever finds it.
 */
'use client';

import { useState } from 'react';
import { UserPlus, Copy, Check, TriangleAlert } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { useCreateInvite } from '@/modules/storefronts/hooks';
import { DEFAULT_STAFF_SCOPES, type StaffScope, type Storefront } from '@/modules/storefronts/types';
import { canonicalOrigin } from '@/config/site';
import { sendInviteEmail } from '@/modules/storefronts/invite-actions';
import { ScopePicker } from './scope-picker';

export function InviteDialog({
  stores,
  defaultStoreId,
}: {
  /** Active stores only   you cannot staff one that is archived. */
  stores: Storefront[];
  defaultStoreId?: string | null;
}) {
  const invite = useCreateInvite();
  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState(defaultStoreId ?? stores[0]?.id ?? '');
  const [email, setEmail] = useState('');
  const [scopes, setScopes] = useState<StaffScope[]>([...DEFAULT_STAFF_SCOPES]);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [mailError, setMailError] = useState<string | null>(null);

  // The configured origin, not `window.location.origin`. This link is COPIED
  // and sent to another person on another device   one generated from a dev
  // machine would be a localhost address that works for nobody. It also has to
  // match the link in the email, which the server builds the same way.
  const link = issued ? `${canonicalOrigin()}/vendor/join?token=${issued}` : '';

  const reset = () => {
    setEmail('');
    setScopes([...DEFAULT_STAFF_SCOPES]);
    setIssued(null);
    setMailError(null);
    setSending(false);
    setCopied(false);
    invite.reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2" disabled={stores.length === 0}>
          <UserPlus className="size-4" /> Invite someone
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-content">
            {issued ? 'Invitation sent' : 'Invite someone to help'}
          </DialogTitle>
          <DialogDescription>
            {issued
              ? 'They can also use the link below. It is shown once and cannot be retrieved, expires in 7 days, and only works for the address you invited.'
              : 'They get the sections you tick, at the store you choose   and nothing else. Your earnings, payouts and bank details are never included.'}
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <div className="flex flex-col gap-3">
            {/* What actually happened to the email, stated. An owner who
                assumes it sent and finds out days later that it did not is the
                failure this line exists to prevent. */}
            <p className={`text-sm ${mailError ? 'text-coral' : 'text-content-muted'}`}>
              {sending
                ? `Emailing ${email || 'them'}…`
                : mailError
                  ? mailError
                  : `We emailed the invitation. They will set their own password when they open it.`}
            </p>
            <div className="flex items-center gap-2">
              <code className="bg-ink/5 text-content min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-xs">
                {link}
              </code>
              <Button
                variant="outline"
                className="shrink-0 gap-1"
                onClick={() => {
                  void navigator.clipboard?.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                Invite someone else
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!storeId || !email.trim() || scopes.length === 0) return;
              invite.mutate(
                { storefrontId: storeId, email: email.trim(), scopes },
                {
                  onSuccess: async (r) => {
                    setIssued(r.token);
                    // Delivery is separate from creation on purpose: the
                    // invite already exists and the link is on screen, so a
                    // mail failure is a note, not a rollback. The owner can
                    // always send it themselves.
                    setSending(true);
                    const res = await sendInviteEmail({
                      token: r.token,
                      email: email.trim(),
                      storeName: stores.find((s) => s.id === storeId)?.name ?? 'your store',
                      scopes,
                    });
                    setSending(false);
                    setMailError(res.ok ? null : res.error);
                  },
                },
              );
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-content-muted text-xs">Which store</span>
              {/* Membership is per store on purpose: "manage my Tanke shop"
                  must not also mean "manage my Gaa Akanbi shop". Someone who
                  runs two gets two invites. */}
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.area ? ` · ${s.area}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-content-muted text-xs">Their email</span>
              <Input
                type="email"
                required
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="manager@example.com"
              />
              <span className="text-content-muted text-xs opacity-80">
                They redeem it with this exact address, confirmed. It does not have to be an
                account yet.
              </span>
            </label>

            <ScopePicker value={scopes} onChange={setScopes} idPrefix="invite" />

            {invite.error && (
              <p className="text-coral flex items-start gap-1 text-xs">
                <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                {(invite.error as Error).message}
              </p>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={invite.isPending || !email.trim() || !storeId || scopes.length === 0}
              >
                {invite.isPending ? 'Creating…' : 'Create invite'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
