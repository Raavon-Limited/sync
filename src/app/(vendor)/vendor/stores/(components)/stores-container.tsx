/**
 * Manage stores — branches, the people who run them, and what those people did.
 *
 * TWO AUDIENCES, ONE ROUTE
 *   Every write here (create a branch, promote a primary, invite, revoke) and
 *   both read RPCs are owner-scoped in the database, so a manager arriving here
 *   would get three empty sections and controls that refuse. Rather than hide
 *   the route — which needs the shared nav config to become role-aware — the
 *   component renders a manager view: the branch they run, and a plain
 *   statement of where their authority ends.
 */
'use client';

import { useState } from 'react';
import { Store, Plus, Star, Users, Activity, Trash2, Copy, Check, MapPinOff } from 'lucide-react';
import { CooldownControl } from './cooldown-control';
import { Button, Input, Badge } from '@/components/ui';
import { useActiveStorefront } from '@/modules/storefronts/active-storefront';
import { isStoreOpen, pauseMinutesLeft } from '@/modules/storefronts/types';
import {
  useMyStorefronts,
  useCreateStorefront,
  useSetPrimaryStorefront,
  useStorefrontRoster,
  usePendingInvites,
  useCreateInvite,
  useRevokeStaff,
  useStorefrontActivity,
} from '@/modules/storefronts/hooks';

function money(kobo?: string) {
  if (!kobo) return null;
  return `₦${(Number(kobo) / 100).toLocaleString()}`;
}

/** "listing.insert" -> "Added a listing". The feed is read by a person. */
function describe(action: string) {
  const map: Record<string, string> = {
    'listing.insert': 'Added a listing',
    'listing.update': 'Edited a listing',
    'listing.delete': 'Removed a listing',
    'storefront.insert': 'Created the store',
    'storefront.update': 'Changed store details',
    'order.insert': 'Order placed',
  };
  if (map[action]) return map[action];
  if (action.startsWith('order.update.')) return `Order → ${action.split('.').pop()}`;
  return action;
}

export function StoresContainer() {
  const { activeId, setActive, isOwner, storefronts: managed } = useActiveStorefront();
  const { data: stores = [], isLoading } = useMyStorefronts();
  const [selected, setSelected] = useState<string | null>(null);
  const branchId = selected ?? activeId ?? stores[0]?.id ?? null;

  const selectedStore = stores.find((s) => s.id === branchId) ?? null;

  const create = useCreateStorefront();
  const promote = useSetPrimaryStorefront();
  const [newName, setNewName] = useState('');
  const [newArea, setNewArea] = useState('');

  const { data: roster = [] } = useStorefrontRoster(branchId ?? undefined);
  const { data: invites = [] } = usePendingInvites(branchId ?? undefined);
  const { data: activity = [] } = useStorefrontActivity({ storefrontId: branchId ?? undefined, limit: 25 });
  const invite = useCreateInvite();
  const revoke = useRevokeStaff();
  const [inviteEmail, setInviteEmail] = useState('');
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-20 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  // A MANAGER GETS A DIFFERENT PAGE, NOT AN EMPTY ONE.
  // Every read below (roster, invites, activity) and every write (create,
  // promote, invite, revoke) is owner-scoped in the database, so a manager
  // would see three empty sections and controls that refuse. Showing them the
  // branch they actually run is both honest and more useful than hiding the
  // route, and it states the permission boundary rather than leaving them to
  // discover it by hitting an error.
  if (!isOwner) {
    return (
      <div className="flex flex-col gap-4">
        {managed.map((s) => (
          <div key={s.id} className="border-line/10 bg-panel flex flex-col gap-1 rounded-xl border p-4">
            <span className="flex items-center gap-2">
              <Store className="text-lime-deep size-4" />
              <span className="text-content font-medium">{s.name}</span>
              <Badge className="bg-blue-100 text-blue-700">You manage this</Badge>
            </span>
            {s.area ? (
              <span className="text-content-muted text-xs">{s.area}</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <MapPinOff className="size-3 shrink-0" />
                No area — students cannot find this store
              </span>
            )}
            <span className="text-content-muted text-xs">
              {/* Same three states as the owner's card. "Paused" now means a
                  cooldown, so a store switched off indefinitely has to read
                  differently from one that reopens in six minutes. */}
              {!s.isAcceptingOrders
                ? 'Closed'
                : isStoreOpen(s)
                  ? 'Accepting orders'
                  : `Paused · ${pauseMinutesLeft(s.pausedUntil)} min left`}
            </span>
          </div>
        ))}
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-4 text-sm">
          You can work this store&apos;s listings and orders. Adding stores, inviting other managers
          and the owner&apos;s earnings stay with the owner.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Branches ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-content flex items-center gap-2 text-lg font-semibold">
          <Store className="size-4" /> Your stores
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSelected(s.id);
                setActive(s.id);
              }}
              className={`border-line/10 bg-panel flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors ${
                s.id === branchId ? 'border-lime-deep/40 ring-lime-deep/20 ring-2' : 'hover:border-line/25'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-content font-medium">{s.name}</span>
                {s.isPrimary && (
                  <Badge className="bg-lime/15 text-lime-deep gap-1">
                    <Star className="size-3" /> Primary
                  </Badge>
                )}
              </span>
              {/* Not cosmetic. Discovery is location-first: a store with no
                  area is left out of the campus board and cannot be ranked by
                  distance, so students simply never see it. Nothing errors —
                  it is just absent, which is the hardest kind of bug to
                  notice from the vendor's side. */}
              {s.area ? (
                <span className="text-content-muted text-xs">{s.area}</span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <MapPinOff className="size-3 shrink-0" />
                  No area — students cannot find this store
                </span>
              )}
              <span className="text-content-muted text-xs">
                {s.coords ? 'Pinned on the map' : 'No map pin'} ·{' '}
                {/* Three states, not two. "Paused" used to mean the manual
                    switch was off; it now means a cooldown, and a store that
                    is closed indefinitely is a different thing from one that
                    reopens in six minutes. */}
                {!s.isAcceptingOrders
                  ? 'Closed'
                  : isStoreOpen(s)
                    ? 'Accepting orders'
                    : `Paused · ${pauseMinutesLeft(s.pausedUntil)} min left`}
              </span>
              {!s.isPrimary && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    promote.mutate(s.id);
                  }}
                  onKeyDown={(ev) => ev.key === 'Enter' && promote.mutate(s.id)}
                  className="text-lime-deep mt-1 text-xs underline underline-offset-2"
                >
                  Make primary
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Scoped to the selected store: a cooldown is per location, and one
            control that silently applied to whichever store was highlighted
            would be the easiest possible way to close the wrong shop. */}
        {selectedStore && <CooldownControl store={selectedStore} />}

        <form
          className="border-line/10 flex flex-wrap items-end gap-2 rounded-xl border border-dashed p-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!newName.trim()) return;
            create.mutate(
              { name: newName.trim(), area: newArea.trim() || null },
              { onSuccess: () => { setNewName(''); setNewArea(''); } },
            );
          }}
        >
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="text-content-muted text-xs">Store name</span>
            <Input value={newName} onChange={(ev) => setNewName(ev.target.value)} placeholder="Tanke store" />
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="text-content-muted text-xs">Area</span>
            <Input value={newArea} onChange={(ev) => setNewArea(ev.target.value)} placeholder="Tanke" />
          </label>
          <Button type="submit" disabled={create.isPending || !newName.trim()} className="gap-2">
            <Plus className="size-4" /> Add store
          </Button>
        </form>
        {create.isError && (
          <p className="text-coral text-xs">{(create.error as Error)?.message}</p>
        )}
      </section>

      {/* ── People ───────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-content flex items-center gap-2 text-lg font-semibold">
          <Users className="size-4" /> Who can manage this store
        </h2>

        {roster.length === 0 && invites.length === 0 && (
          <p className="text-content-muted text-sm">Only you, for now.</p>
        )}

        {roster.map((m) => (
          <div
            key={m.staffId}
            className="border-line/10 bg-panel flex items-center gap-3 rounded-xl border px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-content truncate text-sm font-medium">
                {m.fullName || m.email || 'Unknown'}
              </p>
              <p className="text-content-muted truncate text-xs">
                {m.email} · {m.role} · joined {new Date(m.joinedAt).toLocaleDateString()}
              </p>
            </div>
            {m.isActive ? (
              <Button
                variant="outline"
                className="text-coral gap-1"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(m.staffId)}
              >
                <Trash2 className="size-4" /> Revoke
              </Button>
            ) : (
              <Badge className="bg-ink/5 text-content-muted">Revoked</Badge>
            )}
          </div>
        ))}

        {invites.map((i) => (
          <div
            key={i.inviteId}
            className="border-line/10 flex items-center gap-3 rounded-xl border border-dashed px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-content truncate text-sm">{i.email}</p>
              <p className="text-content-muted text-xs">
                Invited · {i.isExpired ? 'expired' : `expires ${new Date(i.expiresAt).toLocaleDateString()}`}
              </p>
            </div>
            <Badge className="bg-ink/5 text-content-muted">Pending</Badge>
          </div>
        ))}

        <form
          className="border-line/10 flex flex-wrap items-end gap-2 rounded-xl border border-dashed p-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!branchId || !inviteEmail.trim()) return;
            invite.mutate(
              { storefrontId: branchId, email: inviteEmail.trim() },
              {
                onSuccess: (r) => {
                  setIssued(r.token);
                  setInviteEmail('');
                  setCopied(false);
                },
              },
            );
          }}
        >
          <label className="flex min-w-52 flex-1 flex-col gap-1">
            <span className="text-content-muted text-xs">Invite a manager by email</span>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(ev) => setInviteEmail(ev.target.value)}
              placeholder="manager@example.com"
            />
          </label>
          <Button type="submit" disabled={invite.isPending || !inviteEmail.trim()}>
            Send invite
          </Button>
        </form>
        {invite.isError && <p className="text-coral text-xs">{(invite.error as Error)?.message}</p>}

        {/* The token is returned exactly once and is never readable again, so it
            has to be surfaced here rather than fetched later. */}
        {issued && (
          <div className="border-lime-deep/30 bg-lime/5 flex flex-col gap-2 rounded-xl border p-4">
            <p className="text-content text-sm font-medium">Share this invite link</p>
            <p className="text-content-muted text-xs">
              It is shown once and cannot be retrieved again. It expires in 7 days and works only for
              the address you invited.
            </p>
            <div className="flex items-center gap-2">
              <code className="bg-panel text-content min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-xs">
                {`${typeof window !== 'undefined' ? window.location.origin : ''}/vendor/join?token=${issued}`}
              </code>
              <Button
                variant="outline"
                className="gap-1"
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    `${window.location.origin}/vendor/join?token=${issued}`,
                  );
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ── Activity ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-content flex items-center gap-2 text-lg font-semibold">
          <Activity className="size-4" /> Recent activity
        </h2>
        {activity.length === 0 ? (
          <p className="text-content-muted text-sm">Nothing recorded at this store yet.</p>
        ) : (
          <ol className="border-line/10 bg-panel divide-line/10 divide-y rounded-xl border">
            {activity.map((a, i) => (
              <li key={`${a.occurredAt}-${i}`} className="flex items-center gap-3 px-4 py-3">
                <Badge
                  className={
                    a.actorRole === 'owner'
                      ? 'bg-lime/15 text-lime-deep'
                      : a.actorRole === 'staff'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-ink/5 text-content-muted'
                  }
                >
                  {a.actorRole}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-content truncate text-sm">
                    {describe(a.action)}
                    {a.summary.name ? ` — ${a.summary.name}` : ''}
                  </p>
                  <p className="text-content-muted truncate text-xs">
                    {a.actorName} · {new Date(a.occurredAt).toLocaleString()}
                    {a.summary.stock ? ` · stock ${a.summary.stock}` : ''}
                    {money(a.summary.total_kobo) ? ` · ${money(a.summary.total_kobo)}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
