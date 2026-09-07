/**
 * Everyone who can touch the business, across every store.
 *
 * WHY IT IS NOT PER STORE
 *   Membership IS per store   "manage my Tanke shop" must not also mean "manage
 *   my Gaa Akanbi shop"   but the owner's question is about a person, not a
 *   location: "who has access, and to what?". Answering that a store at a time
 *   (which is what the old section on /vendor/stores did) means an owner has to
 *   click through every store to find out whether they ever revoked somebody.
 *   So the list is by person, and the store is a column.
 *
 * OWNER ONLY, AND SAYS SO
 *   `storefront_roster`, `storefront_invites_pending` and `storefront_activity`
 *   are all owner-scoped SECURITY DEFINER functions   a manager gets empty
 *   arrays, not an error. Rendering three empty sections at them would look
 *   broken, so this states the boundary instead.
 */
'use client';

import { useMemo, useState } from 'react';
import {
  Users,
  Activity,
  Trash2,
  Clock,
  ShieldCheck,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDebounced } from '@/hooks/use-debounced';
import { useActiveStorefront } from '@/modules/storefronts/active-storefront';
import {
  useMyStorefronts,
  usePendingInvites,
  useRevokeInvite,
  useRevokeStaff,
  useSetStaffScopes,
  useStorefrontActivity,
  useStorefrontRoster,
} from '@/modules/storefronts/hooks';
import { scopeLabel, type StaffScope, type StorefrontStaffMember } from '@/modules/storefronts/types';
import { InviteDialog } from './invite-dialog';
import { ScopePicker } from './scope-picker';

const ALL = 'all';

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
    'storefront.archived': 'Archived the store',
    'storefront.restored': 'Brought the store back',
    'order.insert': 'Order placed',
    'invite.created': 'Invited someone',
    'invite.accepted': 'Joined the store',
    'invite.revoked': 'Cancelled an invite',
    'staff.revoked': 'Removed someone',
    'staff.scopes': 'Changed what someone can do',
  };
  if (map[action]) return map[action];
  if (action.startsWith('order.update.')) return `Order → ${action.split('.').pop()}`;
  return action;
}

export function TeamContainer() {
  const { isOwner, activeId } = useActiveStorefront();
  const { data: stores = [] } = useMyStorefronts();
  const [storeFilter, setStoreFilter] = useState<string>(ALL);
  const scoped = storeFilter === ALL ? undefined : storeFilter;

  const { data: roster = [], isLoading } = useStorefrontRoster(scoped);
  const { data: invites = [] } = usePendingInvites(scoped);

  // Debounced, because every keystroke is a round trip. 250ms is long enough
  // to swallow a burst of typing and short enough that the list feels live.
  const [search, setSearch] = useState('');
  const [actorId, setActorId] = useState<string>(ALL);
  const debounced = useDebounced(search, 250);
  const { data: activity = [], isFetching: activityLoading } = useStorefrontActivity({
    storefrontId: scoped,
    limit: 60,
    search: debounced,
    actorId: actorId === ALL ? undefined : actorId,
  });

  const revoke = useRevokeStaff();
  const revokeInvite = useRevokeInvite();
  const setScopes = useSetStaffScopes();

  const [revoking, setRevoking] = useState<StorefrontStaffMember | null>(null);
  const [editing, setEditing] = useState<StorefrontStaffMember | null>(null);
  const [draft, setDraft] = useState<StaffScope[]>([]);

  const active = useMemo(() => roster.filter((m) => m.isActive), [roster]);
  const past = useMemo(() => roster.filter((m) => !m.isActive), [roster]);

  if (!isOwner) {
    return (
      <div className="border-line/10 flex flex-col items-start gap-3 rounded-2xl border border-dashed p-8">
        <span className="bg-ink/5 text-content-muted flex size-11 items-center justify-center rounded-full">
          <ShieldCheck className="size-5" />
        </span>
        <p className="text-content font-display text-lg">Only the owner manages access</p>
        <p className="text-content-muted max-w-md text-sm">
          Hiring, revoking and changing what someone can reach stay with the account that owns the
          business. You can see which sections you were given on the Stores page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Who has access ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-content flex items-center gap-2 text-lg font-semibold">
            <Users className="size-4" /> Who has access
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {stores.length > 1 && (
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="h-9 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All stores</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <InviteDialog stores={stores} defaultStoreId={activeId} />
          </div>
        </div>

        {stores.length === 0 && (
          <p className="text-content-muted text-sm">
            Add a store first   access is granted per location.
          </p>
        )}

        {isLoading ? (
          <div className="bg-ink/5 h-20 animate-pulse rounded-xl" />
        ) : active.length === 0 && invites.length === 0 ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-4 text-sm">
            Only you, for now. Inviting someone lets them work the sections you pick at one store  
            never your wallet, payouts or bank details.
          </p>
        ) : null}

        {active.map((m) => (
          <div
            key={m.staffId}
            className="border-line/10 bg-panel flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
          >
            <div className="min-w-40 flex-1">
              <p className="text-content truncate text-sm font-medium">
                {m.fullName || m.email || 'Unknown'}
              </p>
              <p className="text-content-muted truncate text-xs">
                {m.email} · {m.branchName} · joined{' '}
                {new Date(m.joinedAt).toLocaleDateString()}
              </p>
              <span className="mt-1 flex flex-wrap items-center gap-1">
                {m.scopes.map((s) => (
                  <Badge key={s} className="bg-ink/5 text-content-muted">
                    {scopeLabel(s)}
                  </Badge>
                ))}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(m);
                  setDraft([...m.scopes]);
                  setScopes.reset();
                }}
              >
                Change access
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-content-muted hover:text-coral gap-1"
                onClick={() => setRevoking(m)}
              >
                <Trash2 className="size-4" /> Revoke
              </Button>
            </div>
          </div>
        ))}

        {invites.map((i) => (
          <div
            key={i.inviteId}
            className="border-line/10 flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-3"
          >
            <div className="min-w-40 flex-1">
              <p className="text-content truncate text-sm">{i.email}</p>
              <p className="text-content-muted truncate text-xs">
                {i.branchName} ·{' '}
                {i.isExpired ? 'expired' : `expires ${new Date(i.expiresAt).toLocaleDateString()}`}
              </p>
              <span className="mt-1 flex flex-wrap items-center gap-1">
                {i.scopes.map((s) => (
                  <Badge key={s} className="bg-ink/5 text-content-muted">
                    {scopeLabel(s)}
                  </Badge>
                ))}
              </span>
            </div>
            <Badge className="gap-1 bg-amber-500/10 text-amber-600">
              <Clock className="size-3" /> {i.isExpired ? 'Expired' : 'Pending'}
            </Badge>
            {/* The token stays live for the full seven days, so cancelling is
                the only way to undo a mistyped address. */}
            <Button
              variant="ghost"
              size="sm"
              className="text-content-muted hover:text-coral gap-1"
              disabled={revokeInvite.isPending}
              onClick={() => revokeInvite.mutate(i.inviteId)}
            >
              <X className="size-4" /> Cancel
            </Button>
          </div>
        ))}

        {past.length > 0 && (
          <details className="text-content-muted text-sm">
            <summary className="cursor-pointer text-xs">
              {past.length} revoked {past.length === 1 ? 'person' : 'people'}
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {past.map((m) => (
                <div
                  key={m.staffId}
                  className="border-line/10 flex items-center gap-3 rounded-xl border px-4 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {m.fullName || m.email} · {m.branchName}
                  </span>
                  <Badge className="bg-ink/5 text-content-muted">Revoked</Badge>
                </div>
              ))}
            </div>
          </details>
        )}

        {(revoke.error || revokeInvite.error) && (
          <p className="text-coral flex items-start gap-1 text-xs">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" />
            {((revoke.error ?? revokeInvite.error) as Error).message}
          </p>
        )}
      </section>

      {/* ── Activity ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-content flex items-center gap-2 text-lg font-semibold">
          <Activity className="size-4" /> Recent activity
        </h2>
        <p className="text-content-muted text-sm">
          {/* Staff are what make this necessary: once someone else changes your
              stock, "what happened at Tanke today" has to come from data rather
              than trust. */}
          What you and the people you invited have changed. Only you can see this.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-52 flex-1">
            <Search className="text-content-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              placeholder="Search a person, email or item"
              className="pl-9"
              aria-label="Search activity"
            />
          </label>

          {/* The exact-person filter, offered alongside the free text rather
              than instead of it: "everything Ada did" and "everything about
              the jollof" are different questions and both get asked. Only
              people who have actually done something are listed   a dropdown
              full of names with no events behind them is a dead end. */}
          {roster.length > 0 && (
            <Select value={actorId} onValueChange={setActorId}>
              <SelectTrigger className="h-11 w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Anyone</SelectItem>
                {roster.map((m) => (
                  <SelectItem key={m.staffId} value={m.userId}>
                    {m.fullName || m.email || 'Unknown'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(search || actorId !== ALL) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setActorId(ALL);
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {activity.length === 0 ? (
          <p className="text-content-muted text-sm">
            {debounced || actorId !== ALL
              ? 'Nothing matches that. Try a different name, email or item.'
              : 'Nothing recorded yet.'}
          </p>
        ) : (
          <ol
            className={`border-line/10 bg-panel divide-line/10 divide-y rounded-xl border transition-opacity ${
              // Dimmed rather than emptied while a search resolves   see the
              // keepPreviousData note on the hook.
              activityLoading ? 'opacity-60' : ''
            }`}
          >
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
                    {a.summary.name ? `   ${a.summary.name}` : ''}
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

      {/* ── Change access ────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(v) => !v && setRevoking(null)}
        title={`Revoke ${revoking?.fullName || revoking?.email || 'this person'}?`}
        description="They lose access to this store immediately. Their history stays on the activity log, and you can invite them again later."
        confirmLabel="Revoke"
        destructive
        loading={revoke.isPending}
        onConfirm={() => {
          if (!revoking) return;
          revoke.mutate(revoking.staffId, { onSuccess: () => setRevoking(null) });
        }}
      />

      {editing && (
        <ScopeDialog
          member={editing}
          draft={draft}
          onDraft={setDraft}
          saving={setScopes.isPending}
          error={setScopes.error as Error | null}
          onClose={() => setEditing(null)}
          onSave={() =>
            setScopes.mutate(
              { staffId: editing.staffId, scopes: draft },
              { onSuccess: () => setEditing(null) },
            )
          }
        />
      )}
    </div>
  );
}

/**
 * Kept as its own component so the picker's state resets when the owner opens
 * a different person   the `editing &&` guard above unmounts it between the
 * two, which a persistent dialog would not do.
 */
function ScopeDialog({
  member,
  draft,
  onDraft,
  saving,
  error,
  onClose,
  onSave,
}: {
  member: StorefrontStaffMember;
  draft: StaffScope[];
  onDraft: (next: StaffScope[]) => void;
  saving: boolean;
  error: Error | null;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-content">{member.fullName || member.email}</DialogTitle>
          <DialogDescription>
            At {member.branchName}. Changes apply the next time they load a page.
          </DialogDescription>
        </DialogHeader>

        <ScopePicker value={draft} onChange={onDraft} idPrefix={`staff-${member.staffId}`} />

        {error && (
          <p className="text-coral flex items-start gap-1 text-xs">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" /> {error.message}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving || draft.length === 0}>
            {saving ? 'Saving…' : 'Save access'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
